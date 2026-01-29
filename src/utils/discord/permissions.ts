import { GuildMember, PermissionFlagsBits } from 'discord.js';

export function hasAdminPermission(member: GuildMember): boolean {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

export function hasManageRolesPermission(member: GuildMember): boolean {
  return (
    member.permissions.has(PermissionFlagsBits.ManageRoles) ||
    member.permissions.has(PermissionFlagsBits.Administrator)
  );
}

export function hasManageChannelsPermission(member: GuildMember): boolean {
  return (
    member.permissions.has(PermissionFlagsBits.ManageChannels) ||
    member.permissions.has(PermissionFlagsBits.Administrator)
  );
}
