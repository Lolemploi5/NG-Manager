import { ButtonInteraction, ModalSubmitInteraction, StringSelectMenuInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { Company } from '../../db/models/Company';
import { GuildConfig } from '../../db/models/GuildConfig';
import { Sale } from '../../db/models/Sale';
import { Contract } from '../../db/models/Contract';
import { logger } from '../../utils/logger';
import { generateShortId } from '../../utils/uuid';
import { calculateSaleTaxes } from './sales.service';
import { calculateContractTaxes } from './contracts.service';
import { createSaleModal } from './companies.commands';
import { getCereal } from './cereals';

export async function handleSaleButton(interaction: ButtonInteraction): Promise<void> {
  const [, action] = interaction.customId.split('_');

  switch (action) {
    case 'approve':
      if (interaction.customId.startsWith('contract_')) {
        await handleApproveContract(interaction);
      } else {
        await handleApproveSale(interaction);
      }
      break;
    case 'reject':
      if (interaction.customId.startsWith('contract_')) {
        await handleRejectContract(interaction);
      } else {
        await handleRejectSale(interaction);
      }
      break;
    default:
      await interaction.reply({ content: '❌ Action non reconnue.' });
  }
}

export async function handleSaleModal(interaction: ModalSubmitInteraction): Promise<void> {
  if (interaction.customId === 'create_company_modal') {
    await handleCreateCompanyModal(interaction);
    return;
  }

  // Gérer les contrats (entreprises Build)
  if (interaction.customId.startsWith('contract_modal_')) {
    await handleContractModal(interaction);
    return;
  }

  // Gérer les ventes (entreprises Agricole)
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const customId = interaction.customId;
    const companyId = customId.replace('sale_modal_', '');

    const plant = interaction.fields.getTextInputValue('sale_plant');
    const amountStr = interaction.fields.getTextInputValue('sale_amount');

    // Valider le montant
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
      await interaction.editReply('❌ Le montant doit être un nombre positif.');
      return;
    }

    // Valider la céréale
    const cereal = getCereal(plant);
    if (!cereal) {
      await interaction.editReply(`❌ La céréale "${plant}" n'existe pas. Vérifiez l'orthographe et réessayez.`);
      return;
    }

    // Récupérer l'entreprise
    const company = await Company.findOne({ companyId });
    if (!company) {
      await interaction.editReply('❌ Entreprise non trouvée.');
      return;
    }

    if (company.guildId !== interaction.guild?.id) {
      await interaction.editReply('❌ Cette entreprise n\'appartient pas à ce serveur.');
      return;
    }

    // Récupérer la config du serveur pour les taux de taxe
    const { GuildConfig } = require('../../db/models/GuildConfig');
    const guildConfig = await GuildConfig.findOne({ guildId: interaction.guild?.id });

    // Calculer les taxes
    const taxes = calculateSaleTaxes(amount, guildConfig?.serverTaxRate || 0.1, company.taxCompanyRate, guildConfig?.countryTaxRate || 0.1);

    // Créer la vente
    const saleId = generateShortId();
    const sale = new Sale({
      saleId,
      guildId: interaction.guild?.id,
      companyId,
      submittedBy: interaction.user.id,
      submittedByName: interaction.user.username,
      plant,
      recipe: 'N/A', // Simplifié, pas de recette
      grossAmount: amount,
      serverTaxAmount: taxes.serverTax,
      companyTaxAmount: taxes.companyTax,
      countryTaxAmount: taxes.countryTax,
      netAmount: taxes.netAmount,
      status: 'PENDING',
    });

    await sale.save();

    // Envoyer un message dans le salon ventes de l'entreprise
    let salesMessageId: string | undefined;
    let confirmationMessageId: string | undefined;
    try {
      const salesChannel = await interaction.guild?.channels.fetch(company.channels.salesChannelId);
      if (salesChannel && salesChannel.type === ChannelType.GuildText) {
        const salesEmbed = new EmbedBuilder()
          .setColor(0xE67E22)
          .setTitle('⏳ Vente en attente de paiement')
          .setDescription(`### ${company.emoji} **${company.name}**\n🌾 **${plant}**`)
          .addFields(
            { name: '👤 Vendeur', value: `<@${interaction.user.id}>`, inline: true },
            { name: '💰 Montant brut', value: `**${amount.toFixed(2)}** 💰`, inline: true },
            { name: '📊 Statut', value: '⏳ **En attente de paiement**', inline: true },
            { name: '🔴 Taxe serveur (prélevée)', value: `${taxes.serverTax.toFixed(2)} 💰\n*${company.type === 'Agricole' ? '20' : (guildConfig?.serverTaxRate || 0.1) * 100}%*`, inline: true },
            { name: '🏢 Taxe entreprise', value: `${taxes.companyTax.toFixed(2)} 💰\n*${(company.taxCompanyRate * 100).toFixed(0)}%*`, inline: true },
            { name: '🌍 Taxe pays', value: `${taxes.countryTax.toFixed(2)} 💰\n*${((guildConfig?.countryTaxRate || 0.1) * 100).toFixed(0)}%*`, inline: true },
            { name: '✅ À payer au vendeur', value: `**${taxes.netAmount.toFixed(2)} 💰**`, inline: false }
          )
          .setFooter({ text: `ID: ${saleId}` })
          .setTimestamp();

        const sentMessage = await salesChannel.send({ embeds: [salesEmbed] });
        salesMessageId = sentMessage.id;
      }
    } catch (error) {
      logger.warn(`Impossible d'envoyer le message dans le salon ventes: ${error}`);
    }

    // Envoyer un embed de validation dans le channel de confirmations
    try {
      const confirmationChannel = await interaction.guild?.channels.fetch(company.channels.confirmationsChannelId);
      if (confirmationChannel && confirmationChannel.type === ChannelType.GuildText) {
        const validationEmbed = new EmbedBuilder()
          .setColor(0xE67E22)
          .setTitle(`⏳ Vente à payer en jeu`)
          .setDescription(`### ${company.emoji} **${company.name}**\n🌾 **${plant}**\n\n⚠️ **Action requise:** Payer manuellement le vendeur en jeu`)
          .addFields(
            { name: '👤 Vendeur', value: `<@${interaction.user.id}>`, inline: true },
            { name: '💰 Montant brut', value: `**${amount.toFixed(2)} 💰**`, inline: true },
            { name: '📊 Statut', value: '⏳ **En attente**', inline: true },
            { name: '🔴 Taxe serveur (prélevée)', value: `${taxes.serverTax.toFixed(2)} 💰\n*${company.type === 'Agricole' ? '20' : (guildConfig?.serverTaxRate || 0.1) * 100}%*`, inline: true },
            { name: '🏢 Taxe entreprise (à payer)', value: `${taxes.companyTax.toFixed(2)} 💰\n*${(company.taxCompanyRate * 100).toFixed(0)}%*`, inline: true },
            { name: '🌍 Taxe pays (à payer)', value: `${taxes.countryTax.toFixed(2)} 💰\n*${((guildConfig?.countryTaxRate || 0.1) * 100).toFixed(0)}%*`, inline: true },
            { name: '💸 Montant à payer au vendeur', value: `**${taxes.netAmount.toFixed(2)} 💰**`, inline: false }
          )
          .setFooter({ text: `ID: ${saleId}` })
          .setTimestamp();

        const approveButton = new ButtonBuilder()
          .setCustomId(`sale_approve_${saleId}`)
          .setLabel('✅ Payé')
          .setStyle(ButtonStyle.Success);

        const rejectButton = new ButtonBuilder()
          .setCustomId(`sale_reject_${saleId}`)
          .setLabel('❌ Annuler')
          .setStyle(ButtonStyle.Danger);

        const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(approveButton, rejectButton);

        const sentConfirmation = await confirmationChannel.send({ 
          content: `<@&${company.roles.ceoRoleId}> <@&${company.roles.managerRoleId}>`,
          embeds: [validationEmbed], 
          components: [buttonRow] 
        });
        confirmationMessageId = sentConfirmation.id;
      }
    } catch (error) {
      logger.warn(`Impossible d'envoyer le message de validation: ${error}`);
    }

    // Sauvegarder les deux messageIds
    if (salesMessageId) {
      sale.messageId = salesMessageId;
    }
    if (confirmationMessageId) {
      sale.confirmationMessageId = confirmationMessageId;
    }
    await sale.save();

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('✅ Vente enregistrée')
      .setDescription(`### ${company.emoji} **${company.name}**\n🌾 **${plant}**\n\nVotre vente a été enregistrée. Le PDG ou un cadre va vous payer en jeu.`)
      .addFields(
        { name: '💰 Montant brut', value: `**${amount.toFixed(2)}** 💰`, inline: true },
        { name: '📊 Taxes prélevées', value: `${(taxes.serverTax + taxes.companyTax + taxes.countryTax).toFixed(2)} 💰`, inline: true },
        { name: '💸 Vous recevrez', value: `**${taxes.netAmount.toFixed(2)} 💰**`, inline: true }
      )
      .setFooter({ text: `ID: ${saleId} • En attente de paiement` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    logger.info(`📦 Vente soumise: ${plant} - ${amount} par ${interaction.user.tag}`);
  } catch (error) {
    logger.error(`Erreur lors de la soumission de vente: ${error}`);
    await interaction.editReply('❌ Erreur lors de la soumission de la vente.');
  }
}

export async function handleSaleSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  try {
    const companyId = interaction.values[0];

    // Récupérer l'entreprise pour connaître son type
    const company = await Company.findOne({ companyId });
    if (!company) {
      await interaction.reply({ content: '❌ Entreprise non trouvée.', flags: MessageFlags.Ephemeral });
      return;
    }

    // Créer et afficher le modal approprié selon le type d'entreprise
    if (company.type === 'Build') {
      const { createContractModal } = await import('./companies.commands');
      const modal = createContractModal(companyId);
      await interaction.showModal(modal);
    } else {
      const modal = createSaleModal(companyId);
      await interaction.showModal(modal);
    }
  } catch (error) {
    logger.error(`Erreur lors du select menu: ${error}`);
    await interaction.reply({ content: '❌ Erreur lors de l\'ouverture du formulaire.', flags: MessageFlags.Ephemeral });
  }
}

async function handleApproveSale(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const customId = interaction.customId;
    const saleId = customId.replace('sale_approve_', '');

    const sale = await Sale.findOne({ saleId });
    if (!sale) {
      await interaction.editReply('❌ Vente non trouvée.');
      return;
    }

    if (sale.guildId !== interaction.guild?.id) {
      await interaction.editReply('❌ Cette vente n\'appartient pas à ce serveur.');
      return;
    }

    // Récupérer l'entreprise pour accéder au channel de ventes
    const company = await Company.findOne({ companyId: sale.companyId });
    if (!company) {
      await interaction.editReply('❌ Entreprise non trouvée.');
      return;
    }

    sale.status = 'APPROVED';
    sale.validatedBy = interaction.user.id;
    sale.validatedAt = new Date();
    await sale.save();

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('✅ Paiement confirmé')
      .setDescription(`La vente **${sale.plant}** de **${company.emoji} ${company.name}** a été marquée comme payée.\n\n⚠️ Assurez-vous d'avoir payé le vendeur en jeu!`)
      .addFields(
        { name: '💰 Montant brut', value: `${sale.grossAmount.toFixed(2)} 💰`, inline: true },
        { name: '💸 Payé au vendeur', value: `**${sale.netAmount.toFixed(2)} 💰**`, inline: true }
      )
      .setFooter({ text: `ID: ${saleId}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    // Éditer le message dans le salon ventes
    try {
      if (sale.messageId) {
        const salesChannel = await interaction.guild?.channels.fetch(company.channels.salesChannelId);
        if (salesChannel && salesChannel.type === ChannelType.GuildText) {
          const salesMessage = await salesChannel.messages.fetch(sale.messageId);
          
          const approvedEmbed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('✅ Vente payée')
            .setDescription(`### ${company.emoji} **${company.name}**\n🌾 **${sale.plant}**`)
            .addFields(
              { name: '👤 Vendeur', value: `<@${sale.submittedBy}>`, inline: true },
              { name: '💰 Montant brut', value: `**${sale.grossAmount.toFixed(2)}** 💰`, inline: true },
              { name: '📊 Statut', value: '✅ **Payée**', inline: true },
              { name: '🔴 Taxe serveur (prélevée)', value: `${sale.serverTaxAmount.toFixed(2)} 💰`, inline: true },
              { name: '🏢 Taxe entreprise', value: `${sale.companyTaxAmount.toFixed(2)} 💰`, inline: true },
              { name: '🌍 Taxe pays', value: `${sale.countryTaxAmount.toFixed(2)} 💰`, inline: true },
              { name: '✅ Payé au vendeur', value: `**${sale.netAmount.toFixed(2)} 💰**`, inline: true },
              { name: '✔️ Payé par', value: `<@${interaction.user.id}>`, inline: true }
            )
            .setFooter({ text: `ID: ${saleId}` })
            .setTimestamp();

          await salesMessage.edit({ embeds: [approvedEmbed] });
        }
      }
    } catch (error) {
      logger.warn(`Impossible d'éditer le message dans le salon ventes: ${error}`);
    }

    // Éditer le message dans le salon confirmations (retirer les boutons)
    try {
      if (sale.confirmationMessageId) {
        const confirmationChannel = await interaction.guild?.channels.fetch(company.channels.confirmationsChannelId);
        if (confirmationChannel && confirmationChannel.type === ChannelType.GuildText) {
          const confirmationMessage = await confirmationChannel.messages.fetch(sale.confirmationMessageId);
          
          const approvedConfirmEmbed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('✅ Vente payée')
            .setDescription(`### ${company.emoji} **${company.name}**\n🌾 **${sale.plant}**`)
            .addFields(
              { name: '👤 Vendeur', value: `<@${sale.submittedBy}>`, inline: true },
              { name: '💰 Montant brut', value: `**${sale.grossAmount.toFixed(2)} 💰**`, inline: true },
              { name: '📊 Statut', value: '✅ **Payée**', inline: true },
              { name: '🔴 Taxe serveur (prélevée)', value: `${sale.serverTaxAmount.toFixed(2)} 💰`, inline: true },
              { name: '🏢 Taxe entreprise', value: `${sale.companyTaxAmount.toFixed(2)} 💰`, inline: true },
              { name: '🌍 Taxe pays', value: `${sale.countryTaxAmount.toFixed(2)} 💰`, inline: true },
              { name: '✅ Payé au vendeur', value: `**${sale.netAmount.toFixed(2)} 💰**`, inline: false },
              { name: '✔️ Payé par', value: `<@${interaction.user.id}>`, inline: true }
            )
            .setFooter({ text: `ID: ${saleId}` })
            .setTimestamp();

          await confirmationMessage.edit({ embeds: [approvedConfirmEmbed], components: [] });
        }
      }
    } catch (error) {
      logger.warn(`Impossible d'éditer le message dans le salon confirmations: ${error}`);
    }

    // Envoyer un DM à l'utilisateur qui a soumis la vente
    try {
      const user = await interaction.client.users.fetch(sale.submittedBy);
      const dmEmbed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('✅ Votre vente a été payée!')
        .setDescription(`**${company.emoji} ${company.name}**\n\n💸 Vous devriez avoir reçu votre paiement en jeu.\nSi ce n'est pas le cas, contactez un responsable.`)
        .addFields(
          { name: '🌾 Produit', value: sale.plant, inline: true },
          { name: '💰 Montant brut', value: `${sale.grossAmount.toFixed(2)} 💰`, inline: true },
          { name: '💸 Reçu', value: `**${sale.netAmount.toFixed(2)} 💰**`, inline: true }
        )
        .setFooter({ text: `ID: ${saleId}` })
        .setTimestamp();

      await user.send({ embeds: [dmEmbed] });
    } catch (error) {
      logger.warn(`Impossible d'envoyer le DM: ${error}`);
    }

    logger.info(`✅ Vente approuvée: ${saleId}`);
  } catch (error) {
    logger.error(`Erreur lors de l'approbation de vente: ${error}`);
    await interaction.editReply('❌ Erreur lors de l\'approbation.');
  }
}

async function handleRejectSale(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const customId = interaction.customId;
    const saleId = customId.replace('sale_reject_', '');

    const sale = await Sale.findOne({ saleId });
    if (!sale) {
      await interaction.editReply('❌ Vente non trouvée.');
      return;
    }

    if (sale.guildId !== interaction.guild?.id) {
      await interaction.editReply('❌ Cette vente n\'appartient pas à ce serveur.');
      return;
    }

    // Récupérer l'entreprise
    const company = await Company.findOne({ companyId: sale.companyId });
    if (!company) {
      await interaction.editReply('❌ Entreprise non trouvée.');
      return;
    }

    sale.status = 'REJECTED';
    sale.validatedBy = interaction.user.id;
    sale.validatedAt = new Date();
    sale.rejectionReason = 'Rejetée par ' + interaction.user.username;
    await sale.save();

    const embed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('❌ Vente annulée')
      .setDescription(`La vente **${sale.plant}** de **${company.emoji} ${company.name}** a été annulée.`)
      .addFields(
        { name: '💰 Montant brut', value: `${sale.grossAmount.toFixed(2)} 💰`, inline: true },
        { name: '❌ Non payé', value: `**${sale.netAmount.toFixed(2)} 💰**`, inline: true }
      )
      .setFooter({ text: `ID: ${saleId}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    // Éditer le message dans le salon ventes
    try {
      if (sale.messageId) {
        const salesChannel = await interaction.guild?.channels.fetch(company.channels.salesChannelId);
        if (salesChannel && salesChannel.type === ChannelType.GuildText) {
          const salesMessage = await salesChannel.messages.fetch(sale.messageId);
          
          const rejectedEmbed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('❌ Vente refusée')
            .setDescription(`### ${company.emoji} **${company.name}**\n🌾 **${sale.plant}**`)
            .addFields(
              { name: '👤 Soumis par', value: `<@${sale.submittedBy}>`, inline: true },
              { name: '💰 Montant', value: `**${sale.grossAmount.toFixed(2)}** 💰`, inline: true },
              { name: '📊 Statut', value: '❌ **Refusée**', inline: true },
              { name: '\u200B', value: '\u200B', inline: false },
              { name: '❌ Refusée par', value: `<@${interaction.user.id}>`, inline: false }
            )
            .setFooter({ text: `ID: ${saleId}` })
            .setTimestamp();

          await salesMessage.edit({ embeds: [rejectedEmbed] });
        }
      }
    } catch (error) {
      logger.warn(`Impossible d'éditer le message dans le salon ventes: ${error}`);
    }

    // Éditer le message dans le salon confirmations (retirer les boutons)
    try {
      if (sale.confirmationMessageId) {
        const confirmationChannel = await interaction.guild?.channels.fetch(company.channels.confirmationsChannelId);
        if (confirmationChannel && confirmationChannel.type === ChannelType.GuildText) {
          const confirmationMessage = await confirmationChannel.messages.fetch(sale.confirmationMessageId);
          
          const rejectedConfirmEmbed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('❌ Vente annulée')
            .setDescription(`### ${company.emoji} **${company.name}**\n🌾 **${sale.plant}**`)
            .addFields(
              { name: '👤 Vendeur', value: `<@${sale.submittedBy}>`, inline: true },
              { name: '💰 Montant brut', value: `**${sale.grossAmount.toFixed(2)} 💰**`, inline: true },
              { name: '📊 Statut', value: '❌ **Annulée**', inline: true },
              { name: '❌ Montant non payé', value: `**${sale.netAmount.toFixed(2)} 💰**`, inline: false },
              { name: '❌ Annulée par', value: `<@${interaction.user.id}>`, inline: true }
            )
            .setFooter({ text: `ID: ${saleId}` })
            .setTimestamp();

          await confirmationMessage.edit({ embeds: [rejectedConfirmEmbed], components: [] });
        }
      }
    } catch (error) {
      logger.warn(`Impossible d'éditer le message dans le salon confirmations: ${error}`);
    }

    // Envoyer un DM à l'utilisateur qui a soumis la vente
    try {
      const user = await interaction.client.users.fetch(sale.submittedBy);
      const dmEmbed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('❌ Votre vente a été annulée')
        .setDescription(`**${company.emoji} ${company.name}**\n\nVotre vente n'a pas été validée par un responsable.\nContactez-les pour plus d'informations.`)
        .addFields(
          { name: '🌾 Produit', value: sale.plant, inline: true },
          { name: '💰 Montant brut', value: `${sale.grossAmount.toFixed(2)} 💰`, inline: true },
          { name: '❌ Montant non reçu', value: `${sale.netAmount.toFixed(2)} 💰`, inline: true }
        )
        .setFooter({ text: `ID: ${saleId}` })
        .setTimestamp();

      await user.send({ embeds: [dmEmbed] });
    } catch (error) {
      logger.warn(`Impossible d'envoyer le DM de rejet: ${error}`);
    }

    logger.info(`❌ Vente refusée: ${saleId}`);
  } catch (error) {
    logger.error(`Erreur lors du rejet de vente: ${error}`);
    await interaction.editReply('❌ Erreur lors du rejet.');
  }
}

async function handleCreateCompanyModal(interaction: ModalSubmitInteraction): Promise<void> {
  await interaction.deferReply();

  try {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.editReply('❌ Cette commande ne peut être utilisée que dans un serveur.');
      return;
    }

    const name = interaction.fields.getTextInputValue('company_name');
    const type = interaction.fields.getTextInputValue('company_type');
    const emoji = interaction.fields.getTextInputValue('company_emoji') || '🏢';
    const taxRateStr = interaction.fields.getTextInputValue('company_tax_rate');
    
    // Valider le type d'entreprise
    const validTypes = ['Agricole', 'Build'];
    if (!validTypes.includes(type)) {
      await interaction.editReply(`❌ Type d'entreprise invalide. Choisissez parmi: ${validTypes.join(', ')}`);
      return;
    }
    
    // Valider le taux de taxe
    let customTaxRate: number | null = null;
    if (taxRateStr) {
      customTaxRate = parseFloat(taxRateStr);
      if (isNaN(customTaxRate) || customTaxRate < 0 || customTaxRate > 1) {
        await interaction.editReply('❌ Le taux de taxe doit être un nombre entre 0 et 1 (ex: 0.15 pour 15%).');
        return;
      }
    }

    // Créer une catégorie pour l'entreprise
    const category = await guild.channels.create({
      name: `${emoji} ${name}`,
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
      ],
    });

    // Créer les rôles
    const ceoRole = await guild.roles.create({
      name: `${emoji} CEO - ${name}`,
      color: 0xffd700, // Gold
      permissions: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages],
    });

    const managerRole = await guild.roles.create({
      name: `${emoji} Manager - ${name}`,
      color: 0xc0c0c0, // Silver
      permissions: [PermissionFlagsBits.SendMessages],
    });

    const employeeRole = await guild.roles.create({
      name: `${emoji} Employé - ${name}`,
      color: 0xa9a9a9, // Gray
      permissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel],
    });

    // Créer les channels
    const salesChannel = await guild.channels.create({
      name: `${emoji}-ventes`,
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: employeeRole.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
        },
        {
          id: managerRole.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
        },
        {
          id: ceoRole.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
        },
      ],
    });

    const confirmationsChannel = await guild.channels.create({
      name: `${emoji}-confirmations`,
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: ceoRole.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
        },
        {
          id: managerRole.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
        },
      ],
    });

    // Créer l'entreprise en base de données
    const companyId = generateShortId();
    const taxRate = customTaxRate ?? 0.1; // 10% par défaut

    const company = new Company({
      companyId,
      guildId: guild.id,
      name,
      type,
      emoji,
      categoryId: category.id,
      channels: {
        salesChannelId: salesChannel.id,
        confirmationsChannelId: confirmationsChannel.id,
      },
      roles: {
        ceoRoleId: ceoRole.id,
        managerRoleId: managerRole.id,
        employeeRoleId: employeeRole.id,
      },
      taxCompanyRate: taxRate,
      createdBy: interaction.user.id,
    });

    await company.save();

    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle(`${emoji} ${name}`)
      .setDescription('Entreprise créée avec succès')
      .addFields(
        { name: 'Type', value: type, inline: true },
        { name: 'Taux de taxe', value: `${(taxRate * 100).toFixed(1)}%`, inline: true },
        { name: 'Catégorie', value: `<#${category.id}>`, inline: false },
        { name: 'Channel Ventes', value: `<#${salesChannel.id}>`, inline: true },
        { name: 'Channel Confirmations', value: `<#${confirmationsChannel.id}>`, inline: true },
        { name: 'CEO', value: `<@&${ceoRole.id}>`, inline: true },
        { name: 'Manager', value: `<@&${managerRole.id}>`, inline: true },
        { name: 'Employé', value: `<@&${employeeRole.id}>`, inline: true }
      )
      .setFooter({ text: `ID: ${companyId}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    logger.info(`✅ Entreprise créée: ${name} (${companyId}) par ${interaction.user.tag}`);
  } catch (error) {
    logger.error(`Erreur lors de la création d'entreprise: ${error}`);
    await interaction.editReply('❌ Erreur lors de la création de l\'entreprise.');
  }
}

async function handleContractModal(interaction: ModalSubmitInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const customId = interaction.customId;
    const companyId = customId.replace('contract_modal_', '');

    const client = interaction.fields.getTextInputValue('contract_client');
    const amountStr = interaction.fields.getTextInputValue('contract_amount');
    const employeesStr = interaction.fields.getTextInputValue('contract_employees');
    const description = interaction.fields.getTextInputValue('contract_description') || undefined;

    // Valider le montant
    const contractAmount = parseFloat(amountStr);
    if (isNaN(contractAmount) || contractAmount <= 0) {
      await interaction.editReply('❌ Le montant doit être un nombre positif.');
      return;
    }

    // Valider le nombre d'employés
    const employeeCount = parseInt(employeesStr);
    if (isNaN(employeeCount) || employeeCount <= 0) {
      await interaction.editReply('❌ Le nombre d\'employés doit être un nombre entier positif.');
      return;
    }

    // Récupérer l'entreprise
    const company = await Company.findOne({ companyId });
    if (!company) {
      await interaction.editReply('❌ Entreprise non trouvée.');
      return;
    }

    if (company.guildId !== interaction.guild?.id) {
      await interaction.editReply('❌ Cette entreprise n\'appartient pas à ce serveur.');
      return;
    }

    // Récupérer la config du serveur pour les taux de taxe
    const guildConfig = await GuildConfig.findOne({ guildId: company.guildId });

    // Calculer les taxes et partages
    const taxes = await calculateContractTaxes(company.guildId, companyId, contractAmount, employeeCount);

    // Créer le contrat en base de données
    const contractId = generateShortId();
    
    // Déterminer si c'est un client pays ou joueur
    let clientCountry: string | undefined;
    let clientPlayer: string | undefined;
    
    if (client.startsWith('@')) {
      clientPlayer = client.substring(1);
    } else {
      clientCountry = client;
    }

    const contract = new Contract({
      contractId,
      companyId,
      guildId: company.guildId,
      submittedBy: interaction.user.id,
      clientCountry,
      clientPlayer,
      contractAmount,
      employeeCount,
      description,
      grossAmount: taxes.grossAmount,
      countryTax: taxes.countryTax,
      companyTax: taxes.companyTax,
      employeeShare: taxes.employeeShare,
      perEmployeeAmount: taxes.perEmployeeAmount,
    });

    await contract.save();

    // Envoyer un message dans le salon ventes de l'entreprise
    try {
      const salesChannel = await interaction.guild?.channels.fetch(company.channels.salesChannelId);
      if (salesChannel && salesChannel.type === ChannelType.GuildText) {
        const salesEmbed = new EmbedBuilder()
          .setColor(0x3498DB)
          .setTitle('⏳ Contrat en attente de paiement')
          .setDescription(`### ${company.emoji} **${company.name}**\n🏗️ **Contrat Build**`)
          .addFields(
            { name: '👤 Soumis par', value: `<@${interaction.user.id}>`, inline: true },
            { name: '🎯 Client', value: clientCountry || `@${clientPlayer}`, inline: true },
            { name: '👷 Employés', value: `${employeeCount} participant(s)`, inline: true },
            { name: '💰 Montant brut', value: `**${contractAmount.toFixed(2)}** 💰`, inline: true },
            { name: '🏛️ Taxe pays', value: `${taxes.countryTax.toFixed(2)} 💰
*${((guildConfig?.taxes?.countryTaxRate || 0.1) * 100).toFixed(1)}% du montant brut*`, inline: true },
            { name: '🏢 Taxe entreprise', value: `${taxes.companyTax.toFixed(2)} 💰
*${(company.taxCompanyRate * 100).toFixed(1)}% du reste*`, inline: true },
            { name: '👥 Total employés', value: `${taxes.employeeShare.toFixed(2)} 💰`, inline: true },
            { name: '💵 Par employé', value: `**${taxes.perEmployeeAmount.toFixed(2)} 💰**`, inline: true },
            { name: '📊 Statut', value: '⏳ **En attente de paiement**', inline: true }
          )
          .setFooter({ text: `ID: ${contractId}` })
          .setTimestamp();

        if (description) {
          salesEmbed.addFields({ name: '📝 Description', value: description, inline: false });
        }

        const sentMessage = await salesChannel.send({ embeds: [salesEmbed] });
        contract.salesMessageId = sentMessage.id;
        await contract.save();
      }
    } catch (error) {
      logger.warn(`Impossible d'envoyer le message dans le salon ventes: ${error}`);
    }

    // Envoyer un message de confirmation dans le salon confirmations pour validation CEO/Manager
    try {
      const confirmationChannel = await interaction.guild?.channels.fetch(company.channels.confirmationsChannelId);
      if (confirmationChannel && confirmationChannel.type === ChannelType.GuildText) {
        const approveButton = new ButtonBuilder()
          .setCustomId(`contract_approve_${contractId}`)
          .setLabel('✅ Approuver')
          .setStyle(ButtonStyle.Success);

        const rejectButton = new ButtonBuilder()
          .setCustomId(`contract_reject_${contractId}`)
          .setLabel('❌ Rejeter')
          .setStyle(ButtonStyle.Danger);

        const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(approveButton, rejectButton);

        const confirmEmbed = new EmbedBuilder()
          .setColor(0xF39C12)
          .setTitle('🔔 Nouveau contrat à valider')
          .setDescription(`### ${company.emoji} **${company.name}**\n🏗️ **Contrat Build**`)
          .addFields(
            { name: '👤 Soumis par', value: `<@${interaction.user.id}>`, inline: true },
            { name: '🎯 Client', value: clientCountry || `@${clientPlayer}`, inline: true },
            { name: '👷 Employés', value: `${employeeCount} participant(s)`, inline: true },
            { name: '💰 Montant brut', value: `**${contractAmount.toFixed(2)}** 💰`, inline: true },
            { name: '🏛️ Taxe pays', value: `${taxes.countryTax.toFixed(2)} 💰\n*${((guildConfig?.taxes?.countryTaxRate || 0.1) * 100).toFixed(1)}% du montant brut*`, inline: true },
            { name: '🏢 Taxe entreprise', value: `${taxes.companyTax.toFixed(2)} 💰\n*${(company.taxCompanyRate * 100).toFixed(1)}% du reste*`, inline: true },
            { name: '👥 Total employés', value: `${taxes.employeeShare.toFixed(2)} 💰`, inline: true },
            { name: '💵 Par employé', value: `**${taxes.perEmployeeAmount.toFixed(2)} 💰**`, inline: true },
            { name: '📋 Action requise', value: 'CEO ou Manager doit approuver', inline: true }
          )
          .setFooter({ text: `ID: ${contractId} • Cliquez sur les boutons pour valider` })
          .setTimestamp();

        if (description) {
          confirmEmbed.addFields({ name: '📝 Description', value: description, inline: false });
        }

        const sentMessage = await confirmationChannel.send({ embeds: [confirmEmbed], components: [buttonRow] });
        contract.confirmationMessageId = sentMessage.id;
        await contract.save();
      }
    } catch (error) {
      logger.warn(`Impossible d'envoyer le message de confirmation: ${error}`);
    }

    await interaction.editReply(`✅ Contrat soumis avec succès! ID: \`${contractId}\``);
    logger.info(`📝 Contrat soumis: ${contractId} par ${interaction.user.tag} (${contractAmount} 💰, ${employeeCount} employés)`);

  } catch (error) {
    logger.error(`Erreur lors de la soumission du contrat: ${error}`);
    await interaction.editReply('❌ Erreur lors de la soumission du contrat.');
  }
}

async function handleApproveContract(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const customId = interaction.customId;
    const contractId = customId.replace('contract_approve_', '');

    const contract = await Contract.findOne({ contractId });
    if (!contract) {
      await interaction.editReply('❌ Contrat non trouvé.');
      return;
    }

    if (contract.guildId !== interaction.guild?.id) {
      await interaction.editReply('❌ Ce contrat n\'appartient pas à ce serveur.');
      return;
    }

    if (contract.status !== 'PENDING') {
      await interaction.editReply('❌ Ce contrat a déjà été traité.');
      return;
    }

    const company = await Company.findOne({ companyId: contract.companyId });
    if (!company) {
      await interaction.editReply('❌ Entreprise non trouvée.');
      return;
    }

    // Vérifier les permissions (CEO ou Manager)
    const member = await interaction.guild?.members.fetch(interaction.user.id);
    const hasCEORole = member?.roles.cache.has(company.roles.ceoRoleId);
    const hasManagerRole = member?.roles.cache.has(company.roles.managerRoleId);

    if (!hasCEORole && !hasManagerRole) {
      await interaction.editReply('❌ Seuls les CEO et Managers peuvent approuver les contrats.');
      return;
    }

    // Marquer le contrat comme approuvé
    contract.status = 'APPROVED';
    contract.approvedBy = interaction.user.id;
    contract.approvedAt = new Date();
    await contract.save();

    await interaction.editReply(`✅ Contrat ${contractId} approuvé! Les employés recevront ${contract.perEmployeeAmount.toFixed(2)} 💰 chacun.`);

    // Mettre à jour le message dans le salon ventes
    try {
      if (contract.salesMessageId) {
        const salesChannel = await interaction.guild?.channels.fetch(company.channels.salesChannelId);
        if (salesChannel && salesChannel.type === ChannelType.GuildText) {
          const salesMessage = await salesChannel.messages.fetch(contract.salesMessageId);
          
          const approvedEmbed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('✅ Contrat payé')
            .setDescription(`### ${company.emoji} **${company.name}**\n🏗️ **Contrat Build**`)
            .addFields(
              { name: '👤 Soumis par', value: `<@${contract.submittedBy}>`, inline: true },
              { name: '🎯 Client', value: contract.clientCountry || `@${contract.clientPlayer}`, inline: true },
              { name: '👷 Employés', value: `${contract.employeeCount} participant(s)`, inline: true },
              { name: '💰 Montant total', value: `${contract.contractAmount.toFixed(2)} 💰`, inline: true },
              { name: '💵 Par employé', value: `**${contract.perEmployeeAmount.toFixed(2)} 💰**`, inline: true },
              { name: '✅ Approuvé par', value: `<@${interaction.user.id}>`, inline: true }
            )
            .setFooter({ text: `ID: ${contractId}` })
            .setTimestamp();

          if (contract.description) {
            approvedEmbed.addFields({ name: '📝 Description', value: contract.description, inline: false });
          }

          await salesMessage.edit({ embeds: [approvedEmbed] });
        }
      }
    } catch (error) {
      logger.warn(`Impossible d'éditer le message dans le salon ventes: ${error}`);
    }

    // Éditer le message dans le salon confirmations (retirer les boutons)
    try {
      if (contract.confirmationMessageId) {
        const confirmationChannel = await interaction.guild?.channels.fetch(company.channels.confirmationsChannelId);
        if (confirmationChannel && confirmationChannel.type === ChannelType.GuildText) {
          const confirmationMessage = await confirmationChannel.messages.fetch(contract.confirmationMessageId);
          
          const approvedConfirmEmbed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('✅ Contrat payé')
            .setDescription(`### ${company.emoji} **${company.name}**\n🏗️ **Contrat Build**`)
            .addFields(
              { name: '👤 Soumis par', value: `<@${contract.submittedBy}>`, inline: true },
              { name: '🎯 Client', value: contract.clientCountry || `@${contract.clientPlayer}`, inline: true },
              { name: '👷 Employés', value: `${contract.employeeCount} participant(s)`, inline: true },
              { name: '💰 Montant total', value: `${contract.contractAmount.toFixed(2)} 💰`, inline: true },
              { name: '💵 Par employé', value: `**${contract.perEmployeeAmount.toFixed(2)} 💰**`, inline: true },
              { name: '✅ Approuvé par', value: `<@${interaction.user.id}>`, inline: true }
            )
            .setFooter({ text: `ID: ${contractId} • Payé le ${new Date().toLocaleDateString('fr-FR')}` })
            .setTimestamp();

          if (contract.description) {
            approvedConfirmEmbed.addFields({ name: '📝 Description', value: contract.description, inline: false });
          }

          await confirmationMessage.edit({ embeds: [approvedConfirmEmbed], components: [] });
        }
      }
    } catch (error) {
      logger.warn(`Impossible d'éditer le message de confirmation: ${error}`);
    }

    logger.info(`✅ Contrat approuvé: ${contractId} par ${interaction.user.tag}`);

  } catch (error) {
    logger.error(`Erreur lors de l'approbation du contrat: ${error}`);
    await interaction.editReply('❌ Erreur lors de l\'approbation.');
  }
}

async function handleRejectContract(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const customId = interaction.customId;
    const contractId = customId.replace('contract_reject_', '');

    const contract = await Contract.findOne({ contractId });
    if (!contract) {
      await interaction.editReply('❌ Contrat non trouvé.');
      return;
    }

    if (contract.guildId !== interaction.guild?.id) {
      await interaction.editReply('❌ Ce contrat n\'appartient pas à ce serveur.');
      return;
    }

    if (contract.status !== 'PENDING') {
      await interaction.editReply('❌ Ce contrat a déjà été traité.');
      return;
    }

    const company = await Company.findOne({ companyId: contract.companyId });
    if (!company) {
      await interaction.editReply('❌ Entreprise non trouvée.');
      return;
    }

    // Vérifier les permissions (CEO ou Manager)
    const member = await interaction.guild?.members.fetch(interaction.user.id);
    const hasCEORole = member?.roles.cache.has(company.roles.ceoRoleId);
    const hasManagerRole = member?.roles.cache.has(company.roles.managerRoleId);

    if (!hasCEORole && !hasManagerRole) {
      await interaction.editReply('❌ Seuls les CEO et Managers peuvent rejeter les contrats.');
      return;
    }

    // Marquer le contrat comme rejeté
    contract.status = 'REJECTED';
    contract.rejectedBy = interaction.user.id;
    contract.rejectedAt = new Date();
    await contract.save();

    await interaction.editReply(`❌ Contrat ${contractId} rejeté.`);

    // Supprimer les messages liés au contrat
    try {
      if (contract.salesMessageId) {
        const salesChannel = await interaction.guild?.channels.fetch(company.channels.salesChannelId);
        if (salesChannel && salesChannel.type === ChannelType.GuildText) {
          const salesMessage = await salesChannel.messages.fetch(contract.salesMessageId);
          await salesMessage.delete();
        }
      }
    } catch (error) {
      logger.warn(`Impossible de supprimer le message dans le salon ventes: ${error}`);
    }

    try {
      if (contract.confirmationMessageId) {
        const confirmationChannel = await interaction.guild?.channels.fetch(company.channels.confirmationsChannelId);
        if (confirmationChannel && confirmationChannel.type === ChannelType.GuildText) {
          const confirmationMessage = await confirmationChannel.messages.fetch(contract.confirmationMessageId);
          await confirmationMessage.delete();
        }
      }
    } catch (error) {
      logger.warn(`Impossible de supprimer le message de confirmation: ${error}`);
    }

    logger.info(`❌ Contrat rejeté: ${contractId} par ${interaction.user.tag}`);

  } catch (error) {
    logger.error(`Erreur lors du rejet du contrat: ${error}`);
    await interaction.editReply('❌ Erreur lors du rejet.');
  }
}
