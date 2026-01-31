import { ButtonInteraction, ModalSubmitInteraction, StringSelectMenuInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, MessageFlags } from 'discord.js';
import { Company } from '../../db/models/Company';
import { Sale } from '../../db/models/Sale';
import { logger } from '../../utils/logger';
import { generateShortId } from '../../utils/uuid';
import { calculateSaleTaxes } from './sales.service';
import { createSaleModal } from './sales.commands';
import { getCereal } from './cereals';

export async function handleSaleButton(interaction: ButtonInteraction): Promise<void> {
  const [, action] = interaction.customId.split('_');

  switch (action) {
    case 'approve':
      await handleApproveSale(interaction);
      break;
    case 'reject':
      await handleRejectSale(interaction);
      break;
    default:
      await interaction.reply({ content: '❌ Action non reconnue.' });
  }
}

export async function handleSaleModal(interaction: ModalSubmitInteraction): Promise<void> {
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

    // Créer et afficher le modal
    const modal = createSaleModal(companyId);
    await interaction.showModal(modal);
  } catch (error) {
    logger.error(`Erreur lors du select menu: ${error}`);
    await interaction.reply({ content: '❌ Erreur lors de l\'ouverture du formulaire.' });
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
