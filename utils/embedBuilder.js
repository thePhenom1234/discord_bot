const { EmbedBuilder } = require("discord.js");

function buildReminderEmbed(reminder) {
  const embed = new EmbedBuilder()
    .setTitle(reminder.title || "Reminder")
    .setDescription(reminder.message || "⏰ Time to do the thing!")
    .addFields(
      {
        name: "When",
        value: new Date(reminder.time).toLocaleString(),
        inline: true,
      },
      { name: "Repeat", value: reminder.repeat || "none", inline: true },
      {
        name: "Tags",
        value: (reminder.tags && reminder.tags.join(", ")) || "-",
        inline: true,
      }
    )
    .setFooter({ text: `Reminder ID: ${reminder.id}` })
    .setTimestamp();
  return embed;
}

module.exports = {
  buildReminderEmbed,
};
