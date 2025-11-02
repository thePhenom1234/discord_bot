/**
 * Discord-channel-backed reminders storage.
 *
 * Usage:
 * const db = require('./utils/db');
 * await db.init(client, CHANNEL_ID);
 * await db.add({...});
 * const all = await db.getAll();
 *
 * Notes:
 * - The bot will send a message to the configured channel every time reminders update.
 * - On init the module fetches the latest bot message in the channel and tries to restore reminders from it.
 * - Message payload length is limited by Discord message limits (~2000 chars). If you expect large data, consider using a DB or volume-backed storage.
 */

const PREFIX = "REMINDERS_DATA"; // message prefix used to identify stored data

let client = null;
let channelId = null;
let cache = [];

// Helper to fetch attachment text (works in Node 18+ with global fetch, falls back to https)
async function fetchAttachmentText(url) {
  if (typeof fetch === "function") {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to fetch attachment: " + res.status);
    return await res.text();
  }

  return await new Promise((resolve, reject) => {
    try {
      const https = require("https");
      let data = "";
      https
        .get(url, (res) => {
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => resolve(data));
        })
        .on("error", reject);
    } catch (err) {
      reject(err);
    }
  });
}

async function init(botClient, chId) {
  client = botClient;
  if (chId) channelId = chId;
  if (!channelId && process.env.REMINDERS_CHANNEL_ID)
    channelId = process.env.REMINDERS_CHANNEL_ID;
  if (!client) throw new Error("db.init: Discord client is required");
  if (!channelId)
    throw new Error(
      "db.init: channelId is required (pass to init or set REMINDERS_CHANNEL_ID env)"
    );

  await loadFromChannel();
}

async function loadFromChannel() {
  try {
    const ch = await client.channels.fetch(channelId);
    if (!ch || !ch.isTextBased || typeof ch.messages?.fetch !== "function") {
      console.error(
        "db: channel is not a text channel or cannot fetch messages"
      );
      cache = [];
      return;
    }

    const messages = await ch.messages.fetch({ limit: 100 });
    const botMessages = messages.filter(
      (m) => m.author?.id === client.user?.id
    );
    // Convert to array sorted descending by timestamp
    const botMsgsArr = Array.from(botMessages.values()).sort(
      (a, b) => b.createdTimestamp - a.createdTimestamp
    );

    // Try to find a message that contains our prefix in content OR has a reminders.json attachment
    let latest = botMsgsArr.find(
      (m) => m.content && m.content.startsWith(PREFIX)
    );
    if (!latest) {
      latest =
        botMsgsArr.find(
          (m) =>
            m.attachments &&
            Array.from(m.attachments.values()).some(
              (att) => att.name === "reminders.json"
            )
        ) || null;
    }

    if (latest) {
      // If content contains prefix, parse from content
      if (latest.content && latest.content.startsWith(PREFIX)) {
        const raw = latest.content.slice(PREFIX.length).trim();
        try {
          cache = JSON.parse(raw);
          console.log("db: restored reminders from channel message (content)");
          try {
            // If some reminders were marked delivered but are past due and not completed,
            // reset their delivered flag so they can be sent again (handles missed sends during restarts).
            const now = new Date();
            let resetCount = 0;
            for (const r of cache) {
              if (!r.completed && r.delivered && new Date(r.time) <= now) {
                r.delivered = false;
                resetCount++;
              }
            }
            if (resetCount > 0) {
              console.log(
                `db: reset delivered flag for ${resetCount} overdue reminders`
              );
              await sendUpdateMessage();
            }
          } catch (err) {
            console.error("db: error while resetting delivered flags", err);
          }
          return;
        } catch (err) {
          console.error(
            "db: failed to parse reminders JSON from message content",
            err
          );
        }
      }

      // Otherwise, try to load from attachment named reminders.json
      const att = Array.from(latest.attachments.values()).find(
        (a) => a.name === "reminders.json"
      );
      if (att && att.url) {
        try {
          const text = await fetchAttachmentText(att.url);
          cache = JSON.parse(text);
          console.log(
            "db: restored reminders from channel message (attachment)"
          );
          try {
            const now = new Date();
            let resetCount = 0;
            for (const r of cache) {
              if (!r.completed && r.delivered && new Date(r.time) <= now) {
                r.delivered = false;
                resetCount++;
              }
            }
            if (resetCount > 0) {
              console.log(
                `db: reset delivered flag for ${resetCount} overdue reminders (attachment)`
              );
              await sendUpdateMessage();
            }
          } catch (err) {
            console.error(
              "db: error while resetting delivered flags (attachment)",
              err
            );
          }
          return;
        } catch (err) {
          console.error("db: failed to fetch/parse attachment", err);
        }
      }
    }

    // nothing found => start empty
    cache = [];
    // create an initial message so future restarts can read it
    await sendUpdateMessage();
  } catch (err) {
    console.error("db.loadFromChannel error:", err);
    cache = [];
  }
}

async function sendUpdateMessage() {
  if (!client || !channelId) {
    throw new Error("db: client/channelId not initialized");
  }
  const ch = await client.channels.fetch(channelId);
  if (!ch || !ch.isTextBased || typeof ch.send !== "function") {
    throw new Error(
      "db: channel is not a text channel or cannot send messages"
    );
  }

  // Fetch recent bot messages to try editing the latest one instead of spamming new messages
  const messages = await ch.messages.fetch({ limit: 100 });
  const botMessages = messages.filter((m) => m.author?.id === client.user?.id);
  const botMsgsArr = Array.from(botMessages.values()).sort(
    (a, b) => b.createdTimestamp - a.createdTimestamp
  );
  let latest =
    botMsgsArr.find(
      (m) =>
        (m.content && m.content.startsWith(PREFIX)) ||
        (m.attachments &&
          Array.from(m.attachments.values()).some(
            (att) => att.name === "reminders.json"
          ))
    ) || null;

  const jsonStr = JSON.stringify(cache);
  const payload = PREFIX + "\n" + jsonStr;

  let resultingMessage = null;

  if (payload.length <= 1900) {
    // small enough to edit or send as content
    if (latest) {
      try {
        resultingMessage = await latest.edit({ content: payload });
      } catch (err) {
        console.warn(
          "db: failed to edit existing message, sending new one",
          err
        );
        resultingMessage = await ch.send(payload);
      }
    } else {
      resultingMessage = await ch.send(payload);
    }
  } else {
    // large payload: use attachment (reminders.json)
    const buffer = Buffer.from(JSON.stringify(cache, null, 2), "utf8");
    if (latest) {
      try {
        resultingMessage = await latest.edit({
          content: PREFIX + " (attached file)",
          files: [{ attachment: buffer, name: "reminders.json" }],
        });
      } catch (err) {
        console.warn(
          "db: failed to edit existing message with attachment, sending new one",
          err
        );
        resultingMessage = await ch.send({
          content: PREFIX + " (attached file)",
          files: [{ attachment: buffer, name: "reminders.json" }],
        });
      }
    } else {
      resultingMessage = await ch.send({
        content: PREFIX + " (attached file)",
        files: [{ attachment: buffer, name: "reminders.json" }],
      });
    }
  }

  // Clean up older bot messages that contain reminders data to avoid clutter.
  // Keep only the message we just edited/sent (resultingMessage)
  try {
    const keepId = resultingMessage?.id;
    const deletions = [];
    for (const m of botMsgsArr) {
      if (!m.id || m.id === keepId) continue;
      const hasPrefix = m.content && m.content.startsWith(PREFIX);
      const hasAttachment =
        m.attachments &&
        Array.from(m.attachments.values()).some(
          (att) => att.name === "reminders.json"
        );
      if (hasPrefix || hasAttachment) {
        deletions.push(
          m
            .delete()
            .catch((e) => console.warn("db: failed to delete old message", e))
        );
      }
    }
    await Promise.allSettled(deletions);
  } catch (err) {
    console.error("db: cleanup of old messages failed", err);
  }
}

function _findIndex(id) {
  return cache.findIndex((r) => r.id === id);
}

module.exports = {
  init,
  getAll: async () => cache,
  saveAll: async (arr) => {
    cache = Array.isArray(arr) ? arr : [];
    await sendUpdateMessage();
    return cache;
  },
  add: async (reminder) => {
    cache.push(reminder);
    await sendUpdateMessage();
    return reminder;
  },
  update: async (id, patch) => {
    const idx = _findIndex(id);
    if (idx === -1) return null;
    cache[idx] = { ...cache[idx], ...patch };
    await sendUpdateMessage();
    return cache[idx];
  },
  remove: async (id) => {
    const before = cache.length;
    cache = cache.filter((r) => r.id !== id);
    if (cache.length !== before) {
      await sendUpdateMessage();
      return true;
    }
    return false;
  },
  findById: async (id) => cache.find((r) => r.id === id) || null,
  findByUser: async (userId) => cache.filter((r) => r.userId === userId),
};
