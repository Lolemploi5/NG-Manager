import { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags, EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger';
import { GuildConfig } from '../../db/models/GuildConfig';
import { Company } from '../../db/models/Company';
import { Sale } from '../../db/models/Sale';

export const taxesCommands = [
  new SlashCommandBuilder()
    .setName('impots')
    .setDescription('Gestion des impôts')
    .addSubcommand((sub) =>
      sub
        .setName('config-taux')
        .setDescription('Configurer le taux de taxe pays')
    )
    .addSubcommand((sub) =>
      sub
        .setName('payer')
        .setDescription('Payer les taxes pays de votre entreprise')
    )
    .addSubcommand((sub) =>
      sub
        .setName('resume')
        .setDescription('Résumé des impôts à payer')
    )
    .addSubcommand((sub) =>
      sub
        .setName('generer')
        .setDescription('Générer un rappel maintenant')
    ),
];

export async function handleTaxesCommand(interaction: any): Promise<void> {
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'config-taux':
      await handleConfigTaxRate(interaction);
      break;
    case 'payer':
      await handlePayTaxes(interaction);
      break;
    case 'resume':
      await handleResumeTaxes(interaction);
      break;
    case 'generer':
      await handleGenerateTaxReminder(interaction);
      break;
  }
}

async function handleConfigTaxRate(interaction: any): Promise<void> {
  try {
    const guildId = interaction.guild?.id;
    if (!guildId) {
      await interaction.reply({ content: '❌ Erreur: serveur non trouvé.', flags: MessageFlags.Ephemeral });
      return;
    }

    const guildConfig = await GuildConfig.findOne({ guildId });
    if (!guildConfig) {
      await interaction.reply({ content: '❌ Configuration du pays non trouvée.', flags: MessageFlags.Ephemeral });
      return;
    }

    // Vérifier permissions: Chef ou Cadre
    const isCheforCadre = 
      interaction.member?.roles.cache.has(guildConfig.roles.chefRoleId) ||
      interaction.member?.roles.cache.has(guildConfig.roles.officerRoleId);

    if (!isCheforCadre) {
      await interaction.reply({ content: '❌ Vous n\'avez pas la permission.', flags: MessageFlags.Ephemeral });
      return;
    }

    const currentRate = (guildConfig.taxes.countryTaxRate * 100).toFixed(2);

    const modal = new ModalBuilder()
      .setCustomId('tax_rate_modal')
      .setTitle('Configurer la taxe pays');

    const rateInput = new TextInputBuilder()
      .setCustomId('country_tax_rate')
      .setLabel(`Taux de taxe pays (% - Actuellement ${currentRate}%)`)
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Ex: 5.50')
      .setValue(currentRate)
      .setRequired(true);

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(rateInput);
    modal.addComponents(row);

    await interaction.showModal(modal);
  } catch (error) {
    logger.error(`Erreur lors de l'ouverture du modal de configuration: ${error}`);
    await interaction.reply({ content: '❌ Erreur lors de l\'ouverture du formulaire.', flags: MessageFlags.Ephemeral });
  }
}

async function handlePayTaxes(interaction: any): Promise<void> {
  try {
    const guildId = interaction.guild?.id;
    if (!guildId) {
      await interaction.reply({ content: '❌ Erreur: serveur non trouvé.', flags: MessageFlags.Ephemeral });
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

    // Vérifier s'il y a des taxes à payer
    const unpaidSales = await Sale.find({
      companyId: { $in: userCompanies.map(c => c.companyId) },
      status: 'APPROVED',
      countryTaxPaid: false,
    });

    if (unpaidSales.length === 0) {
      await interaction.reply({ content: '✅ Aucune taxe pays due actuellement.', flags: MessageFlags.Ephemeral });
      return;
    }

    const totalDue = unpaidSales.reduce((sum, sale) => sum + sale.countryTaxAmount, 0);

    const modal = new ModalBuilder()
      .setCustomId('pay_taxes_modal')
      .setTitle('Payer les taxes pays');

    const amountInput = new TextInputBuilder()
      .setCustomId('amount_paid')
      .setLabel(`Montant à payer (Total dû: ${totalDue.toFixed(2)} 💰)`)
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Ex: 500.00')
      .setRequired(true);

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput);
    modal.addComponents(row);

    await interaction.showModal(modal);
  } catch (error) {
    logger.error(`Erreur lors de l'ouverture du modal de paiement: ${error}`);
    await interaction.reply({ content: '❌ Erreur lors de l\'ouverture du formulaire.', flags: MessageFlags.Ephemeral });
  }
}

async function handleResumeTaxes(interaction: any): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const guildId = interaction.guild?.id;
    if (!guildId) {
      await interaction.editReply('❌ Erreur: serveur non trouvé.');
      return;
    }

    const companies = await Company.find({ guildId });
    if (companies.length === 0) {
      await interaction.editReply('❌ Aucune entreprise sur ce serveur.');
      return;
    }

    // Récupérer les ventes non payées par entreprise
    const summaryByCompany: any = {};

    for (const company of companies) {
      const unpaidSales = await Sale.find({
        companyId: company.companyId,
        status: 'APPROVED',
        countryTaxPaid: false,
      });

      if (unpaidSales.length > 0) {
        const totalDue = unpaidSales.reduce((sum, sale) => sum + sale.countryTaxAmount, 0);
        summaryByCompany[company.companyId] = {
          name: company.name,
          emoji: company.emoji,
          totalDue,
          saleCount: unpaidSales.length,
        };
      }
    }

    if (Object.keys(summaryByCompany).length === 0) {
      await interaction.editReply('✅ Aucune taxe pays due actuellement.');
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0xE67E22)
      .setTitle('📊 Résumé des taxes pays dues')
      .setDescription('Taxes non payées par entreprise')
      .setTimestamp();

    let totalGrand = 0;
    for (const [, data] of Object.entries(summaryByCompany)) {
      const { name, emoji, totalDue, saleCount } = data as any;
      embed.addFields({
        name: `${emoji} ${name}`,
        value: `**${totalDue.toFixed(2)} 💰** (${saleCount} ventes)`,
        inline: false,
      });
      totalGrand += totalDue;
    }

    embed.addFields({
      name: '📈 TOTAL',
      value: `**${totalGrand.toFixed(2)} 💰**`,
      inline: false,
    });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error(`Erreur lors du calcul du résumé: ${error}`);
    await interaction.editReply('❌ Erreur lors du calcul du résumé.');
  }
}

async function handleGenerateTaxReminder(interaction: any): Promise<void> {
  // À implémenter avec le scheduler
  await interaction.reply({ content: '⏳ Génération du rappel en cours...', flags: MessageFlags.Ephemeral });
}
