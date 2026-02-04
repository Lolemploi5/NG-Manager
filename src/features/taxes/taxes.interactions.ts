import { ButtonInteraction, ModalSubmitInteraction, EmbedBuilder, MessageFlags } from 'discord.js';
import { GuildConfig } from '../../db/models/GuildConfig';
import { Company } from '../../db/models/Company';
import { Sale } from '../../db/models/Sale';
import { Contract } from '../../db/models/Contract';
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

    const amountPaidStr = interaction.fields.getTextInputValue('amount_paid');
    const amountPaid = parseFloat(amountPaidStr);

    if (isNaN(amountPaid) || amountPaid <= 0) {
      await interaction.reply({ content: '❌ Montant invalide.', flags: MessageFlags.Ephemeral });
      return;
    }

    // Récupérer les entreprises de l'utilisateur
    const userCompanies = await Company.find({
      guildId,
      createdBy: interaction.user.id,
    });

    if (userCompanies.length === 0) {
      await interaction.reply({ content: '❌ Vous ne dirigez aucune entreprise.', flags: MessageFlags.Ephemeral });
      return;
    }

    let totalPaid = 0;
    let paidSales = 0;
    let paidContracts = 0;
    const remittances = [];

    for (const company of userCompanies) {
      let companyPaid = 0;
      const saleIds: string[] = [];
      const contractIds: string[] = [];

      // Marquer les ventes comme payées (entreprises Agricole)
      if (company.type === 'Agricole') {
        const unpaidSales = await Sale.find({
          companyId: company.companyId,
          status: 'APPROVED',
          countryTaxPaid: false,
        });

        for (const sale of unpaidSales) {
          if (totalPaid + sale.countryTaxAmount <= amountPaid) {
            sale.countryTaxPaid = true;
            await sale.save();
            totalPaid += sale.countryTaxAmount;
            companyPaid += sale.countryTaxAmount;
            saleIds.push(sale.saleId);
            paidSales++;
          } else {
            break;
          }
        }
      }

      // Marquer les contrats comme payés (entreprises Build)
      if (company.type === 'Build') {
        const unpaidContracts = await Contract.find({
          companyId: company.companyId,
          status: 'APPROVED',
          countryTaxPaid: false,
        });

        for (const contract of unpaidContracts) {
          if (totalPaid + contract.countryTax <= amountPaid) {
            contract.countryTaxPaid = true;
            await contract.save();
            totalPaid += contract.countryTax;
            companyPaid += contract.countryTax;
            contractIds.push(contract.contractId);
            paidContracts++;
          } else {
            break;
          }
        }
      }

      // Créer une remittance pour cette entreprise
      if (companyPaid > 0) {
        const remittance = await TaxRemittance.create({
          remittanceId: generateShortId(),
          guildId,
          companyId: company.companyId,
          totalAmount: companyPaid,
          saleIds,
          contractIds: contractIds,  // Ajouter les IDs de contrats
          paidBy: interaction.user.id,
          paidByName: interaction.user.username,
          paidAt: new Date(),
        });
        remittances.push(remittance);
      }
    }

    if (totalPaid === 0) {
      await interaction.reply({ content: '❌ Aucune taxe pays due actuellement.', flags: MessageFlags.Ephemeral });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('✅ Taxes pays payées')
      .addFields(
        { name: '💰 Montant payé', value: `**${totalPaid.toFixed(2)} 💰**`, inline: true },
        { name: '🏢 Entreprises', value: `${remittances.length}`, inline: true },
        { name: '📊 Éléments payés', value: `${paidSales} ventes + ${paidContracts} contrats`, inline: true }
      )
      .setFooter({ text: `Taxes pays marquées comme payées` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    logger.info(`✅ Taxes pays payées: ${totalPaid.toFixed(2)} 💰 par ${interaction.user.tag} (${paidSales} ventes, ${paidContracts} contrats)`);
  } catch (error) {
    logger.error(`Erreur lors du paiement des taxes: ${error}`);
    await interaction.reply({ content: '❌ Erreur lors du paiement.', flags: MessageFlags.Ephemeral });
  }
}