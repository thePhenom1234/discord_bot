const { SlashCommandBuilder } = require("discord.js");
const db = require("../utils/db");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("summary")
    .setDescription("Get your weekly summary (completed vs created)."),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    try {
      const all = db.getAll();
      const userId = interaction.user.id;
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
      const userRems = all.filter((r) => r.userId === userId);

      const createdThisWeek = userRems.filter(
        (r) => new Date(r.createdAt) >= weekAgo
      ).length;
      const completedThisWeek = userRems.filter(
        (r) =>
          r.history &&
          r.history.some(
            (h) => h.action === "complete" && new Date(h.at) >= weekAgo
          )
      ).length;

      const streak = (() => {
        // naive: count days in last 7 where user completed at least one reminder
        const dates = new Set();
        userRems.forEach((r) => {
          (r.history || []).forEach((h) => {
            if (h.action === "complete") {
              const d = new Date(h.at);
              if (d >= weekAgo) dates.add(d.toDateString());
            }
          });
        });
        return dates.size;
      })();

      await interaction.editReply({
        content: `📊 Weekly summary for <@${userId}>:\n• Created this week: **${createdThisWeek}**\n• Completed this week: **${completedThisWeek}**\n• Active days (streak-ish): **${streak}/7**`,
      });
    } catch (err) {
      console.error(err);
      await interaction.editReply({ content: "Failed to fetch summary." });
    }
  },
};
