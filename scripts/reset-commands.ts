import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const clientId = process.env.DISCORD_CLIENT_ID;
const token = process.env.DISCORD_TOKEN;
const guildId = process.env.DEV_GUILD_ID; // Optionnel, pour le serveur de test

if (!clientId || !token) {
  console.error('❌ DISCORD_CLIENT_ID et DISCORD_TOKEN sont requis dans .env');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(token);

async function resetCommands() {
  try {
    // Supprimer toutes les commandes globales
    await rest.put(Routes.applicationCommands(clientId), { body: [] });
    console.log('✅ Toutes les commandes globales supprimées');

    if (guildId) {
      // Supprimer toutes les commandes du serveur de test
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
      console.log(`✅ Toutes les commandes du serveur ${guildId} supprimées`);
    }

    console.log('🎉 Nettoyage terminé. Relance ton bot pour réenregistrer les commandes.');
  } catch (error) {
    console.error('❌ Erreur lors de la suppression des commandes :', error);
  }
}

resetCommands();
