import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { GuildConfig } from '../../db/models/GuildConfig';
import { logger } from '../../utils/logger';
import { env } from '../../config/env';

export const setupCommands = [
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configuration initiale du pays sur ce serveur')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) =>
      option.setName('country_name').setDescription('Nom du pays').setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('mode_roles')
        .setDescription('Mode de gestion des rôles')
        .setRequired(false)
        .addChoices(
          { name: 'Créer les rôles', value: 'CREATE' },
          { name: 'Mapper les rôles existants', value: 'MAP' }
        )
    )
    .addBooleanOption((option) =>
      option.setName('enable_logs').setDescription('Activer le salon de logs').setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName('enable_taxes_channel')
        .setDescription('Activer le salon des impôts')
        .setRequired(false)
    )
    .addNumberOption((option) =>
      option
        .setName('server_tax_rate')
        .setDescription('Taux de taxe serveur (ex: 0.00)')
        .setRequired(false)
        .setMinValue(0)
        .setMaxValue(1)
    )
    .addNumberOption((option) =>
      option
        .setName('country_tax_rate')
        .setDescription('Taux de taxe pays (ex: 0.05)')
        .setRequired(false)
        .setMinValue(0)
        .setMaxValue(1)
    )
    .addNumberOption((option) =>
      option
        .setName('default_company_tax_rate')
        .setDescription('Taux de taxe entreprise par défaut (ex: 0.15)')
        .setRequired(false)
        .setMinValue(0)
        .setMaxValue(1)
    ),
];

export async function handleSetupCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.editReply('❌ Cette commande doit être utilisée sur un serveur.');
      return;
    }

    const countryName = interaction.options.getString('country_name', true);
    const modeRoles = (interaction.options.getString('mode_roles') as 'CREATE' | 'MAP') || 'CREATE';
    const enableLogs = interaction.options.getBoolean('enable_logs') || false;
    const enableTaxesChannel = interaction.options.getBoolean('enable_taxes_channel') || false;
    const serverTaxRate =
      interaction.options.getNumber('server_tax_rate') ?? env.DEFAULT_TAX_SERVER;
    const countryTaxRate =
      interaction.options.getNumber('country_tax_rate') ?? env.DEFAULT_TAX_COUNTRY;
    const defaultCompanyTaxRate =
      interaction.options.getNumber('default_company_tax_rate') ?? env.DEFAULT_TAX_COMPANY;

    // Vérifier si déjà configuré
    const existingConfig = await GuildConfig.findOne({ guildId: guild.id });
    if (existingConfig) {
      await interaction.editReply(
        '⚠️  Ce serveur est déjà configuré. Utilisez les commandes de mise à jour pour modifier la configuration.'
      );
      return;
    }

    // Créer ou mapper les rôles
    let chefRole, officerRole, memberRole, recruitRole;

    if (modeRoles === 'CREATE') {
      chefRole = await guild.roles.create({ name: '👑 Chef', color: 0xffd700 });
      officerRole = await guild.roles.create({ name: '🛡️ Officier', color: 0xc0c0c0 });
      memberRole = await guild.roles.create({ name: '👤 Membre', color: 0x00ff00 });
      recruitRole = await guild.roles.create({ name: '🌱 Recrue', color: 0x808080 });
    } else {
      // MAP mode: chercher les rôles existants
      chefRole = guild.roles.cache.find((r) => r.name.includes('Chef'));
      officerRole = guild.roles.cache.find((r) => r.name.includes('Officier'));
      memberRole = guild.roles.cache.find((r) => r.name.includes('Membre'));
      recruitRole = guild.roles.cache.find((r) => r.name.includes('Recrue'));

      if (!chefRole || !officerRole || !memberRole || !recruitRole) {
        await interaction.editReply(
          '❌ Impossible de trouver tous les rôles requis. Assurez-vous que les rôles "Chef", "Officier", "Membre" et "Recrue" existent.'
        );
        return;
      }
    }

    // Créer les salons
    const objectivesChannel = await guild.channels.create({
      name: 'objectifs',
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: guild.id, allow: [PermissionFlagsBits.ViewChannel] },
        {
          id: chefRole.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ManageMessages,
          ],
        },
        {
          id: officerRole.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ManageMessages,
          ],
        },
      ],
    });

    const objectivesValidationChannel = await guild.channels.create({
      name: 'objectifs-validations',
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: chefRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        { id: officerRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      ],
    });

    let taxesChannel;
    if (enableTaxesChannel) {
      taxesChannel = await guild.channels.create({
        name: 'impots',
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: chefRole.id, allow: [PermissionFlagsBits.ViewChannel] },
          { id: officerRole.id, allow: [PermissionFlagsBits.ViewChannel] },
        ],
      });
    }

    let logsChannel;
    if (enableLogs) {
      logsChannel = await guild.channels.create({
        name: 'logs',
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: chefRole.id, allow: [PermissionFlagsBits.ViewChannel] },
          { id: officerRole.id, allow: [PermissionFlagsBits.ViewChannel] },
        ],
      });
    }

    // Sauvegarder la configuration
    await GuildConfig.create({
      guildId: guild.id,
      countryName,
      roles: {
        chefRoleId: chefRole.id,
        officerRoleId: officerRole.id,
        memberRoleId: memberRole.id,
        recruitRoleId: recruitRole.id,
      },
      channels: {
        objectivesChannelId: objectivesChannel.id,
        objectivesValidationChannelId: objectivesValidationChannel.id,
        taxesChannelId: taxesChannel?.id,
        logsChannelId: logsChannel?.id,
      },
      taxes: {
        serverTaxRate,
        countryTaxRate,
        defaultCompanyTaxRate,
      },
      reminders: {
        taxes: {
          enabled: false,
          mode: 'WEEKS',
          every: 1,
        },
      },
      leaderboard: {
        enabled: false,
      },
    });

    logger.info(`Configuration créée pour le serveur ${guild.name} (${guild.id})`);

    const embed = new EmbedBuilder()
      .setTitle('✅ Configuration terminée')
      .setDescription(`Le serveur **${countryName}** a été configuré avec succès !`)
      .addFields(
        { name: '🏛️ Pays', value: countryName, inline: true },
        { name: '👑 Chef', value: `<@&${chefRole.id}>`, inline: true },
        { name: '🛡️ Officier', value: `<@&${officerRole.id}>`, inline: true },
        { name: '👤 Membre', value: `<@&${memberRole.id}>`, inline: true },
        { name: '🌱 Recrue', value: `<@&${recruitRole.id}>`, inline: true },
        { name: '\u200B', value: '\u200B', inline: true },
        { name: '📊 Objectifs', value: `<#${objectivesChannel.id}>`, inline: true },
        { name: '✅ Validations', value: `<#${objectivesValidationChannel.id}>`, inline: true }
      )
      .setColor(0x00ff00)
      .setTimestamp();

    if (taxesChannel) {
      embed.addFields({ name: '💰 Impôts', value: `<#${taxesChannel.id}>`, inline: true });
    }

    if (logsChannel) {
      embed.addFields({ name: '📝 Logs', value: `<#${logsChannel.id}>`, inline: true });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Erreur lors de la configuration:', error);
    await interaction.editReply(
      '❌ Une erreur est survenue lors de la configuration. Assurez-vous que le bot a la permission "Gérer les rôles" sur ce serveur.'
    );
  }
}
