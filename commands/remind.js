const { SlashCommandBuilder } = require("discord.js");
const reminderUtils = require("../utils/reminderUtils");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("remind")
    .setDescription("Create a reminder")
    .addStringOption((opt) =>
      opt
        .setName("when")
        .setDescription('When to remind (ISO, natural text like "in 1h" is OK)')
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("title")
        .setDescription("Title of reminder")
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt
        .setName("message")
        .setDescription("Reminder message")
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt
        .setName("repeat")
        .setDescription("Repeat: none/daily/weekly/monthly")
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt
        .setName("tags")
        .setDescription("Comma separated tags")
        .setRequired(false)
    ),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    try {
      const when = interaction.options.getString("when", true);
      const title = interaction.options.getString("title");
      const message = interaction.options.getString("message");
      const repeat = (
        interaction.options.getString("repeat") || "none"
      ).toLowerCase();
      const tagsRaw = interaction.options.getString("tags");
      const tags = tagsRaw
        ? tagsRaw
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

      // parse 'when' — try ISO, else try 'in X' using human-interval
      let timeIso;
      if (/^\d{4}-\d{2}-\d{2}/.test(when)) {
        timeIso = new Date(when).toISOString();
      } else {
        // try natural like "in 20 minutes"
        const humanInterval = require("human-interval");
        const ms = humanInterval(when);
        if (ms) {
          timeIso = new Date(Date.now() + ms).toISOString();
        } else {
          // fallback: try Date parse
          const parsed = new Date(when);
          if (!isNaN(parsed)) timeIso = parsed.toISOString();
        }
      }
      if (!timeIso) {
        await interaction.editReply({
          content:
            'Could not parse the `when` value. Use ISO (2025-11-01T15:00), or natural like "in 30 minutes".',
        });
        return;
      }

      const reminder = await reminderUtils.createReminder({
        userId: interaction.user.id,
        channelId: interaction.channelId,
        timeIso,
        title,
        message,
        repeat,
        tags,
      });

      await interaction.editReply({
        content: `✅ Reminder created (ID: ${
          reminder.id
        }). I will remind you at ${new Date(reminder.time).toLocaleString()}.`,
      });
    } catch (err) {
      console.error(err);
      await interaction.editReply({ content: "Failed to create reminder." });
    }
  },
};
