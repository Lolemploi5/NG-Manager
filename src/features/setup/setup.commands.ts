import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { GuildConfig } from '../../db/models/GuildConfig';
import { Objective } from '../../db/models/Objective';
import { Company } from '../../db/models/Company';
import { Sale } from '../../db/models/Sale';
import { TaxRemittance } from '../../db/models/TaxRemittance';
import { ActivityEvent } from '../../db/models/ActivityEvent';
import { MinistryPost } from '../../db/models/MinistryPost';
import { logger } from '../../utils/logger';
import { env } from '../../config/env';

export const setupCommands = [
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configuration et gestion du serveur')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('init')
        .setDescription('Configuration initiale du pays sur ce serveur')
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
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('reset')
        .setDescription('⚠️ SUPPRIMER TOUTE la configuration du serveur (irréversible!)')
        .addBooleanOption((option) =>
          option
            .setName('confirm')
            .setDescription('Confirmer la suppression complète (obligatoire)')
            .setRequired(true)
        )
    ),
];

export async function handleSetupCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  
  if (subcommand === 'init') {
    await handleSetupInit(interaction);
  } else if (subcommand === 'reset') {
    await handleSetupReset(interaction);
  }
}

async function handleSetupInit(interaction: ChatInputCommandInteraction): Promise<void> {
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

    // Créer la catégorie Objectifs
    const objectivesCategory = await guild.channels.create({
      name: '📋 OBJECTIFS',
      type: ChannelType.GuildCategory,
    });

    // Créer les salons dans la catégorie
    const newObjectivesChannel = await guild.channels.create({
      name: 'new-objectifs',
      type: ChannelType.GuildText,
      parent: objectivesCategory.id,
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

    const objectivesChannel = await guild.channels.create({
      name: 'objectifs',
      type: ChannelType.GuildText,
      parent: objectivesCategory.id,
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
      parent: objectivesCategory.id,
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
        newObjectivesChannelId: newObjectivesChannel.id,
        objectivesCategoryId: objectivesCategory.id,
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
        { name: '� Catégorie', value: `<#${objectivesCategory.id}>`, inline: true },
        { name: '🆕 Nouveaux Objectifs', value: `<#${newObjectivesChannel.id}>`, inline: true },
        { name: '�📊 Objectifs', value: `<#${objectivesChannel.id}>`, inline: true },
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

async function handleSetupReset(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.editReply('❌ Cette commande doit être utilisée sur un serveur.');
      return;
    }

    const confirm = interaction.options.getBoolean('confirm', true);
    if (!confirm) {
      await interaction.editReply('❌ Vous devez confirmer avec `confirm: True` pour effectuer le reset.');
      return;
    }

    // Récupérer la configuration existante
    const config = await GuildConfig.findOne({ guildId: guild.id });
    if (!config) {
      await interaction.editReply('❌ Aucune configuration trouvée pour ce serveur.');
      return;
    }

    logger.info(`🔄 Début du reset complet pour le serveur ${guild.name} (${guild.id})`);

    let deletedItems = {
      channels: 0,
      roles: 0,
      objectives: 0,
      companies: 0,
      sales: 0,
      taxes: 0,
      events: 0,
      posts: 0
    };

    // 1. Récupérer toutes les entreprises pour supprimer leurs salons/rôles
    const companies = await Company.find({ guildId: guild.id });
    logger.info(`📊 ${companies.length} entreprise(s) trouvée(s) à nettoyer`);

    // Supprimer les salons et rôles des entreprises
    for (const company of companies) {
      // Supprimer la catégorie et les salons de l'entreprise
      const companyChannelsToDelete = [
        company.categoryId,
        company.channels.salesChannelId,
        company.channels.confirmationsChannelId
      ].filter(Boolean);

      for (const channelId of companyChannelsToDelete) {
        try {
          const channel = await guild.channels.fetch(channelId);
          if (channel) {
            await channel.delete('Reset configuration du serveur');
            deletedItems.channels++;
            logger.info(`✅ Salon entreprise supprimé: ${channel.name}`);
          }
        } catch (error) {
          logger.warn(`⚠️ Impossible de supprimer le salon entreprise ${channelId}: ${error}`);
        }
      }

      // Supprimer les rôles de l'entreprise
      const companyRolesToDelete = [
        company.roles.ceoRoleId,
        company.roles.managerRoleId,
        company.roles.employeeRoleId
      ].filter(Boolean);

      for (const roleId of companyRolesToDelete) {
        try {
          const role = await guild.roles.fetch(roleId);
          if (role) {
            await role.delete('Reset configuration du serveur');
            deletedItems.roles++;
            logger.info(`✅ Rôle entreprise supprimé: ${role.name}`);
          }
        } catch (error) {
          logger.warn(`⚠️ Impossible de supprimer le rôle entreprise ${roleId}: ${error}`);
        }
      }
    }

    // 2. Supprimer les salons créés par la configuration principale
    // 2. Supprimer les salons créés par la configuration principale
    const channelsToDelete = [
      config.channels.objectivesCategoryId,
      config.channels.newObjectivesChannelId,
      config.channels.objectivesChannelId,
      config.channels.objectivesValidationChannelId,
      config.channels.taxesChannelId,
      config.channels.logsChannelId
    ].filter(Boolean);

    for (const channelId of channelsToDelete) {
      try {
        const channel = await guild.channels.fetch(channelId!);
        if (channel) {
          await channel.delete('Reset configuration du serveur');
          deletedItems.channels++;
          logger.info(`✅ Salon principal supprimé: ${channel.name}`);
        }
      } catch (error) {
        logger.warn(`⚠️ Impossible de supprimer le salon principal ${channelId}: ${error}`);
      }
    }

    // 3. Supprimer les rôles créés par la configuration principale
    // 3. Supprimer les rôles créés par la configuration principale
    const rolesToDelete = [
      config.roles.chefRoleId,
      config.roles.officerRoleId,
      config.roles.memberRoleId,
      config.roles.recruitRoleId
    ];

    for (const roleId of rolesToDelete) {
      try {
        const role = await guild.roles.fetch(roleId);
        if (role) {
          await role.delete('Reset configuration du serveur');
          deletedItems.roles++;
          logger.info(`✅ Rôle principal supprimé: ${role.name}`);
        }
      } catch (error) {
        logger.warn(`⚠️ Impossible de supprimer le rôle principal ${roleId}: ${error}`);
      }
    }

    // 4. Supprimer toutes les données de la base de données
    const results = await Promise.allSettled([
      Objective.deleteMany({ guildId: guild.id }),
      Company.deleteMany({ guildId: guild.id }),
      Sale.deleteMany({ guildId: guild.id }),
      TaxRemittance.deleteMany({ guildId: guild.id }),
      ActivityEvent.deleteMany({ guildId: guild.id }),
      MinistryPost.deleteMany({ guildId: guild.id }),
      GuildConfig.deleteOne({ guildId: guild.id })
    ]);

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const deleteResult = result.value as any;
        const collectionNames = ['objectives', 'companies', 'sales', 'taxes', 'events', 'posts', 'config'];
        const count = deleteResult.deletedCount || 0;
        deletedItems[collectionNames[index] as keyof typeof deletedItems] = count;
        logger.info(`✅ ${count} ${collectionNames[index]} supprimé(s)`);
      } else {
        logger.error(`❌ Erreur lors de la suppression: ${result.reason}`);
      }
    });

    // Embed de confirmation
    const embed = new EmbedBuilder()
      .setTitle('🗑️ Reset complet effectué')
      .setDescription(`**${guild.name}** a été complètement nettoyé !`)
      .addFields(
        { name: '📊 Salons supprimés', value: `${deletedItems.channels}`, inline: true },
        { name: '👥 Rôles supprimés', value: `${deletedItems.roles}`, inline: true },
        { name: '\u200B', value: '\u200B', inline: true },
        { name: '🎯 Objectifs', value: `${deletedItems.objectives}`, inline: true },
        { name: '🏢 Entreprises', value: `${deletedItems.companies}`, inline: true },
        { name: '💰 Ventes', value: `${deletedItems.sales}`, inline: true },
        { name: '🧾 Impôts', value: `${deletedItems.taxes}`, inline: true },
        { name: '📝 Événements', value: `${deletedItems.events}`, inline: true },
        { name: '📋 Posts ministère', value: `${deletedItems.posts}`, inline: true }
      )
      .setColor(0xff4444)
      .setFooter({ text: 'Vous pouvez maintenant refaire /setup init pour reconfigurer' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    logger.info(`✅ Reset complet terminé pour ${guild.name}`);

  } catch (error) {
    logger.error('Erreur lors du reset:', error);
    await interaction.editReply(
      '❌ Une erreur est survenue lors du reset. Certains éléments ont pu être partiellement supprimés.'
    );
  }
}
