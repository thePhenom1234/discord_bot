const { SlashCommandBuilder } = require("discord.js");
const reminderUtils = require("../utils/reminderUtils");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("snooze")
    .setDescription("Snooze a reminder by ID")
    .addStringOption((opt) =>
      opt.setName("id").setDescription("Reminder ID").setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("minutes")
        .setDescription("Minutes to snooze for")
        .setRequired(false)
    ),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    try {
      const id = interaction.options.getString("id", true);
      const minutes = interaction.options.getInteger("minutes") || 10;
      await reminderUtils.snoozeReminder(id, minutes, interaction.user.id);
      await interaction.editReply({
        content: `🔁 Snoozed reminder ${id} for ${minutes} minute(s).`,
      });
    } catch (err) {
      console.error(err);
      await interaction.editReply({
        content: `Failed to snooze: ${err.message}`,
      });
    }
  },
};
