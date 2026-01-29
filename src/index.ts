import { env } from './config/env';
import { logger } from './utils/logger';
import { connectDB } from './db/connect';
import { createClient } from './client/createClient';
import { registerCommands } from './client/registerCommands';
import { handleInteraction } from './handlers/interactionHandler';
import { startHealthServer } from './web/health';
import { startTaxScheduler } from './features/taxes/taxes.scheduler';
import { startLeaderboardScheduler } from './features/leaderboard/leaderboard.scheduler';

async function main(): Promise<void> {
  logger.info('🚀 Démarrage de NG Manager...');

  // Connexion MongoDB
  await connectDB(env.MONGODB_URI);

  // Création du client Discord
  const client = createClient();

  // Enregistrement des événements
  client.on('clientReady', async () => {
    logger.info(`✅ Bot connecté en tant que ${client.user?.tag}`);

    // Enregistrer les commandes
    await registerCommands(env.DISCORD_CLIENT_ID, env.DISCORD_TOKEN, env.DEV_GUILD_ID);

    // Démarrer les schedulers
    startTaxScheduler(client);
    startLeaderboardScheduler(client);
  });

  client.on('interactionCreate', async (interaction) => {
    await handleInteraction(interaction);
  });

  // Connexion Discord
  await client.login(env.DISCORD_TOKEN);

  // Démarrer le serveur de health check
  startHealthServer(env.PORT);

  logger.info('✅ NG Manager démarré avec succès');
}

// Gestion des erreurs non capturées
process.on('unhandledRejection', (error) => {
  logger.error('Erreur non gérée:', error);
});

process.on('uncaughtException', (error) => {
  logger.error('Exception non capturée:', error);
  process.exit(1);
});

// Lancement
main().catch((error) => {
  logger.error('Erreur fatale au démarrage:', error);
  process.exit(1);
});
