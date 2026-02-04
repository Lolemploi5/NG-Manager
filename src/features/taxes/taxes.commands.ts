function buildTaxReminderEmbed(guild: any, summaryByCompany: any, totalGrandDue: number): any {
  const embed = new EmbedBuilder()
    .setColor(0xE67E22)
    .setTitle('📊 Dashboard Impôts Pays')
    .setDescription('Ce tableau affiche en temps réel les taxes pays dues par chaque entreprise. Il est mis à jour automatiquement à chaque validation de vente ou contrat.')
    .setThumbnail(guild.iconURL() || null)
    .addFields({ name: '\u200B', value: '\u200B' });
  let index = 1;
  for (const [, data] of Object.entries(summaryByCompany)) {
    const { name, emoji, type, totalDue, itemCount } = data as any;
    const itemType = type === 'Build' ? 'contrats' : 'ventes';
    embed.addFields({
      name: `${index}. ${emoji} **${name}** (${type})`,
      value: `**${totalDue.toFixed(2)} 💰** (${itemCount} ${itemType} non payées)`,
      inline: false,
    });
    index++;
  }
  embed.addFields(
    { name: '\u200B', value: '\u200B' },
    { name: '📈 TOTAL À PAYER', value: `**${totalGrandDue.toFixed(2)} 💰**`, inline: false },
    { name: '💡 Action', value: 'Utilisez `/impots payer` pour déclarer le paiement. Ce dashboard est mis à jour automatiquement à chaque validation.', inline: false }
  );
  embed.setFooter({ text: 'Dashboard impôts pays — actualisé en temps réel' }).setTimestamp();
  return embed;
}
import { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags, EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger';
import { GuildConfig } from '../../db/models/GuildConfig';
import { Company } from '../../db/models/Company';
import { Sale } from '../../db/models/Sale';
import { Contract } from '../../db/models/Contract';

export const taxesCommands = [
  new SlashCommandBuilder()
    .setName('impots')
    .setDescription('Dashboard et gestion des impôts pays')
    .addSubcommand((sub) =>
      sub
        .setName('config-taux')
        .setDescription('Configurer le taux de taxe pays')
    )
    .addSubcommand((sub) =>
      sub
        .setName('payer')
        .setDescription('Déclarer le paiement des taxes pays pour votre entreprise')
    )
    .addSubcommand((sub) =>
      sub
        .setName('resume')
        .setDescription('Afficher le dashboard impôts en temps réel')
    )
    .addSubcommand((sub) =>
      sub
        .setName('generer')
        .setDescription('Forcer la mise à jour du dashboard impôts')
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
      .setCustomId('taxRateInput')
      .setPlaceholder(`% - Actuellement ${currentRate}`)
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Ex: 5.50')
      .setValue(currentRate)
      .setRequired(true);

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(rateInput);
    modal.addComponents(...[row]);

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
    let totalDue = 0;
    let totalItems = 0;
    
    // Récupérer les ventes non payées (entreprises Agricole)
    const unpaidSales = await Sale.find({
      companyId: { $in: userCompanies.map(c => c.companyId) },
      status: 'APPROVED',
      countryTaxPaid: false,
    });

    // Récupérer les contrats non payés (entreprises Build)
    const unpaidContracts = await Contract.find({
      companyId: { $in: userCompanies.map(c => c.companyId) },
      status: 'APPROVED',
      countryTaxPaid: false,
    });

    totalDue = unpaidSales.reduce((sum, sale) => sum + sale.countryTaxAmount, 0) +
               unpaidContracts.reduce((sum, contract) => sum + contract.countryTax, 0);
    totalItems = unpaidSales.length + unpaidContracts.length;

    if (totalItems === 0) {
      await interaction.reply({ content: '✅ Aucune taxe pays due actuellement.', flags: MessageFlags.Ephemeral });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId('pay_taxes_modal')
      .setTitle('Payer les taxes pays');

    const amountInput = new TextInputBuilder()
      .setCustomId('taxAmountInput')
      .setLabel(`Montant payé (max ${totalDue.toFixed(2)} 💰)`) // label requis
      .setPlaceholder('Ex: 500.00')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput);
    modal.addComponents(...[row]);

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
    // Préparer un tableau enrichi temporaire
    const companiesWithUnpaid = await Promise.all(companies.map(async (company) => {
      const unpaidSales = company.type === 'Agricole'
        ? await Sale.find({ companyId: company.companyId, status: 'APPROVED', countryTaxPaid: false })
        : undefined;
      const unpaidContracts = company.type === 'Build'
        ? await Contract.find({ companyId: company.companyId, status: 'APPROVED', countryTaxPaid: false })
        : undefined;
      return { ...company.toObject(), unpaidSales, unpaidContracts };
    }));
    const { summaryByCompany, totalGrandDue } = getSummaryByCompany(companiesWithUnpaid);
    if (Object.keys(summaryByCompany).length === 0) {
      await interaction.editReply('✅ Aucune taxe pays due actuellement.');
      return;
    }
    const embed = buildTaxReminderEmbed(interaction.guild, summaryByCompany, totalGrandDue);
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error(`Erreur lors du calcul du résumé: ${error}`);
    await interaction.editReply('❌ Erreur lors du calcul du résumé.');
  }
}


// Génère ou met à jour le message de rappel d'impôts dans le salon dédié
function getSummaryByCompany(companies: any[]): { summaryByCompany: any, totalGrandDue: number } {
  const summaryByCompany: any = {};
  let totalGrandDue = 0;
  for (const company of companies) {
    let totalDue = 0;
    let totalItems = 0;
    // Ventes non payées
    if (company.type === 'Agricole' && company.unpaidSales) {
      totalDue += company.unpaidSales.reduce((sum: number, sale: any) => sum + sale.countryTaxAmount, 0);
      totalItems += company.unpaidSales.length;
    }
    // Contrats non payés
    if (company.type === 'Build' && company.unpaidContracts) {
      totalDue += company.unpaidContracts.reduce((sum: number, contract: any) => sum + contract.countryTax, 0);
      totalItems += company.unpaidContracts.length;
    }
    if (totalItems > 0) {
      summaryByCompany[company.companyId] = {
        name: company.name,
        emoji: company.emoji,
        type: company.type,
        totalDue,
        itemCount: totalItems,
      };
      totalGrandDue += totalDue;
    }
  }
  return { summaryByCompany, totalGrandDue };
}

export async function upsertTaxReminderMessage(guild: any, config: any): Promise<string> {
  const taxesChannelId = config.channels.taxesChannelId;
  if (!taxesChannelId) return '❌ Salon impôts non configuré.';
  const taxesChannel = await guild.channels.fetch(taxesChannelId).catch(() => null);
  if (taxesChannel?.type !== 0) return '❌ Salon impôts non trouvé.';

  // Générer l'embed (copie de la logique du scheduler)

  // Pré-charger les ventes/contrats impayés pour chaque entreprise
  const companies = await Company.find({ guildId: config.guildId });
  if (companies.length === 0) return '❌ Aucune entreprise sur ce serveur.';
  const companiesWithUnpaid = await Promise.all(companies.map(async (company) => {
    const unpaidSales = company.type === 'Agricole'
      ? await Sale.find({ companyId: company.companyId, status: 'APPROVED', countryTaxPaid: false })
      : undefined;
    const unpaidContracts = company.type === 'Build'
      ? await Contract.find({ companyId: company.companyId, status: 'APPROVED', countryTaxPaid: false })
      : undefined;
    return { ...company.toObject(), unpaidSales, unpaidContracts };
  }));
  const { summaryByCompany, totalGrandDue } = getSummaryByCompany(companiesWithUnpaid);
  if (totalGrandDue === 0) return '✅ Aucune taxe à payer pour le moment.';

  const embed = buildTaxReminderEmbed(guild, summaryByCompany, totalGrandDue);

  // Chercher un message existant (par titre d'embed)
  const messages = await taxesChannel.messages.fetch({ limit: 10 });
  let reminderMessage = null;
  for (const message of messages.values()) {
    if (message.embeds.length > 0 && message.embeds[0].title === '🏛️ RAPPEL - Taxes Pays à Payer') {
      reminderMessage = message;
      break;
    }
  }
  // Ping roles chef + cadre
  const pingRoles = [config.roles.chefRoleId, config.roles.officerRoleId];
  const mentions = pingRoles.map((roleId: string) => `<@&${roleId}>`).join(' ');

  if (reminderMessage) {
    await reminderMessage.edit({ content: mentions, embeds: [embed] });
    return '✅ Rappel d\'impôts mis à jour !';
  } else {
    await taxesChannel.send({ content: mentions, embeds: [embed] });
    return '✅ Nouveau rappel d\'impôts créé !';
  }
}


async function handleGenerateTaxReminder(interaction: any): Promise<void> {
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
    const result = await upsertTaxReminderMessage(guild, config);
    await interaction.editReply(result);
  } catch (error) {
    logger.error(`Erreur lors de la génération du rappel d'impôts: ${error}`);
    await interaction.editReply('❌ Erreur lors de la génération du rappel d\'impôts.');
  }
}
