import { SlashCommandBuilder } from 'discord.js';

export const objectivesCommands = [
  new SlashCommandBuilder()
    .setName('objectif')
    .setDescription('Gestion des objectifs du pays')
    .addSubcommand((sub) =>
      sub
        .setName('creer')
        .setDescription('Créer un nouvel objectif')
        .addStringOption((opt) =>
          opt.setName('title').setDescription('Titre de l\'objectif').setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt
            .setName('priority')
            .setDescription('Priorité (1=Critique, 5=Faible)')
            .setRequired(true)
            .addChoices(
              { name: '⚠️ 1 - Critique', value: 1 },
              { name: '🔴 2 - Haute', value: 2 },
              { name: '🟡 3 - Moyenne', value: 3 },
              { name: '🟢 4 - Faible', value: 4 },
              { name: '⚪ 5 - Très faible', value: 5 }
            )
        )
        .addStringOption((opt) =>
          opt.setName('category').setDescription('Catégorie').setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName('description').setDescription('Description').setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName('deadline')
            .setDescription('Date limite (YYYY-MM-DD)')
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('ajouter_critere')
        .setDescription('Ajouter un critère à un objectif')
        .addStringOption((opt) =>
          opt.setName('objectif_id').setDescription('ID de l\'objectif').setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName('title').setDescription('Titre du critère').setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName('type')
            .setDescription('Type de critère')
            .setRequired(true)
            .addChoices(
              { name: '🏗️ Construction', value: 'BUILD' },
              { name: '📦 Objet/Item', value: 'ITEM' },
              { name: '📊 Niveau', value: 'LEVEL' },
              { name: '❓ Autre', value: 'OTHER' }
            )
        )
        .addIntegerOption((opt) =>
          opt.setName('target').setDescription('Objectif chiffré').setRequired(false)
        )
        .addStringOption((opt) =>
          opt.setName('unit').setDescription('Unité (ex: kg, unités)').setRequired(false)
        )
        .addStringOption((opt) =>
          opt.setName('notes').setDescription('Notes additionnelles').setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('liste')
        .setDescription('Lister les objectifs')
        .addStringOption((opt) =>
          opt
            .setName('status')
            .setDescription('Filtrer par statut')
            .setRequired(false)
            .addChoices(
              { name: 'Actifs', value: 'ACTIVE' },
              { name: 'Complétés', value: 'COMPLETED' },
              { name: 'Annulés', value: 'CANCELLED' }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('voir')
        .setDescription('Voir les détails d\'un objectif')
        .addStringOption((opt) =>
          opt.setName('objectif_id').setDescription('ID de l\'objectif').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('dashboard').setDescription('Afficher le tableau de bord des objectifs')
    ),
];

export async function handleObjectivesCommand(interaction: any): Promise<void> {
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'creer':
      await handleCreateObjective(interaction);
      break;
    case 'ajouter_critere':
      await handleAddCriterion(interaction);
      break;
    case 'liste':
      await handleListObjectives(interaction);
      break;
    case 'voir':
      await handleViewObjective(interaction);
      break;
    case 'dashboard':
      await handleDashboard(interaction);
      break;
  }
}

async function handleCreateObjective(interaction: any): Promise<void> {
  await interaction.reply({ content: '⏳ Création de l\'objectif...' });
  // Implementation in objectives.service.ts
}

async function handleAddCriterion(interaction: any): Promise<void> {
  await interaction.reply({ content: '⏳ Ajout du critère...' });
}

async function handleListObjectives(interaction: any): Promise<void> {
  await interaction.reply({ content: '⏳ Chargement de la liste...' });
}

async function handleViewObjective(interaction: any): Promise<void> {
  await interaction.reply({ content: '⏳ Chargement des détails...' });
}

async function handleDashboard(interaction: any): Promise<void> {
  await interaction.reply({ content: '⏳ Génération du tableau de bord...' });
}
