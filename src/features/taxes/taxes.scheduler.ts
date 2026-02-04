import cron from 'node-cron';
import { Client, EmbedBuilder, ChannelType } from 'discord.js';
import { GuildConfig } from '../../db/models/GuildConfig';
import { Company } from '../../db/models/Company';
import { Sale } from '../../db/models/Sale';
import { Contract } from '../../db/models/Contract';
import { logger } from '../../utils/logger';

interface TaxReminderState {
  [guildId: string]: {
    messageId?: string;
    lastUpdate: Date;
  };
}

const reminderState: TaxReminderState = {};

export function startTaxScheduler(client: Client): void {
  // Vérifier toutes les heures si des rappels doivent être envoyés
  cron.schedule('0 * * * *', async () => {
    logger.debug('Vérification des rappels d\'impôts...');
    await generateTaxReminders(client);
  });

  logger.info('📅 Scheduler des impôts démarré');
}

async function generateTaxReminders(client: Client): Promise<void> {
  try {
    const configs = await GuildConfig.find({});

    for (const config of configs) {
      try {
        const guild = await client.guilds.fetch(config.guildId);
        if (!guild) continue;

        const taxesChannel = config.channels.taxesChannelId ? guild.channels.cache.get(config.channels.taxesChannelId) : null;
        if (!taxesChannel || taxesChannel.type !== ChannelType.GuildText) continue;

        // Récupérer les entreprises du serveur
        const companies = await Company.find({ guildId: config.guildId });
        if (companies.length === 0) continue;

        // Récupérer les ventes non payées par entreprise
        const summaryByCompany: any = {};
        let totalGrandDue = 0;

        for (const company of companies) {
          let totalDue = 0;
          let totalItems = 0;
          let itemIds: string[] = [];

          // Récupérer les ventes non payées (pour les entreprises Agricole)
          if (company.type === 'Agricole') {
            const unpaidSales = await Sale.find({
              companyId: company.companyId,
              status: 'APPROVED',
              countryTaxPaid: false,
            });

            if (unpaidSales.length > 0) {
              totalDue += unpaidSales.reduce((sum, sale) => sum + sale.countryTaxAmount, 0);
              totalItems += unpaidSales.length;
              itemIds.push(...unpaidSales.map((s: any) => s.saleId));
            }
          }

          // Récupérer les contrats non payés (pour les entreprises Build)
          if (company.type === 'Build') {
            const unpaidContracts = await Contract.find({
              companyId: company.companyId,
              status: 'APPROVED',
              countryTaxPaid: false,
            });

            if (unpaidContracts.length > 0) {
              totalDue += unpaidContracts.reduce((sum, contract) => sum + contract.countryTax, 0);
              totalItems += unpaidContracts.length;
              itemIds.push(...unpaidContracts.map((c: any) => c.contractId));
            }
          }

          if (totalItems > 0) {
            summaryByCompany[company.companyId] = {
              name: company.name,
              emoji: company.emoji,
              type: company.type,
              ceoRoleId: company.roles.ceoRoleId,
              totalDue,
              itemCount: totalItems,
              itemIds,
            };
            totalGrandDue += totalDue;
          }
        }

        // Si rien à payer, skip
        if (totalGrandDue === 0) {
          // Supprimer le message s'il existe
          if (reminderState[config.guildId]?.messageId) {
            try {
              const msg = await taxesChannel.messages.fetch(reminderState[config.guildId].messageId!);
              await msg.delete();
              delete reminderState[config.guildId];
            } catch (e) {
              // Message déjà supprimé
            }
          }
          continue;
        }

        // Créer l'embed du rappel
        const embed = new EmbedBuilder()
          .setColor(0xE67E22)
          .setTitle('🏛️ RAPPEL - Taxes Pays à Payer')
          .setDescription(`Semaine du **${getWeekStartDate()}** au **${getWeekEndDate()}**`)
          .setThumbnail(guild.iconURL() || null)
          .addFields({ name: '\u200B', value: '\u200B' }); // Espaceur

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
          {
            name: '📈 TOTAL À PAYER',
            value: `**${totalGrandDue.toFixed(2)} 💰**`,
            inline: false,
          },
          {
            name: '💡 Action',
            value: 'Utilisez `/impots payer` pour déclarer le paiement',
            inline: false,
          }
        );

        embed.setFooter({ text: 'Mise à jour automatique chaque heure' }).setTimestamp();

        // Ping Chef + Cadres
        const pingRoles = [config.roles.chefRoleId, config.roles.officerRoleId];
        const mentions = pingRoles.map((roleId: string) => `<@&${roleId}>`).join(' ');

        // Envoyer ou éditer le message
        if (reminderState[config.guildId]?.messageId) {
          try {
            const existingMsg = await taxesChannel.messages.fetch(reminderState[config.guildId].messageId!);
            await existingMsg.edit({ content: mentions, embeds: [embed] });
            reminderState[config.guildId].lastUpdate = new Date();
          } catch (e) {
            // Message supprimé, envoyer un nouveau
            const newMsg = await taxesChannel.send({ content: mentions, embeds: [embed] });
            reminderState[config.guildId] = {
              messageId: newMsg.id,
              lastUpdate: new Date(),
            };
          }
        } else {
          const newMsg = await taxesChannel.send({ content: mentions, embeds: [embed] });
          reminderState[config.guildId] = {
            messageId: newMsg.id,
            lastUpdate: new Date(),
          };
        }

        logger.info(`✅ Rappel d'impôts généré pour ${guild.name}`);
      } catch (error) {
        logger.warn(`Erreur pour le serveur ${config.guildId}: ${error}`);
      }
    }
  } catch (error) {
    logger.error(`Erreur lors de la génération des rappels: ${error}`);
  }
}

function getWeekStartDate(): string {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diff = now.getDate() - dayOfWeek;
  const monday = new Date(now.setDate(diff));
  return monday.toLocaleDateString('fr-FR');
}

function getWeekEndDate(): string {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diff = now.getDate() - dayOfWeek + 6;
  const sunday = new Date(now.setDate(diff));
  return sunday.toLocaleDateString('fr-FR');
}
