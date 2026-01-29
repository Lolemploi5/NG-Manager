import { Client, GatewayIntentBits, Partials, Collection } from 'discord.js';

export interface ExtendedClient extends Client {
  commands: Collection<string, any>;
}

export function createClient(): ExtendedClient {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
    ],
    partials: [Partials.Channel],
  }) as ExtendedClient;

  client.commands = new Collection();

  return client;
}
