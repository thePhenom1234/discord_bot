const fs = require("fs");
const path = require("path");
const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  Events,
} = require("discord.js");
const { token, guildId } = require("./config.json");
const REST = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v10");
const { v4: uuidv4 } = require("uuid");

// load commands to register
const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((f) => f.endsWith(".js"));

const commands = [];
for (const file of commandFiles) {
  const cmd = require(path.join(commandsPath, file));
  commands.push(cmd.data.toJSON());
}

// register slash commands
(async () => {
  try {
    const rest = new REST.REST({ version: "10" }).setToken(token);
    if (guildId) {
      await rest.put(
        Routes.applicationGuildCommands(
          require("./config.json").clientId,
          guildId
        ),
        { body: commands }
      );
      console.log("Registered guild commands.");
    } else {
      await rest.put(
        Routes.applicationCommands(require("./config.json").clientId),
        { body: commands }
      );
      console.log(
        "Registered global commands (can take up to an hour to appear)."
      );
    }
  } catch (err) {
    console.error("Failed to register commands:", err);
  }
})();

// create client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction],
});

// attach command handlers
client.commands = new Collection();
for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
}

// interaction create
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction, client);
    } else if (interaction.isButton()) {
      // button handling for complete/snooze
      const payload = interaction.customId.split(":");
      const action = payload[0];
      const reminderId = payload[1];
      const handler = require("./utils/reminderUtils");
      if (action === "complete") {
        await handler.markComplete(reminderId, interaction.user.id);
        await interaction.update({
          content: "✅ Marked complete.",
          embeds: [],
          components: [],
        });
      } else if (action === "snooze") {
        // payload: snooze:<id>:<minutes>
        const minutes = parseInt(payload[2] || "10", 10);
        await handler.snoozeReminder(reminderId, minutes, interaction.user.id);
        await interaction.update({
          content: `🔁 Snoozed for ${minutes} minute(s).`,
          embeds: [],
          components: [],
        });
      }
    }
  } catch (err) {
    console.error("Interaction handler error:", err);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: "There was an error while executing that command!",
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: "There was an error while executing that command!",
        ephemeral: true,
      });
    }
  }
});

// when ready
client.once(Events.ClientReady, (c) => {
  console.log(`Ready as ${c.user.tag}`);
  // start background jobs
  require("./jobs/reminderScheduler")(client);
  require("./jobs/weeklySummary")(client);
});

client.login(token);
