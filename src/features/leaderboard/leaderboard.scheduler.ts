import cron from 'node-cron';
import { Client } from 'discord.js';
import { GuildConfig } from '../../db/models/GuildConfig';
import { ActivityEvent } from '../../db/models/ActivityEvent';
import { logger } from '../../utils/logger';

export function startLeaderboardScheduler(_client: Client): void {
  // Chaque lundi à 9h
  cron.schedule('0 9 * * 1', async () => {
    logger.info('📊 Génération des classements hebdomadaires...');
    await generateWeeklyLeaderboards();
  });

  logger.info('📅 Scheduler du classement démarré');
}

async function generateWeeklyLeaderboards(): Promise<void> {
  try {
    const configs = await GuildConfig.find({ 'leaderboard.enabled': true });

    for (const config of configs) {
      if (!config.leaderboard.channelId) continue;

      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const events = await ActivityEvent.find({
        guildId: config.guildId,
        createdAt: { $gte: oneWeekAgo },
      });

      // Agréger les points par utilisateur
      const userPoints: Map<string, { name: string; points: number }> = new Map();

      for (const event of events) {
        const current = userPoints.get(event.userId) || { name: event.userName, points: 0 };
        current.points += event.points;
        userPoints.set(event.userId, current);
      }

      // Trier et prendre le top 10
      const top10 = Array.from(userPoints.entries())
        .sort((a, b) => b[1].points - a[1].points)
        .slice(0, 10);

      logger.debug(`Top 10 pour ${config.countryName}:`, top10);

      // Envoyer le classement dans le salon configuré
      // TODO: implémenter l'envoi du message
    }
  } catch (error) {
    logger.error('Erreur lors de la génération des classements:', error);
  }
}
