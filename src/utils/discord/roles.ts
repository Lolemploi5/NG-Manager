import { Guild, Role, GuildMember } from 'discord.js';

export function findRoleByName(guild: Guild, name: string): Role | undefined {
  return guild.roles.cache.find((role) => role.name === name);
}

export function hasRole(member: GuildMember, roleId: string): boolean {
  return member.roles.cache.has(roleId);
}

export function hasAnyRole(member: GuildMember, roleIds: string[]): boolean {
  return roleIds.some((roleId) => member.roles.cache.has(roleId));
}
