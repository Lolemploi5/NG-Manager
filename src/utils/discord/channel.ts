import { Guild, TextChannel, ChannelType } from 'discord.js';

export function findChannelByName(guild: Guild, name: string): TextChannel | undefined {
  const channel = guild.channels.cache.find(
    (ch) => ch.name === name && ch.type === ChannelType.GuildText
  );
  return channel as TextChannel | undefined;
}

export async function ensureTextChannel(
  guild: Guild,
  channelId: string
): Promise<TextChannel | null> {
  try {
    const channel = await guild.channels.fetch(channelId);
    if (channel && channel.type === ChannelType.GuildText) {
      return channel as TextChannel;
    }
    return null;
  } catch {
    return null;
  }
}
