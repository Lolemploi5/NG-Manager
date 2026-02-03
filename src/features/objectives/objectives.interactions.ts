import { ButtonInteraction, ModalSubmitInteraction, EmbedBuilder, MessageFlags, ChannelType, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { GuildConfig } from '../../db/models/GuildConfig';
import { ObjectivesService } from './objectives.service';
import { createCriterionModal, createContributionModal } from './objectives.commands';
import { logger } from '../../utils/logger';

export async function handleObjectiveButton(interaction: ButtonInteraction): Promise<void> {
  const customId = interaction.customId;

  if (customId.startsWith('objective_add_criterion_')) {
    await handleAddCriterionButton(interaction);
  } else if (customId.startsWith('objective_contribute_')) {
    await handleContributeButton(interaction);
  } else if (customId.startsWith('objective_approve_')) {
    await handleApproveContribution(interaction);
  } else if (customId.startsWith('objective_reject_')) {
    await handleRejectContribution(interaction);
  } else if (customId.startsWith('objective_view_contributions_')) {
    await handleViewContributions(interaction);
  } else {
    await interaction.reply({ content: '❌ Action non reconnue.', flags: MessageFlags.Ephemeral });
  }
}

export async function handleObjectiveModal(interaction: ModalSubmitInteraction): Promise<void> {
  const customId = interaction.customId;

  if (customId === 'objective_create') {
    await handleCreateObjectiveModal(interaction);
  } else if (customId.startsWith('criterion_add_')) {
    await handleAddCriterionModal(interaction);
  } else if (customId.startsWith('contribution_add_')) {
    await handleContributionModal(interaction);
  } else {
    await interaction.reply({ content: '❌ Modal non reconnu.', flags: MessageFlags.Ephemeral });
  }
}

async function handleCreateObjectiveModal(interaction: ModalSubmitInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.editReply('❌ Erreur: serveur non trouvé.');
      return;
    }

    const title = interaction.fields.getTextInputValue('objective_title');
    const description = interaction.fields.getTextInputValue('objective_description');
    const categoryInput = interaction.fields.getTextInputValue('objective_category');
    const priorityInput = interaction.fields.getTextInputValue('objective_priority');
    const deadlineInput = interaction.fields.getTextInputValue('objective_deadline');

    // Valider la catégorie
    const validCategories = ['Économie', 'Build', 'Farm', 'R&D', 'Militaire/Diplomatie'];
    const category = validCategories.find(c => c.toLowerCase() === categoryInput.toLowerCase());
    
    if (!category) {
      await interaction.editReply(`❌ Catégorie invalide. Utilisez: ${validCategories.join(', ')}`);
      return;
    }

    // Valider la priorité
    const priority = parseInt(priorityInput);
    if (isNaN(priority) || priority < 1 || priority > 5) {
      await interaction.editReply('❌ La priorité doit être entre 1 et 5.');
      return;
    }

    // Valider la deadline si fournie
    let deadline: Date | undefined;
    if (deadlineInput) {
      deadline = new Date(deadlineInput);
      if (isNaN(deadline.getTime())) {
        await interaction.editReply('❌ Format de date invalide. Utilisez YYYY-MM-DD.');
        return;
      }
    }

    // Récupérer la config pour le salon
    const config = await GuildConfig.findOne({ guildId: guild.id });
    if (!config) {
      await interaction.editReply('❌ Configuration non trouvée.');
      return;
    }

    // Créer l'objectif
    const objective = await ObjectivesService.createObjective({
      guildId: guild.id,
      title,
      description,
      category,
      priority,
      deadline,
      createdBy: interaction.user.id,
      status: 'ACTIVE',
    });

    // Envoyer le message dans le salon objectifs
    try {
      const objectivesChannel = await guild.channels.fetch(config.channels.objectivesChannelId);
      if (objectivesChannel && objectivesChannel.type === ChannelType.GuildText) {
        const embed = await ObjectivesService.createObjectiveEmbed(objective);
        const buttons = ObjectivesService.createObjectiveButtons(objective);
        
        const message = await objectivesChannel.send({ embeds: [embed], components: buttons });
        
        // Sauvegarder le messageId
        objective.messageId = message.id;
        objective.channelId = objectivesChannel.id;
        await objective.save();

        // Mettre à jour le dashboard automatiquement
        await ObjectivesService.updateDashboardMessage(guild.id, (global as any).client);
      }
    } catch (error) {
      logger.error(`Erreur lors de l'envoi du message d'objectif: ${error}`);
    }

    await interaction.editReply(`✅ Objectif créé avec succès!\n**ID:** \`${objective.objectiveId}\``);
  } catch (error) {
    logger.error(`Erreur lors de la création de l'objectif: ${error}`);
    await interaction.editReply('❌ Erreur lors de la création de l\'objectif.');
  }
}

async function handleAddCriterionButton(interaction: ButtonInteraction): Promise<void> {
  try {
    const guild = interaction.guild;
    const member = interaction.member;

    if (!guild || !member) {
      await interaction.reply({ content: '❌ Erreur: serveur ou membre non trouvé.', flags: MessageFlags.Ephemeral });
      return;
    }

    // Vérifier les permissions (Chef ou Cadre)
    const config = await GuildConfig.findOne({ guildId: guild.id });
    if (!config) {
      await interaction.reply({ content: '❌ Configuration non trouvée.', flags: MessageFlags.Ephemeral });
      return;
    }

    const isChefOrOfficer = (member.roles as any).cache.has(config.roles.chefRoleId) || 
                            (member.roles as any).cache.has(config.roles.officerRoleId);
    
    if (!isChefOrOfficer) {
      await interaction.reply({ content: '❌ Seuls le Chef et les Cadres peuvent ajouter des critères.', flags: MessageFlags.Ephemeral });
      return;
    }

    const objectiveId = interaction.customId.replace('objective_add_criterion_', '');
    const modal = createCriterionModal(objectiveId);
    await interaction.showModal(modal);
  } catch (error) {
    logger.error(`Erreur lors de l'ouverture du modal de critère: ${error}`);
    await interaction.reply({ content: '❌ Erreur lors de l\'ouverture du formulaire.', flags: MessageFlags.Ephemeral });
  }
}

async function handleAddCriterionModal(interaction: ModalSubmitInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const objectiveId = interaction.customId.replace('criterion_add_', '');
    
    const title = interaction.fields.getTextInputValue('criterion_title');
    const typeInput = interaction.fields.getTextInputValue('criterion_type').toUpperCase();
    const targetInput = interaction.fields.getTextInputValue('criterion_target');
    const unit = interaction.fields.getTextInputValue('criterion_unit');
    const notes = interaction.fields.getTextInputValue('criterion_notes');

    // Valider le type
    const validTypes = ['BUILD', 'ITEM', 'LEVEL', 'MONEY', 'RESOURCE', 'OTHER'];
    if (!validTypes.includes(typeInput)) {
      await interaction.editReply(`❌ Type invalide. Utilisez: ${validTypes.join(', ')}`);
      return;
    }

    // Valider la target
    let targetNumber: number | undefined;
    if (targetInput) {
      targetNumber = parseFloat(targetInput);
      if (isNaN(targetNumber) || targetNumber <= 0) {
        await interaction.editReply('❌ L\'objectif chiffré doit être un nombre positif.');
        return;
      }
    }

    const criterionData = {
      title,
      type: typeInput,
      targetNumber,
      unit: unit || undefined,
      notes: notes || undefined,
    };

    const objective = await ObjectivesService.addCriterion(objectiveId, criterionData);

    // Mettre à jour le message dans le salon
    await updateObjectiveMessage(objective);
    // Mettre à jour le dashboard
    await ObjectivesService.updateDashboardMessage(interaction.guildId!, (global as any).client);
    await interaction.editReply(`✅ Critère ajouté avec succès!\n**Titre:** ${title}`);
  } catch (error) {
    logger.error(`Erreur lors de l'ajout du critère: ${error}`);
    await interaction.editReply('❌ Erreur lors de l\'ajout du critère.');
  }
}

async function handleContributeButton(interaction: ButtonInteraction): Promise<void> {
  try {
    const parts = interaction.customId.split('_');
    const objectiveId = parts[2];
    const criterionId = parts[3];

    const modal = createContributionModal(objectiveId, criterionId);
    await interaction.showModal(modal);
  } catch (error) {
    logger.error(`Erreur lors de l'ouverture du modal de contribution: ${error}`);
    await interaction.reply({ content: '❌ Erreur lors de l\'ouverture du formulaire.', flags: MessageFlags.Ephemeral });
  }
}

async function handleContributionModal(interaction: ModalSubmitInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const parts = interaction.customId.split('_');
    const objectiveId = parts[2];
    const criterionId = parts[3];

    const amountInput = interaction.fields.getTextInputValue('contribution_amount');
    const message = interaction.fields.getTextInputValue('contribution_message');
    const proofUrl = interaction.fields.getTextInputValue('contribution_proof');

    const amount = parseFloat(amountInput);
    if (isNaN(amount) || amount <= 0) {
      await interaction.editReply('❌ La quantité doit être un nombre positif.');
      return;
    }

    const result = await ObjectivesService.addContribution(
      objectiveId,
      criterionId,
      interaction.user.id,
      interaction.user.username,
      amount,
      message || undefined,
      proofUrl || undefined
    );

    // Récupérer la config pour envoyer la notification
    const config = await GuildConfig.findOne({ guildId: interaction.guild?.id });
    if (config) {
      await sendContributionNotification(interaction, result, config);
      
      // Mettre à jour le dashboard
      await ObjectivesService.updateDashboardMessage(interaction.guildId!, (global as any).client);
    }

    await interaction.editReply(`✅ Contribution soumise avec succès!\n**Quantité:** ${amount}\n\nVotre contribution sera validée par un Chef ou Cadre.`);
  } catch (error) {
    logger.error(`Erreur lors de la soumission de la contribution: ${error}`);
    await interaction.editReply('❌ Erreur lors de la soumission de la contribution.');
  }
}

async function handleApproveContribution(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const guild = interaction.guild;
    const member = interaction.member;

    if (!guild || !member) {
      await interaction.editReply('❌ Erreur: serveur ou membre non trouvé.');
      return;
    }

    // Vérifier les permissions
    const config = await GuildConfig.findOne({ guildId: guild.id });
    if (!config) {
      await interaction.editReply('❌ Configuration non trouvée.');
      return;
    }

    const isChefOrOfficer = (member.roles as any).cache.has(config.roles.chefRoleId) || 
                            (member.roles as any).cache.has(config.roles.officerRoleId);
    
    if (!isChefOrOfficer) {
      await interaction.editReply('❌ Seuls le Chef et les Cadres peuvent valider des contributions.');
      return;
    }

    const parts = interaction.customId.split('_');
    const objectiveId = parts[2];
    const contributionId = parts[3];

    const objective = await ObjectivesService.approveContribution(objectiveId, contributionId, interaction.user.id);

    // Mettre à jour le message original
    await updateObjectiveMessage(objective);

    // Mettre à jour le dashboard automatiquement
    await ObjectivesService.updateDashboardMessage(guild.id, (global as any).client);

    // Mettre à jour le message de validation
    try {
      const originalMessage = interaction.message;
      const oldEmbed = originalMessage.embeds[0];
      if (oldEmbed) {
        const updatedEmbed = new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle(oldEmbed.title || 'Contribution')
          .setDescription(oldEmbed.description || '')
          .addFields(...oldEmbed.fields || [])
          .addFields(
            { name: '✅ Validée par', value: `<@${interaction.user.id}>`, inline: true },
            { name: '✓ Validation', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
          );
        
        if (oldEmbed.footer) {
          updatedEmbed.setFooter(oldEmbed.footer);
        }
        if (oldEmbed.thumbnail) {
          updatedEmbed.setThumbnail(oldEmbed.thumbnail.url);
        }
        if (oldEmbed.image) {
          updatedEmbed.setImage(oldEmbed.image.url);
        }
        
        await originalMessage.edit({ embeds: [updatedEmbed], components: [] });
        logger.info(`Message de validation mis à jour pour contribution ${contributionId}`);
      }
    } catch (error) {
      logger.error(`Erreur lors de la mise à jour du message de validation: ${error}`);
    }

    // Vérifier si l'objectif est complété
    if (objective.status === 'COMPLETED') {
      await announceObjectiveCompletion(guild, objective, config);
    }

    await interaction.editReply('✅ Contribution approuvée!');
  } catch (error) {
    logger.error(`Erreur lors de l'approbation de la contribution: ${error}`);
    await interaction.editReply('❌ Erreur lors de l\'approbation de la contribution.');
  }
}

async function handleRejectContribution(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const guild = interaction.guild;
    const member = interaction.member;

    if (!guild || !member) {
      await interaction.editReply('❌ Erreur: serveur ou membre non trouvé.');
      return;
    }

    // Vérifier les permissions
    const config = await GuildConfig.findOne({ guildId: guild.id });
    if (!config) {
      await interaction.editReply('❌ Configuration non trouvée.');
      return;
    }

    const isChefOrOfficer = (member.roles as any).cache.has(config.roles.chefRoleId) || 
                            (member.roles as any).cache.has(config.roles.officerRoleId);
    
    if (!isChefOrOfficer) {
      await interaction.editReply('❌ Seuls le Chef et les Cadres peuvent valider des contributions.');
      return;
    }

    const parts = interaction.customId.split('_');
    const objectiveId = parts[2];
    const contributionId = parts[3];

    await ObjectivesService.rejectContribution(objectiveId, contributionId, interaction.user.id);

    // Mettre à jour le dashboard automatiquement
    await ObjectivesService.updateDashboardMessage(guild.id, (global as any).client);

    // Mettre à jour le message de validation
    try {
      const originalMessage = interaction.message;
      const oldEmbed = originalMessage.embeds[0];
      if (oldEmbed) {
        const updatedEmbed = new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle(oldEmbed.title || 'Contribution')
          .setDescription(oldEmbed.description || '')
          .addFields(...oldEmbed.fields || [])
          .addFields(
            { name: '❌ Rejetée par', value: `<@${interaction.user.id}>`, inline: true },
            { name: '✗ Rejet', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
          );
        
        if (oldEmbed.footer) {
          updatedEmbed.setFooter(oldEmbed.footer);
        }
        if (oldEmbed.thumbnail) {
          updatedEmbed.setThumbnail(oldEmbed.thumbnail.url);
        }
        if (oldEmbed.image) {
          updatedEmbed.setImage(oldEmbed.image.url);
        }
        
        await originalMessage.edit({ embeds: [updatedEmbed], components: [] });
        logger.info(`Message de validation mis à jour pour contribution ${contributionId}`);
      }
    } catch (error) {
      logger.error(`Erreur lors de la mise à jour du message de validation: ${error}`);
    }

    await interaction.editReply('❌ Contribution rejetée.');
  } catch (error) {
    logger.error(`Erreur lors du rejet de la contribution: ${error}`);
    await interaction.editReply('❌ Erreur lors du rejet de la contribution.');
  }
}

async function handleViewContributions(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const objectiveId = interaction.customId.replace('objective_view_contributions_', '');
    const objective = await ObjectivesService.getObjectiveById(objectiveId);

    if (!objective) {
      await interaction.editReply('❌ Objectif non trouvé.');
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`📊 Contributions - ${objective.title}`)
      .setDescription(`Liste de toutes les contributions pour cet objectif`)
      .setTimestamp();

    if (!objective.criteria || objective.criteria.length === 0) {
      embed.addFields({ name: 'Aucune contribution', value: 'Cet objectif n\'a pas encore de critères.', inline: false });
    } else {
      for (const criterion of objective.criteria) {
        if (criterion.contributions && criterion.contributions.length > 0) {
          const contribText = criterion.contributions.map((c: any) => {
            const statusEmoji = c.status === 'APPROVED' ? '✅' : c.status === 'REJECTED' ? '❌' : '⏳';
            return `${statusEmoji} **${c.userName}**: ${c.amount} ${criterion.unit || ''}\n*${c.message || 'Pas de message'}*`;
          }).join('\n');

          embed.addFields({ name: `${criterion.title}`, value: contribText, inline: false });
        }
      }
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error(`Erreur lors de l'affichage des contributions: ${error}`);
    await interaction.editReply('❌ Erreur lors du chargement des contributions.');
  }
}

async function updateObjectiveMessage(objective: any): Promise<void> {
  try {
    if (!objective.messageId || !objective.channelId) {
      return;
    }

    const guild = await (global as any).client?.guilds.fetch(objective.guildId);
    if (!guild) return;

    const channel = await guild.channels.fetch(objective.channelId);
    if (!channel || channel.type !== ChannelType.GuildText) return;

    const message = await channel.messages.fetch(objective.messageId);
    if (!message) return;

    const embed = await ObjectivesService.createObjectiveEmbed(objective);
    const buttons = ObjectivesService.createObjectiveButtons(objective);

    await message.edit({ embeds: [embed], components: buttons });
  } catch (error) {
    logger.error(`Erreur lors de la mise à jour du message d'objectif: ${error}`);
  }
}

async function sendContributionNotification(interaction: any, result: any, config: any): Promise<void> {
  try {
    const guild = interaction.guild;
    if (!guild) return;

    const validationChannel = await guild.channels.fetch(config.channels.objectivesValidationChannelId);
    if (!validationChannel || validationChannel.type !== ChannelType.GuildText) return;

    const { objective, criterion, contribution } = result;

    const embed = new EmbedBuilder()
      .setColor(0xE67E22)
      .setTitle('📥 Nouvelle contribution à valider')
      .setDescription(`**Objectif:** ${objective.title}\n**Critère:** ${criterion.title}`)
      .addFields(
        { name: '👤 Contributeur', value: `<@${contribution.userId}>`, inline: true },
        { name: '📊 Quantité', value: `${contribution.amount} ${criterion.unit || ''}`, inline: true },
        { name: '💬 Message', value: contribution.message || '*Aucun message*', inline: false }
      )
      .setFooter({ text: `ID Contribution: ${contribution.contributionId}` })
      .setTimestamp();

    if (contribution.proofUrl) {
      embed.setImage(contribution.proofUrl);
    }

    const approveButton = new ButtonBuilder()
      .setCustomId(`objective_approve_${objective.objectiveId}_${contribution.contributionId}`)
      .setLabel('✅ Approuver')
      .setStyle(ButtonStyle.Success);

    const rejectButton = new ButtonBuilder()
      .setCustomId(`objective_reject_${objective.objectiveId}_${contribution.contributionId}`)
      .setLabel('❌ Rejeter')
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(approveButton, rejectButton);

    await validationChannel.send({ 
      content: `<@&${config.roles.chefRoleId}> <@&${config.roles.officerRoleId}>`,
      embeds: [embed], 
      components: [row] 
    });
  } catch (error) {
    logger.error(`Erreur lors de l'envoi de la notification de contribution: ${error}`);
  }
}

async function announceObjectiveCompletion(guild: any, objective: any, config: any): Promise<void> {
  try {
    const objectivesChannel = await guild.channels.fetch(config.channels.objectivesChannelId);
    if (!objectivesChannel || objectivesChannel.type !== ChannelType.GuildText) return;

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('🎉 Objectif complété!')
      .setDescription(`# ${objective.title}\n\nFélicitations à tous! L'objectif a été complété à 100%!`)
      .addFields(
        { name: '🎯 Catégorie', value: objective.category, inline: true },
        { name: '📅 Complété le', value: `<t:${Math.floor(new Date().getTime() / 1000)}:D>`, inline: true }
      )
      .setThumbnail('https://em-content.zobj.net/thumbs/120/twitter/348/party-popper_1f389.png')
      .setTimestamp();

    await objectivesChannel.send({ 
      content: `@everyone`,
      embeds: [embed] 
    });
  } catch (error) {
    logger.error(`Erreur lors de l'annonce de complétion: ${error}`);
  }
}
