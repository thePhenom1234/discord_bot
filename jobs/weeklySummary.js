const cron = require("cron");
const db = require("../utils/db");
const { buildReminderEmbed } = require("../utils/embedBuilder");
const { EmbedBuilder } = require("discord.js");
const { timeZone, defaultSummaryChannelId } = require("../config.json");

module.exports = (client) => {
  // Cron in server local time — this library uses server time. If server is UTC, adjust or use tz option.
  // We'll schedule every Monday at 09:00 server-time. If you want timezone-specific cron, you can add tz param.
  const job = new cron.CronJob(
    "0 0 9 * * 1",
    async () => {
      try {
        const all = db.getAll();
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

        // aggregate per-user
        const byUser = {};
        for (const r of all) {
          const uid = r.userId;
          byUser[uid] = byUser[uid] || { created: 0, completed: 0 };
          if (new Date(r.createdAt) >= weekAgo) byUser[uid].created++;
          if (
            (r.history || []).some(
              (h) => h.action === "complete" && new Date(h.at) >= weekAgo
            )
          )
            byUser[uid].completed++;
        }

        // build a simple embed summary
        const embed = new EmbedBuilder()
          .setTitle("Weekly Reminders Summary")
          .setDescription(
            `Week: ${weekAgo.toDateString()} — ${now.toDateString()}`
          )
          .setTimestamp();

        let desc = "";
        for (const [uid, stats] of Object.entries(byUser)) {
          desc += `<@${uid}> — Created: **${stats.created}** • Completed: **${stats.completed}**\n`;
        }
        if (!desc) desc = "No reminders this week.";

        embed.setDescription(desc);

        if (defaultSummaryChannelId) {
          const ch = await client.channels.fetch(defaultSummaryChannelId);
          if (ch) {
            await ch.send({ embeds: [embed] });
          } else {
            console.warn("Summary channel not found.");
          }
        } else {
          // otherwise DM owners who had activity
          for (const uid of Object.keys(byUser)) {
            try {
              const user = await client.users.fetch(uid);
              await user.send({ embeds: [embed] });
            } catch (err) {
              console.warn("Failed to DM weekly summary to", uid, err.message);
            }
          }
        }
      } catch (err) {
        console.error("Weekly summary failed:", err);
      }
    },
    null,
    true,
    timeZone
  );

  job.start();
  console.log("Weekly summary job scheduled.");
  return job;
};
