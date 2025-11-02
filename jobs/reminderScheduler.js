const cron = require("cron");
const reminderUtils = require("../utils/reminderUtils");
const { buildReminderEmbed } = require("../utils/embedBuilder");
const db = require("../utils/db");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

module.exports = (client) => {
  // check every 30 seconds using cron (or you can use setInterval)
  const job = new cron.CronJob("*/30 * * * * *", async () => {
    console.log("📋 Checking for due reminders...");
    const now = new Date();
    const due = await reminderUtils.getDueReminders(now);
    console.log(`Found ${due?.length || 0} due reminders`);
    if (!due || !due.length) return;

    for (const rem of due) {
      try {
        // where to send? attempt direct message first, else same channel
        let target;
        try {
          const user = await client.users.fetch(rem.userId);
          target = await user.createDM();
        } catch (err) {
          // fallback to guild channel
          if (rem.channelId) {
            const ch = await client.channels.fetch(rem.channelId);
            if (ch) target = ch;
          }
        }
        if (!target) continue;

        const embed = buildReminderEmbed(rem);
        const buttons = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`complete:${rem.id}`)
            .setLabel("✅ Complete")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`snooze:${rem.id}:10`)
            .setLabel("🔁 Snooze 10m")
            .setStyle(ButtonStyle.Secondary)
        );

        // send
        const sent = await target.send({
          embeds: [embed],
          components: [buttons],
        });

        // mark as delivered and update history
        rem.history = rem.history || [];
        rem.history.push({
          at: new Date().toISOString(),
          action: "delivered",
          messageId: sent.id,
        });
        rem.delivered = true; // Mark as delivered so it won't be sent again
        await db.update(rem.id, rem);

        // If not repeating and not interacted with, we will leave it; user must press complete to mark done,
        // or our system can mark auto-complete after some time. For simplicity, we keep it pending until user completes.
      } catch (err) {
        console.error("Failed to send reminder", rem.id, err);
      }
    }
  });

  job.start();
  console.log("Reminder scheduler started.");
  return job;
};
