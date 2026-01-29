import { SlashCommandBuilder } from 'discord.js';

export const ministryCommands = [
  new SlashCommandBuilder()
    .setName('poste')
    .setDescription('Gestion des postes ministériels')
    .addSubcommand((sub) =>
      sub
        .setName('creer')
        .setDescription('Créer un nouveau poste')
        .addStringOption((opt) =>
          opt.setName('name').setDescription('Nom du poste').setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName('emoji').setDescription('Emoji du poste').setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('assigner')
        .setDescription('Assigner un membre à un poste')
        .addStringOption((opt) =>
          opt.setName('poste_id').setDescription('ID du poste').setRequired(true)
        )
        .addUserOption((opt) =>
          opt.setName('user').setDescription('Membre à assigner').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('retirer')
        .setDescription('Retirer un membre d\'un poste')
        .addStringOption((opt) =>
          opt.setName('poste_id').setDescription('ID du poste').setRequired(true)
        )
        .addUserOption((opt) =>
          opt.setName('user').setDescription('Membre à retirer').setRequired(true)
        )
    )
    .addSubcommand((sub) => sub.setName('liste').setDescription('Lister tous les postes')),
  new SlashCommandBuilder()
    .setName('organigramme')
    .setDescription('Afficher l\'organigramme du pays'),
];

export async function handleMinistryCommand(interaction: any): Promise<void> {
  const commandName = interaction.commandName;

  if (commandName === 'organigramme') {
    await handleOrganigramme(interaction);
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'creer':
      await handleCreatePost(interaction);
      break;
    case 'assigner':
      await handleAssignPost(interaction);
      break;
    case 'retirer':
      await handleRemovePost(interaction);
      break;
    case 'liste':
      await handleListPosts(interaction);
      break;
  }
}

async function handleCreatePost(interaction: any): Promise<void> {
  await interaction.reply({ content: '⏳ Création du poste...' });
}

async function handleAssignPost(interaction: any): Promise<void> {
  await interaction.reply({ content: '⏳ Assignation du membre...' });
}

async function handleRemovePost(interaction: any): Promise<void> {
  await interaction.reply({ content: '⏳ Retrait du membre...' });
}

async function handleListPosts(interaction: any): Promise<void> {
  await interaction.reply({ content: '⏳ Chargement des postes...' });
}

async function handleOrganigramme(interaction: any): Promise<void> {
  await interaction.reply({ content: '⏳ Génération de l\'organigramme...' });
}
