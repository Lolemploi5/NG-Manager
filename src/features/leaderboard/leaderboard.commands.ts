import { SlashCommandBuilder } from 'discord.js';

export const leaderboardCommands = [
  new SlashCommandBuilder()
    .setName('classement')
    .setDescription('Gestion du classement hebdomadaire')
    .addSubcommand((sub) =>
      sub
        .setName('config')
        .setDescription('Configurer le classement hebdomadaire')
        .addBooleanOption((opt) =>
          opt.setName('enabled').setDescription('Activer le classement').setRequired(true)
        )
        .addChannelOption((opt) =>
          opt.setName('channel').setDescription('Salon pour le classement').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('afficher').setDescription('Afficher le classement actuel')
    ),
];

export async function handleLeaderboardCommand(interaction: any): Promise<void> {
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'config':
      await handleConfigLeaderboard(interaction);
      break;
    case 'afficher':
      await handleShowLeaderboard(interaction);
      break;
  }
}

async function handleConfigLeaderboard(interaction: any): Promise<void> {
  await interaction.reply({
    content: '⏳ Configuration du classement...',
  });
}

async function handleShowLeaderboard(interaction: any): Promise<void> {
  await interaction.reply({ content: '⏳ Chargement du classement...' });
}
