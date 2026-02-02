import { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, MessageFlags, ChannelType } from 'discord.js';
import { GuildConfig } from '../../db/models/GuildConfig';
import { ObjectivesService } from './objectives.service';
import { logger } from '../../utils/logger';

export const objectivesCommands = [
  new SlashCommandBuilder()
    .setName('objectif')
    .setDescription('Gestion des objectifs du pays')
    .addSubcommand((sub) =>
      sub
        .setName('creer')
        .setDescription('Créer un nouvel objectif (Chef/Cadres uniquement)')
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
        .addStringOption((opt) =>
          opt
            .setName('categorie')
            .setDescription('Filtrer par catégorie')
            .setRequired(false)
            .addChoices(
              { name: '💰 Économie', value: 'Économie' },
              { name: '🏗️ Build', value: 'Build' },
              { name: '🌾 Farm', value: 'Farm' },
              { name: '🔬 R&D', value: 'R&D' },
              { name: '⚔️ Militaire/Diplomatie', value: 'Militaire/Diplomatie' }
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
  try {
    const guild = interaction.guild;
    const member = interaction.member;

    if (!guild || !member) {
      await interaction.reply({ content: '❌ Cette commande doit être utilisée sur un serveur.', flags: 64 });
      return;
    }

    // Vérifier les permissions (Chef ou Cadre)
    const config = await GuildConfig.findOne({ guildId: guild.id });
    if (!config) {
      await interaction.reply({ content: '❌ Configuration du serveur non trouvée. Utilisez `/setup` d\'abord.', flags: 64 });
      return;
    }

    const isChefOrOfficer = member.roles.cache.has(config.roles.chefRoleId) || 
                            member.roles.cache.has(config.roles.officerRoleId);
    
    if (!isChefOrOfficer) {
      await interaction.reply({ content: '❌ Seuls le Chef et les Cadres peuvent créer des objectifs.', flags: 64 });
      return;
    }

    // Afficher le modal de création
    const modal = createObjectiveModal();
    await interaction.showModal(modal);
  } catch (error) {
    logger.error(`Erreur lors de la création d'objectif: ${error}`);
    await interaction.reply({ content: '❌ Erreur lors de la création de l\'objectif.', flags: 64 });
  }
}

async function handleListObjectives(interaction: any): Promise<void> {
  await interaction.deferReply();

  try {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.editReply('❌ Cette commande doit être utilisée sur un serveur.');
      return;
    }

    const status = interaction.options.getString('status');
    const category = interaction.options.getString('categorie');

    logger.info(`Récupération des objectifs pour guild ${guild.id} avec filters: status=${status}, category=${category}`);
    
    const objectives = await ObjectivesService.getObjectives(guild.id, { status, category });

    logger.info(`${objectives.length} objectif(s) trouvé(s)`);

    if (objectives.length === 0) {
      await interaction.editReply('❌ Aucun objectif trouvé avec ces critères.');
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('📋 Liste des objectifs')
      .setDescription(`Total: ${objectives.length} objectif(s)`)
      .addFields(
        objectives.slice(0, 10).map((obj) => {
          const priorityEmoji = ['⚠️', '🔴', '🟡', '🟢', '⚪'][obj.priority - 1];
          const statusEmoji = obj.status === 'ACTIVE' ? '🔄' : obj.status === 'COMPLETED' ? '✅' : '❌';
          const progress = ObjectivesService.calculateProgress(obj);
          
          return {
            name: `${priorityEmoji} ${obj.title}`,
            value: `${statusEmoji} **${obj.category}** • Progression: ${progress}%\nID: \`${obj.objectiveId}\``,
            inline: false,
          };
        })
      )
      .setTimestamp();

    if (objectives.length > 10) {
      embed.setFooter({ text: 'Affichage limité à 10 objectifs' });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error(`Erreur lors de la liste des objectifs: ${error}`);
    if (error instanceof Error) {
      logger.error(`Stack: ${error.stack}`);
    }
    await interaction.editReply('❌ Erreur lors du chargement des objectifs.');
  }
}

async function handleViewObjective(interaction: any): Promise<void> {
  await interaction.deferReply();

  try {
    const objectiveId = interaction.options.getString('objectif_id');
    const objective = await ObjectivesService.getObjectiveById(objectiveId);

    if (!objective) {
      await interaction.editReply('❌ Objectif non trouvé.');
      return;
    }

    const embed = await ObjectivesService.createObjectiveEmbed(objective);
    const buttons = ObjectivesService.createObjectiveButtons(objective);

    await interaction.editReply({ embeds: [embed], components: buttons });
  } catch (error) {
    logger.error(`Erreur lors de l'affichage de l'objectif: ${error}`);
    await interaction.editReply('❌ Erreur lors du chargement de l\'objectif.');
  }
}

async function handleDashboard(interaction: any): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.editReply('❌ Cette commande doit être utilisée sur un serveur.');
      return;
    }

    const config = await GuildConfig.findOne({ guildId: guild.id });
    if (!config) {
      await interaction.editReply('❌ Configuration non trouvée.');
      return;
    }

    // Récupérer le salon objectifs
    const objectivesChannel = await guild.channels.fetch(config.channels.objectivesChannelId);
    if (!objectivesChannel || objectivesChannel.type !== ChannelType.GuildText) {
      await interaction.editReply('❌ Salon objectifs non trouvé.');
      return;
    }

    // Générer l'embed du dashboard
    const embed = await ObjectivesService.generateDashboardEmbed(guild.id);
    
    // Chercher le dernier message du dashboard dans le salon
    const messages = await objectivesChannel.messages.fetch({ limit: 10 });
    let dashboardMessage = null;

    for (const message of messages.values()) {
      if (message.embeds.length > 0 && message.embeds[0].title === '📊 Dashboard des Objectifs') {
        dashboardMessage = message;
        break;
      }
    }

    if (dashboardMessage) {
      // Mettre à jour le message existant
      await dashboardMessage.edit({ embeds: [embed] });
      await interaction.editReply('✅ Dashboard mis à jour!');
      logger.info(`Dashboard mis à jour pour la guild ${guild.id}`);
    } else {
      // Créer un nouveau message
      await objectivesChannel.send({ embeds: [embed] });
      await interaction.editReply('✅ Dashboard créé et affiché dans le salon objectifs!');
      logger.info(`Nouveau dashboard créé pour la guild ${guild.id}`);
    }
  } catch (error) {
    logger.error(`Erreur lors de la génération du dashboard: ${error}`);
    if (error instanceof Error) {
      logger.error(`Stack: ${error.stack}`);
    }
    await interaction.editReply('❌ Erreur lors de la génération du dashboard.');
  }
}

export function createObjectiveModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId('objective_create')
    .setTitle('Créer un objectif')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('objective_title')
          .setLabel('Titre de l\'objectif')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex: Construire la Grande Bibliothèque')
          .setRequired(true)
          .setMaxLength(100)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('objective_description')
          .setLabel('Description')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Description détaillée de l\'objectif...')
          .setRequired(false)
          .setMaxLength(500)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('objective_category')
          .setLabel('Catégorie')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Économie, Build, Farm, R&D, Militaire/Diplomatie')
          .setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('objective_priority')
          .setLabel('Priorité (1=Critique, 5=Très faible)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('1 à 5')
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(1)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('objective_deadline')
          .setLabel('Date limite (YYYY-MM-DD) - Optionnel')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('2026-02-28')
          .setRequired(false)
      )
    );
}

export function createCriterionModal(objectiveId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`criterion_add_${objectiveId}`)
    .setTitle('Ajouter un critère')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('criterion_title')
          .setLabel('Titre du critère')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex: Récolter du bois')
          .setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('criterion_type')
          .setLabel('Type (BUILD/ITEM/LEVEL/MONEY/RESOURCE)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex: RESOURCE')
          .setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('criterion_target')
          .setLabel('Objectif chiffré')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex: 1000')
          .setRequired(false)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('criterion_unit')
          .setLabel('Unité')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex: kg, unités, blocs...')
          .setRequired(false)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('criterion_notes')
          .setLabel('Notes (optionnel)')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Notes additionnelles...')
          .setRequired(false)
      )
    );
}

export function createContributionModal(objectiveId: string, criterionId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`contribution_add_${objectiveId}_${criterionId}`)
    .setTitle('Contribuer à un critère')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('contribution_amount')
          .setLabel('Quantité')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex: 100')
          .setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('contribution_message')
          .setLabel('Message (optionnel)')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Détails sur votre contribution...')
          .setRequired(false)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('contribution_proof')
          .setLabel('Lien preuve (screenshot) - Optionnel')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('https://imgur.com/...')
          .setRequired(false)
      )
    );
}
