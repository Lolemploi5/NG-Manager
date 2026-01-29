import cron from 'node-cron';
import { Client } from 'discord.js';
import { GuildConfig } from '../../db/models/GuildConfig';
import { logger } from '../../utils/logger';

export function startTaxScheduler(_client: Client): void {
  // Vérifier toutes les heures si des rappels doivent être envoyés
  cron.schedule('0 * * * *', async () => {
    logger.debug('Vérification des rappels d\'impôts...');
    await checkTaxReminders();
  });

  logger.info('📅 Scheduler des impôts démarré');
}

async function checkTaxReminders(): Promise<void> {
  try {
    const configs = await GuildConfig.find({ 'reminders.taxes.enabled': true });

    for (const config of configs) {
      // Logic pour vérifier si un rappel doit être envoyé
      // basé sur config.reminders.taxes.mode et config.reminders.taxes.every
      logger.debug(`Vérification des rappels pour ${config.countryName}`);
    }
  } catch (error) {
    logger.error('Erreur lors de la vérification des rappels:', error);
  }
}
