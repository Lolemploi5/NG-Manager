import { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';
import { Company } from '../../db/models/Company';
import { logger } from '../../utils/logger';
import { generateShortId } from '../../utils/uuid';

export const companiesCommands = [
  new SlashCommandBuilder()
    .setName('entreprise')
    .setDescription('Gestion des entreprises')
    .addSubcommand((sub) =>
      sub
        .setName('creer')
        .setDescription('Créer une nouvelle entreprise')
        .addStringOption((opt) =>
          opt.setName('name').setDescription('Nom de l\'entreprise').setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName('type')
            .setDescription('Type d\'entreprise')
            .setRequired(true)
            .addChoices(
              { name: '🌾 Agricole', value: 'Agricole' },
              { name: '🏭 Manufacturière', value: 'Manufacturière' },
              { name: '💼 Service', value: 'Service' },
              { name: '❓ Autre', value: 'Autre' }
            )
        )
        .addStringOption((opt) =>
          opt.setName('emoji').setDescription('Emoji représentant l\'entreprise').setRequired(false)
        )
        .addNumberOption((opt) =>
          opt
            .setName('tax_rate')
            .setDescription('Taux de taxe entreprise (optionnel)')
            .setRequired(false)
            .setMinValue(0)
            .setMaxValue(1)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('liste').setDescription('Lister toutes les entreprises')
    )
    .addSubcommand((sub) =>
      sub
        .setName('voir')
        .setDescription('Voir les détails d\'une entreprise')
        .addStringOption((opt) =>
          opt.setName('entreprise_id').setDescription('ID de l\'entreprise').setRequired(true)
        )
    ),
];

export async function handleCompaniesCommand(interaction: any): Promise<void> {
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'creer':
      await handleCreateCompany(interaction);
      break;
    case 'liste':
      await handleListCompanies(interaction);
      break;
    case 'voir':
      await handleViewCompany(interaction);
      break;
  }
}

async function handleCreateCompany(interaction: any): Promise<void> {
  await interaction.deferReply();

  try {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.editReply('❌ Cette commande doit être utilisée sur un serveur.');
      return;
    }

    const name = interaction.options.getString('name', true);
    const type = interaction.options.getString('type', true);
    const emoji = interaction.options.getString('emoji') || '🏢';
    const customTaxRate = interaction.options.getNumber('tax_rate');

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

async function handleListCompanies(interaction: any): Promise<void> {
  await interaction.deferReply();

  try {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.editReply('❌ Cette commande doit être utilisée sur un serveur.');
      return;
    }

    const companies = await Company.find({ guildId: guild.id });

    if (companies.length === 0) {
      await interaction.editReply('Aucune entreprise créée sur ce serveur.');
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle('📋 Entreprises du serveur')
      .setDescription(`Total: ${companies.length} entreprise(s)`)
      .addFields(
        companies.map((company) => ({
          name: `${company.emoji} ${company.name}`,
          value: `Type: ${company.type} | Taxe: ${(company.taxCompanyRate * 100).toFixed(1)}% | ID: \`${company.companyId}\``,
          inline: false,
        }))
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error(`Erreur lors de la liste des entreprises: ${error}`);
    await interaction.editReply('❌ Erreur lors du chargement des entreprises.');
  }
}

async function handleViewCompany(interaction: any): Promise<void> {
  await interaction.deferReply();

  try {
    const companyId = interaction.options.getString('entreprise_id', true);
    const company = await Company.findOne({ companyId });

    if (!company) {
      await interaction.editReply('❌ Entreprise non trouvée.');
      return;
    }

    if (company.guildId !== interaction.guild.id) {
      await interaction.editReply('❌ Cette entreprise n\'appartient pas à ce serveur.');
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle(`${company.emoji} ${company.name}`)
      .addFields(
        { name: 'Type', value: company.type, inline: true },
        { name: 'Taux de taxe', value: `${(company.taxCompanyRate * 100).toFixed(1)}%`, inline: true },
        { name: 'Catégorie', value: `<#${company.categoryId}>`, inline: false },
        { name: 'Channel Ventes', value: `<#${company.channels.salesChannelId}>`, inline: true },
        { name: 'Channel Confirmations', value: `<#${company.channels.confirmationsChannelId}>`, inline: true },
        { name: 'CEO', value: `<@&${company.roles.ceoRoleId}>`, inline: true },
        { name: 'Manager', value: `<@&${company.roles.managerRoleId}>`, inline: true },
        { name: 'Employé', value: `<@&${company.roles.employeeRoleId}>`, inline: true },
        { name: 'Créée par', value: `<@${company.createdBy}>`, inline: true }
      )
      .setFooter({ text: `ID: ${company.companyId}` })
      .setTimestamp(company.createdAt);

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error(`Erreur lors de la lecture d'entreprise: ${error}`);
    await interaction.editReply('❌ Erreur lors du chargement des détails.');
  }
}
