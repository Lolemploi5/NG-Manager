import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { MinistryService } from './ministry.service';
import { logger } from '../../utils/logger';
import { checkPermissions } from '../../utils/discord/permissions';

export const ministryCommands = [
  new SlashCommandBuilder()
    .setName('poste')
    .setDescription('Gestion des postes ministériels')
    .addSubcommand((sub) =>
      sub
        .setName('creer')
        .setDescription('Créer un nouveau poste')
        .addStringOption((opt) =>
          opt.setName('name').setDescription('Nom du poste').setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName('emoji').setDescription('Emoji du poste').setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('assigner')
        .setDescription('Assigner un membre à un poste')
        .addStringOption((opt) =>
          opt.setName('poste_id').setDescription('ID du poste').setRequired(true)
        )
        .addUserOption((opt) =>
          opt.setName('user').setDescription('Membre à assigner').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('retirer')
        .setDescription('Retirer un membre d\'un poste')
        .addStringOption((opt) =>
          opt.setName('poste_id').setDescription('ID du poste').setRequired(true)
        )
        .addUserOption((opt) =>
          opt.setName('user').setDescription('Membre à retirer').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('voir')
        .setDescription('Voir les détails d\'un poste')
        .addStringOption((opt) =>
          opt.setName('poste_id').setDescription('ID du poste').setRequired(true)
        )
    )
    .addSubcommand((sub) => sub.setName('liste').setDescription('Lister tous les postes')),
  new SlashCommandBuilder()
    .setName('organigramme')
    .setDescription('Afficher l\'organigramme du pays'),
];

export async function handleMinistryCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const commandName = interaction.commandName;

    if (commandName === 'organigramme') {
      await handleOrganigramme(interaction);
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'creer':
        await handleCreatePost(interaction);
        break;
      case 'assigner':
        await handleAssignPost(interaction);
        break;
      case 'retirer':
        await handleRemovePost(interaction);
        break;
      case 'voir':
        await handleViewPost(interaction);
        break;
      case 'liste':
        await handleListPosts(interaction);
        break;
      default:
        await interaction.reply({
          content: '❌ Sous-commande non reconnue.',
          flags: MessageFlags.Ephemeral,
        });
    }
  } catch (error) {
    logger.error('Erreur dans handleMinistryCommand:', error);

    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue';

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({
        content: `❌ ${errorMessage}`,
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await interaction.reply({
        content: `❌ ${errorMessage}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}

async function handleCreatePost(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({
      content: '❌ Cette commande ne peut être utilisée que dans un serveur.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guildId = interaction.guild.id;

  // Vérifier les permissions (Chef ou Officier)
  const hasPermission = await checkPermissions(guildId, interaction.user.id, ['chef', 'officer']);
  if (!hasPermission) {
    await interaction.reply({
      content: '❌ Vous devez être Chef ou Officier pour créer un poste.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const name = interaction.options.getString('name', true);
  const emoji = interaction.options.getString('emoji') || undefined;

  await interaction.deferReply();

  const post = await MinistryService.createPost(guildId, name, emoji);

  const embed = MinistryService.createPostEmbed(post);

  await interaction.editReply({
    content: '✅ Poste créé avec succès !',
    embeds: [embed],
  });
}

async function handleAssignPost(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({
      content: '❌ Cette commande ne peut être utilisée que dans un serveur.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guildId = interaction.guild.id;

  // Vérifier les permissions
  const hasPermission = await checkPermissions(guildId, interaction.user.id, ['chef', 'officer']);
  if (!hasPermission) {
    await interaction.reply({
      content: '❌ Vous devez être Chef ou Officier pour assigner un membre à un poste.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const postId = interaction.options.getString('poste_id', true);
  const user = interaction.options.getUser('user', true);

  await interaction.deferReply();

  const post = await MinistryService.assignToPost(postId, user.id, user.username);

  const embed = MinistryService.createPostEmbed(post);

  await interaction.editReply({
    content: `✅ ${user.username} a été assigné au poste !`,
    embeds: [embed],
  });
}

async function handleRemovePost(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({
      content: '❌ Cette commande ne peut être utilisée que dans un serveur.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guildId = interaction.guild.id;

  // Vérifier les permissions
  const hasPermission = await checkPermissions(guildId, interaction.user.id, ['chef', 'officer']);
  if (!hasPermission) {
    await interaction.reply({
      content: '❌ Vous devez être Chef ou Officier pour retirer un membre d\'un poste.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const postId = interaction.options.getString('poste_id', true);
  const user = interaction.options.getUser('user', true);

  await interaction.deferReply();

  const post = await MinistryService.removeFromPost(postId, user.id);

  const embed = MinistryService.createPostEmbed(post);

  await interaction.editReply({
    content: `✅ ${user.username} a été retiré du poste.`,
    embeds: [embed],
  });
}

async function handleViewPost(interaction: ChatInputCommandInteraction): Promise<void> {
  const postId = interaction.options.getString('poste_id', true);

  await interaction.deferReply();

  const post = await MinistryService.getPost(postId);

  if (!post) {
    await interaction.editReply({
      content: `❌ Poste \`${postId}\` non trouvé.`,
    });
    return;
  }

  const embed = MinistryService.createPostEmbed(post);

  await interaction.editReply({
    embeds: [embed],
  });
}

async function handleListPosts(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({
      content: '❌ Cette commande ne peut être utilisée que dans un serveur.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guildId = interaction.guild.id;

  await interaction.deferReply();

  const posts = await MinistryService.listPosts(guildId);

  const embed = MinistryService.createPostsListEmbed(posts);

  await interaction.editReply({
    embeds: [embed],
  });
}

async function handleOrganigramme(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({
      content: '❌ Cette commande ne peut être utilisée que dans un serveur.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guildId = interaction.guild.id;

  await interaction.deferReply();

  const embed = await MinistryService.generateOrgChart(guildId);

  await interaction.editReply({
    embeds: [embed],
  });
}
