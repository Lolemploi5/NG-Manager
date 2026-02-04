import { REST, Routes } from 'discord.js';
import { logger } from '../utils/logger';
import { setupCommands } from '../features/setup/setup.commands';
import { objectivesCommands } from '../features/objectives/objectives.commands';
import { companiesCommands } from '../features/companies/companies.commands';
import { taxesCommands } from '../features/taxes/taxes.commands';



export async function registerCommands(
  clientId: string,
  token: string,
  guildId?: string
): Promise<void> {
  const commands: any[] = [
    ...setupCommands,
    ...objectivesCommands,
    ...companiesCommands,
    ...taxesCommands,


  ];

  const commandsData = commands.map((cmd) => cmd.toJSON());

  const rest = new REST({ version: '10' }).setToken(token);

  try {
    logger.info(`🔄 Enregistrement de ${commandsData.length} commandes...`);

    if (guildId) {
      // Dev mode: enregistrer uniquement sur le serveur de test
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: commandsData,
      });
      logger.info(`✅ Commandes enregistrées sur le serveur de test (${guildId})`);
    } else {
      // Production: enregistrer globalement
      await rest.put(Routes.applicationCommands(clientId), {
        body: commandsData,
      });
      logger.info('✅ Commandes enregistrées globalement');
    }
  } catch (error) {
    logger.error("❌ Erreur lors de l'enregistrement des commandes:", error);
    throw error;
  }
}
