import { ButtonInteraction, ModalSubmitInteraction, StringSelectMenuInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } from 'discord.js';
import { Company } from '../../db/models/Company';
import { Sale } from '../../db/models/Sale';
import { logger } from '../../utils/logger';
import { generateShortId } from '../../utils/uuid';
import { calculateSaleTaxes } from './sales.service';
import { createSaleModal } from './sales.commands';

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
  await interaction.deferReply();

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

    // Envoyer un embed de validation dans le channel de confirmations
    try {
      const confirmationChannel = await interaction.guild?.channels.fetch(company.channels.confirmationsChannelId);
      if (confirmationChannel && confirmationChannel.type === ChannelType.GuildText) {
        const validationEmbed = new EmbedBuilder()
          .setColor(0xffa500) // Orange pour "en attente"
          .setTitle(`📦 Nouvelle vente à valider`)
          .addFields(
            { name: 'Soumis par', value: `<@${interaction.user.id}> (${interaction.user.username})`, inline: true },
            { name: 'Plante', value: plant, inline: true },
            { name: 'Montant brut', value: `${amount.toFixed(2)} 💰`, inline: true },
            { name: 'Taxe serveur', value: `${taxes.serverTax.toFixed(2)} 💰 (${(guildConfig?.serverTaxRate || 0.1) * 100}%)`, inline: true },
            { name: 'Taxe entreprise', value: `${taxes.companyTax.toFixed(2)} 💰 (${company.taxCompanyRate * 100}%)`, inline: true },
            { name: 'Taxe pays', value: `${taxes.countryTax.toFixed(2)} 💰 (${(guildConfig?.countryTaxRate || 0.1) * 100}%)`, inline: true },
            { name: 'Montant net', value: `${taxes.netAmount.toFixed(2)} 💰`, inline: false }
          )
          .setFooter({ text: `ID: ${saleId}` })
          .setTimestamp();

        const approveButton = new ButtonBuilder()
          .setCustomId(`sale_approve_${saleId}`)
          .setLabel('✅ Approuver')
          .setStyle(ButtonStyle.Success);

        const rejectButton = new ButtonBuilder()
          .setCustomId(`sale_reject_${saleId}`)
          .setLabel('❌ Rejeter')
          .setStyle(ButtonStyle.Danger);

        const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(approveButton, rejectButton);

        await confirmationChannel.send({ embeds: [validationEmbed], components: [buttonRow] });
      }
    } catch (error) {
      logger.warn(`Impossible d'envoyer le message de validation: ${error}`);
    }

    const embed = new EmbedBuilder()
      .setColor(0x00aa00)
      .setTitle('📦 Vente soumise')
      .addFields(
        { name: 'Plante', value: plant, inline: true },
        { name: 'Montant brut', value: `${amount.toFixed(2)} 💰`, inline: true },
        { name: 'Taxe serveur', value: `${taxes.serverTax.toFixed(2)} 💰 (${(guildConfig?.serverTaxRate || 0.1) * 100}%)`, inline: true },
        { name: 'Taxe entreprise', value: `${taxes.companyTax.toFixed(2)} 💰 (${company.taxCompanyRate * 100}%)`, inline: true },
        { name: 'Taxe pays', value: `${taxes.countryTax.toFixed(2)} 💰 (${(guildConfig?.countryTaxRate || 0.1) * 100}%)`, inline: true },
        { name: 'Montant net', value: `${taxes.netAmount.toFixed(2)} 💰`, inline: true }
      )
      .setFooter({ text: `ID: ${saleId} | En attente de validation` })
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
  await interaction.deferReply();

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
      .setColor(0x00aa00)
      .setTitle('✅ Vente approuvée')
      .addFields(
        { name: 'Montant net', value: `${sale.netAmount.toFixed(2)} 💰`, inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    // Envoyer un message dans le channel de ventes
    try {
      const salesChannel = await interaction.guild?.channels.fetch(company.channels.salesChannelId);
      if (salesChannel && salesChannel.type === ChannelType.GuildText) {
        const salesEmbed = new EmbedBuilder()
          .setColor(0x00aa00)
          .setTitle('✅ Vente approuvée et enregistrée')
          .addFields(
            { name: 'Soumis par', value: `<@${sale.submittedBy}>`, inline: true },
            { name: 'Plante', value: sale.plant, inline: true },
            { name: 'Montant brut', value: `${sale.grossAmount.toFixed(2)} 💰`, inline: true },
            { name: 'Montant net', value: `${sale.netAmount.toFixed(2)} 💰`, inline: true },
            { name: 'Validé par', value: `<@${interaction.user.id}>`, inline: true }
          )
          .setFooter({ text: `ID: ${saleId}` })
          .setTimestamp();

        await salesChannel.send({ embeds: [salesEmbed] });
      }
    } catch (error) {
      logger.warn(`Impossible d'envoyer le message dans le channel de ventes: ${error}`);
    }

    // Envoyer un DM à l'utilisateur qui a soumis la vente
    try {
      const user = await interaction.client.users.fetch(sale.submittedBy);
      const dmEmbed = new EmbedBuilder()
        .setColor(0x00aa00)
        .setTitle('✅ Votre vente a été approuvée!')
        .addFields(
          { name: 'Plante', value: sale.plant, inline: true },
          { name: 'Montant brut', value: `${sale.grossAmount.toFixed(2)} 💰`, inline: true },
          { name: 'Montant net crédité', value: `${sale.netAmount.toFixed(2)} 💰`, inline: false },
          { name: 'Validée par', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Serveur', value: interaction.guild?.name || 'Unknown', inline: true }
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
  await interaction.deferReply();

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

    sale.status = 'REJECTED';
    sale.validatedBy = interaction.user.id;
    sale.validatedAt = new Date();
    sale.rejectionReason = 'Rejetée par ' + interaction.user.username;
    await sale.save();

    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle('❌ Vente refusée')
      .addFields(
        { name: 'Montant non crédité', value: `${sale.netAmount.toFixed(2)} 💰`, inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    // Envoyer un DM à l'utilisateur qui a soumis la vente
    try {
      const user = await interaction.client.users.fetch(sale.submittedBy);
      const dmEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('❌ Votre vente a été refusée')
        .addFields(
          { name: 'Plante', value: sale.plant, inline: true },
          { name: 'Montant brut', value: `${sale.grossAmount.toFixed(2)} 💰`, inline: true },
          { name: 'Montant non crédité', value: `${sale.netAmount.toFixed(2)} 💰`, inline: false },
          { name: 'Refusée par', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Serveur', value: interaction.guild?.name || 'Unknown', inline: true }
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
