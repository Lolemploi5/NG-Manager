import { MinistryPost } from '../../db/models/MinistryPost';
import { generateShortId } from '../../utils/uuid';
import { EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger';

export class MinistryService {
  /**
   * Crée un nouveau poste ministériel
   */
  static async createPost(
    guildId: string,
    name: string,
    emoji?: string
  ): Promise<any> {
    const post = await MinistryPost.create({
      postId: generateShortId(),
      guildId,
      name,
      emoji: emoji || '📋',
      holders: [],
    });

    logger.info(`Poste créé: ${post.postId} - ${name} dans la guild ${guildId}`);
    return post;
  }

  /**
   * Assigne un membre à un poste
   */
  static async assignToPost(
    postId: string,
    userId: string,
    userName: string
  ): Promise<any> {
    const post = await MinistryPost.findOne({ postId });
    if (!post) {
      throw new Error('Poste non trouvé');
    }

    // Vérifier si le membre est déjà assigné
    const alreadyAssigned = post.holders.some(h => h.userId === userId);
    if (alreadyAssigned) {
      throw new Error('Ce membre est déjà assigné à ce poste');
    }

    post.holders.push({
      userId,
      userName,
      assignedAt: new Date(),
    });

    await post.save();
    logger.info(`${userName} (${userId}) assigné au poste ${postId}`);
    return post;
  }

  /**
   * Retire un membre d'un poste
   */
  static async removeFromPost(
    postId: string,
    userId: string
  ): Promise<any> {
    const post = await MinistryPost.findOne({ postId });
    if (!post) {
      throw new Error('Poste non trouvé');
    }

    const holderIndex = post.holders.findIndex(h => h.userId === userId);
    if (holderIndex === -1) {
      throw new Error('Ce membre n\'est pas assigné à ce poste');
    }

    post.holders.splice(holderIndex, 1);
    await post.save();

    logger.info(`Membre ${userId} retiré du poste ${postId}`);
    return post;
  }

  /**
   * Liste tous les postes d'une guild
   */
  static async listPosts(guildId: string): Promise<any[]> {
    const posts = await MinistryPost.find({ guildId }).sort({ name: 1 }).lean();
    return posts;
  }

  /**
   * Récupère un poste spécifique
   */
  static async getPost(postId: string): Promise<any> {
    const post = await MinistryPost.findOne({ postId }).lean();
    return post;
  }

  /**
   * Génère un embed pour afficher un poste
   */
  static createPostEmbed(post: any): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`${post.emoji || '📋'} ${post.name}`)
      .addFields({
        name: '🆔 ID du poste',
        value: `\`${post.postId}\``,
        inline: true
      });

    if (post.holders && post.holders.length > 0) {
      const holdersList = post.holders.map((h: any) => {
        const date = new Date(h.assignedAt);
        return `• <@${h.userId}> - *Depuis le <t:${Math.floor(date.getTime() / 1000)}:D>*`;
      }).join('\n');

      embed.addFields({
        name: `👥 Titulaires (${post.holders.length})`,
        value: holdersList,
        inline: false
      });
    } else {
      embed.addFields({
        name: '👥 Titulaires',
        value: '*Poste vacant*',
        inline: false
      });
    }

    embed.setTimestamp();
    return embed;
  }

  /**
   * Génère l'organigramme complet de la guild
   */
  static async generateOrgChart(guildId: string): Promise<EmbedBuilder> {
    const posts = await this.listPosts(guildId);

    const embed = new EmbedBuilder()
      .setTitle('🏛️ Organigramme du Pays')
      .setDescription('Structure organisationnelle et hiérarchie des postes')
      .setColor(0x5865F2)
      .setTimestamp();

    if (posts.length === 0) {
      embed.addFields({
        name: '📋 Postes',
        value: '*Aucun poste créé pour le moment.*\nUtilisez `/poste creer` pour créer un poste.',
        inline: false
      });
    } else {
      for (const post of posts) {
        const holders = post.holders && post.holders.length > 0
          ? post.holders.map((h: any) => `<@${h.userId}>`).join(', ')
          : '*Poste vacant*';

        embed.addFields({
          name: `${post.emoji || '📋'} ${post.name}`,
          value: `${holders}\n*ID: \`${post.postId}\`*`,
          inline: true
        });
      }

      embed.setFooter({
        text: `${posts.length} poste(s) • ${posts.reduce((sum, p) => sum + (p.holders?.length || 0), 0)} titulaire(s)`
      });
    }

    return embed;
  }

  /**
   * Crée un embed pour la liste des postes
   */
  static createPostsListEmbed(posts: any[]): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle('📋 Liste des Postes Ministériels')
      .setColor(0x5865F2)
      .setTimestamp();

    if (posts.length === 0) {
      embed.setDescription('*Aucun poste créé pour le moment.*');
    } else {
      const postsList = posts.map(post => {
        const holdersCount = post.holders?.length || 0;
        const status = holdersCount > 0 ? `✅ ${holdersCount} titulaire(s)` : '⚪ Vacant';
        return `${post.emoji || '📋'} **${post.name}**\n${status} • ID: \`${post.postId}\``;
      }).join('\n\n');

      embed.setDescription(postsList);
      embed.setFooter({
        text: `${posts.length} poste(s) au total`
      });
    }

    return embed;
  }
}
