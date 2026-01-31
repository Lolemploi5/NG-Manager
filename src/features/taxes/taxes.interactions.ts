import { ButtonInteraction, ModalSubmitInteraction, EmbedBuilder, MessageFlags } from 'discord.js';
import { GuildConfig } from '../../db/models/GuildConfig';
import { Company } from '../../db/models/Company';
import { Sale } from '../../db/models/Sale';
import { TaxRemittance } from '../../db/models/TaxRemittance';
import { logger } from '../../utils/logger';
import { generateShortId } from '../../utils/uuid';

export async function handleTaxButton(interaction: ButtonInteraction): Promise<void> {
  const [, action] = interaction.customId.split('_');

  switch (action) {
    case 'paid':
      await handleTaxPaid(interaction);
      break;
    default:
      await interaction.reply({ content: '❌ Action non reconnue.' });
  }
}

async function handleTaxPaid(interaction: ButtonInteraction): Promise<void> {
  await interaction.reply({ content: '✅ Paiement enregistré.' });
}

export async function handleTaxRateModal(interaction: ModalSubmitInteraction): Promise<void> {
  try {
    const guildId = interaction.guild?.id;
    if (!guildId) {
      await interaction.reply({ content: '❌ Erreur: serveur non trouvé.', flags: MessageFlags.Ephemeral });
      return;
    }

    const countryTaxRateStr = interaction.fields.getTextInputValue('country_tax_rate');
    const countryTaxRate = parseFloat(countryTaxRateStr);

    if (isNaN(countryTaxRate) || countryTaxRate < 0 || countryTaxRate > 100) {
      await interaction.reply({ content: '❌ Veuillez entrer un pourcentage valide (0-100).', flags: MessageFlags.Ephemeral });
      return;
    }

    const guildConfig = await GuildConfig.findOne({ guildId });
    if (!guildConfig) {
      await interaction.reply({ content: '❌ Configuration du pays non trouvée.', flags: MessageFlags.Ephemeral });
      return;
    }

    // Vérifier permissions: Chef ou Cadre
    const isCheforCadre = 
      (interaction.member?.roles as any)?.cache?.has(guildConfig.roles.chefRoleId) ||
      (interaction.member?.roles as any)?.cache?.has(guildConfig.roles.officerRoleId);

    if (!isCheforCadre) {
      await interaction.reply({ content: '❌ Vous n\'avez pas la permission. Seul le Chef ou les Cadres peuvent modifier cela.', flags: MessageFlags.Ephemeral });
      return;
    }

    const oldRate = (guildConfig.taxes.countryTaxRate * 100).toFixed(2);
    guildConfig.taxes.countryTaxRate = countryTaxRate / 100;
    await guildConfig.save();

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('✅ Taux de taxe pays modifié')
      .addFields(
        { name: '📉 Ancien taux', value: `${oldRate}%`, inline: true },
        { name: '📈 Nouveau taux', value: `${countryTaxRate.toFixed(2)}%`, inline: true },
        { name: '👤 Modifié par', value: `<@${interaction.user.id}>`, inline: true }
      )
      .setFooter({ text: `À partir des prochaines ventes` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    logger.info(`✅ Taxe pays modifiée: ${oldRate}% → ${countryTaxRate.toFixed(2)}% par ${interaction.user.tag}`);
  } catch (error) {
    logger.error(`Erreur lors de la modification de la taxe pays: ${error}`);
    await interaction.reply({ content: '❌ Erreur lors de la modification.', flags: MessageFlags.Ephemeral });
  }
}

export async function handlePayTaxesModal(interaction: ModalSubmitInteraction): Promise<void> {
  try {
    const guildId = interaction.guild?.id;
    if (!guildId) {
      await interaction.reply({ content: '❌ Erreur: serveur non trouvé.', flags: MessageFlags.Ephemeral });
      return;
    }

    const amountStr = interaction.fields.getTextInputValue('amount_paid');
    const amount = parseFloat(amountStr);

    if (isNaN(amount) || amount <= 0) {
      await interaction.reply({ content: '❌ Veuillez entrer un montant valide.', flags: MessageFlags.Ephemeral });
      return;
    }

    // Récupérer les entreprises du PDG
    const userCompanies = await Company.find({
      guildId,
      createdBy: interaction.user.id,
    });

    if (userCompanies.length === 0) {
      await interaction.reply({ content: '❌ Vous ne dirigez aucune entreprise.', flags: MessageFlags.Ephemeral });
      return;
    }

    let totalTaxPaid = 0;
    const remittances: any[] = [];

    // Payer les taxes pour chaque entreprise jusqu'à épuisement du montant
    for (const company of userCompanies) {
      if (totalTaxPaid >= amount) break;

      // Récupérer les ventes approuvées non payées
      const unpaidSales = await Sale.find({
        companyId: company.companyId,
        status: 'APPROVED',
        countryTaxPaid: false,
      });

      if (unpaidSales.length === 0) continue;

      // Calculer le total dû pour cette entreprise
      let companyTotalDue = unpaidSales.reduce((sum, sale) => sum + sale.countryTaxAmount, 0);
      const amountToPayForCompany = Math.min(companyTotalDue, amount - totalTaxPaid);

      if (amountToPayForCompany <= 0) continue;

      // Marquer les ventes comme payées
      let remainingAmount = amountToPayForCompany;
      const saleIdsForRemittance: string[] = [];

      for (const sale of unpaidSales) {
        if (remainingAmount <= 0) break;

        const saleCountryTax = sale.countryTaxAmount;
        if (remainingAmount >= saleCountryTax) {
          sale.countryTaxPaid = true;
          sale.countryTaxPaidAt = new Date();
          saleIdsForRemittance.push(sale.saleId);
          remainingAmount -= saleCountryTax;
          totalTaxPaid += saleCountryTax;
        } else {
          // Paiement partiel - créer une fraction de remittance
          totalTaxPaid += remainingAmount;
          saleIdsForRemittance.push(sale.saleId); // Marquer même si partiel
          remainingAmount = 0;
        }
        await sale.save();
      }

      // Créer une remittance
      if (saleIdsForRemittance.length > 0) {
        const remittance = await TaxRemittance.create({
          remittanceId: generateShortId(),
          guildId,
          companyId: company.companyId,
          totalAmount: amountToPayForCompany,
          saleIds: saleIdsForRemittance,
          paidBy: interaction.user.id,
          paidByName: interaction.user.username,
          paidAt: new Date(),
        });
        remittances.push(remittance);
      }
    }

    if (remittances.length === 0) {
      await interaction.reply({ content: '❌ Aucune taxe pays due actuellement.', flags: MessageFlags.Ephemeral });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('✅ Taxes pays payées')
      .addFields(
        { name: '💰 Montant payé', value: `**${totalTaxPaid.toFixed(2)} 💰**`, inline: true },
        { name: '📊 Remises créées', value: `${remittances.length}`, inline: true }
      )
      .setFooter({ text: `Les taxes ont été marquées comme payées` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    logger.info(`✅ Taxes pays payées: ${totalTaxPaid.toFixed(2)} 💰 par ${interaction.user.tag}`);
  } catch (error) {
    logger.error(`Erreur lors du paiement des taxes: ${error}`);
    await interaction.reply({ content: '❌ Erreur lors du paiement.', flags: MessageFlags.Ephemeral });
  }
}
