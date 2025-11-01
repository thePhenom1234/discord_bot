const { SlashCommandBuilder } = require("discord.js");
const reminderUtils = require("../utils/reminderUtils");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("complete")
    .setDescription("Mark a reminder complete by ID")
    .addStringOption((opt) =>
      opt.setName("id").setDescription("Reminder ID").setRequired(true)
    ),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    try {
      const id = interaction.options.getString("id", true);
      await reminderUtils.markComplete(id, interaction.user.id);
      await interaction.editReply({ content: `✅ Marked ${id} complete.` });
    } catch (err) {
      console.error(err);
      await interaction.editReply({
        content: `Failed to complete: ${err.message}`,
      });
    }
  },
};
