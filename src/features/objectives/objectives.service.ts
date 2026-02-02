import { Objective, ObjectiveCategory } from '../../db/models/Objective';
import { generateShortId } from '../../utils/uuid';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { logger } from '../../utils/logger';

export class ObjectivesService {
  static async createObjective(data: any): Promise<any> {
    const objective = await Objective.create({
      objectiveId: generateShortId(),
      ...data,
    });
    return objective;
  }

  static async addCriterion(objectiveId: string, criterionData: any): Promise<any> {
    const objective = await Objective.findOne({ objectiveId });
    if (!objective) {
      throw new Error('Objectif non trouvé');
    }

    objective.criteria.push({
      criterionId: generateShortId(),
      ...criterionData,
      currentProgress: 0,
      contributions: [],
      createdAt: new Date(),
    });

    await objective.save();
    return objective;
  }

  static async getObjectives(guildId: string, filters?: any): Promise<any[]> {
    try {
      const query: any = { guildId };
      
      if (filters?.status && filters.status !== '') {
        query.status = filters.status;
      }
      
      if (filters?.category && filters.category !== '') {
        query.category = filters.category;
      }

      logger.info(`Requête Objective.find avec query: ${JSON.stringify(query)}`);
      const objectives = await Objective.find(query).sort({ priority: 1, createdAt: -1 }).lean();
      return objectives;
    } catch (error) {
      logger.error(`Erreur dans getObjectives: ${error}`);
      if (error instanceof Error) {
        logger.error(`Stack: ${error.stack}`);
      }
      throw error;
    }
  }

  static async getObjectiveById(objectiveId: string): Promise<any> {
    try {
      logger.info(`Récupération de l'objectif ${objectiveId}`);
      const objective = await Objective.findOne({ objectiveId }).lean();
      return objective;
    } catch (error) {
      logger.error(`Erreur dans getObjectiveById: ${error}`);
      throw error;
    }
  }

  static calculateProgress(objective: any): number {
    if (!objective.criteria || objective.criteria.length === 0) {
      return 0;
    }

    let totalCriteria = objective.criteria.length;
    let completedCriteria = 0;

    for (const criterion of objective.criteria) {
      if (criterion.targetNumber && criterion.currentProgress >= criterion.targetNumber) {
        completedCriteria++;
      }
    }

    return Math.round((completedCriteria / totalCriteria) * 100);
  }

  static async createObjectiveEmbed(objective: any): Promise<EmbedBuilder> {
    const priorityEmoji = ['⚠️', '🔴', '🟡', '🟢', '⚪'][objective.priority - 1];
    const priorityText = ['Critique', 'Haute', 'Moyenne', 'Faible', 'Très faible'][objective.priority - 1];
    const statusEmoji = objective.status === 'ACTIVE' ? '🔄' : objective.status === 'COMPLETED' ? '✅' : '❌';
    const statusText = objective.status === 'ACTIVE' ? 'Actif' : objective.status === 'COMPLETED' ? 'Complété' : 'Annulé';
    
    const categoryEmojis: Record<ObjectiveCategory, string> = {
      'Économie': '💰',
      'Build': '🏗️',
      'Farm': '🌾',
      'R&D': '🔬',
      'Militaire/Diplomatie': '⚔️'
    };

    const progress = this.calculateProgress(objective);
    const progressBar = this.createProgressBar(progress);

    const embed = new EmbedBuilder()
      .setColor(objective.status === 'COMPLETED' ? 0x57F287 : objective.status === 'ACTIVE' ? 0x5865F2 : 0x747F8D)
      .setTitle(`${priorityEmoji} ${objective.title}`)
      .setDescription(objective.description || '*Aucune description*')
      .addFields(
        { name: '📊 Statut', value: `${statusEmoji} ${statusText}`, inline: true },
        { name: '🎯 Catégorie', value: `${categoryEmojis[objective.category as ObjectiveCategory]} ${objective.category}`, inline: true },
        { name: '⚡ Priorité', value: `${priorityEmoji} ${priorityText}`, inline: true },
        { name: '📈 Progression', value: `${progressBar} **${progress}%**`, inline: false }
      );

    if (objective.deadline) {
      const deadlineDate = new Date(objective.deadline);
      embed.addFields({ name: '📅 Date limite', value: `<t:${Math.floor(deadlineDate.getTime() / 1000)}:D>`, inline: true });
    }

    // Ajouter les critères
    if (objective.criteria && objective.criteria.length > 0) {
      const criteriaText = objective.criteria.map((c: any) => {
        const typeEmoji = this.getCriterionTypeEmoji(c.type);
        const progress = c.targetNumber ? `${c.currentProgress}/${c.targetNumber}` : `${c.currentProgress}`;
        const unit = c.unit || '';
        const percentage = c.targetNumber ? Math.round((c.currentProgress / c.targetNumber) * 100) : 0;
        const bar = this.createProgressBar(percentage, 10);
        return `${typeEmoji} **${c.title}**\n${bar} ${progress} ${unit} (${percentage}%)\n*ID: \`${c.criterionId}\`*`;
      }).join('\n\n');

      embed.addFields({ name: '📋 Critères', value: criteriaText || 'Aucun critère', inline: false });
    }

    embed.setFooter({ text: `ID: ${objective.objectiveId}` })
      .setTimestamp();

    return embed;
  }

  static createObjectiveButtons(objective: any): ActionRowBuilder<ButtonBuilder>[] {
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];

    if (objective.status === 'ACTIVE') {
      const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`objective_add_criterion_${objective.objectiveId}`)
          .setLabel('➕ Ajouter un critère')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`objective_view_contributions_${objective.objectiveId}`)
          .setLabel('📊 Voir les contributions')
          .setStyle(ButtonStyle.Secondary)
      );
      rows.push(row1);

      // Boutons pour chaque critère
      if (objective.criteria && objective.criteria.length > 0) {
        const criteriaButtons = objective.criteria.slice(0, 4).map((c: any) => {
          return new ButtonBuilder()
            .setCustomId(`objective_contribute_${objective.objectiveId}_${c.criterionId}`)
            .setLabel(`Contribuer: ${c.title.substring(0, 30)}`)
            .setStyle(ButtonStyle.Success);
        });

        // Diviser en rows de 4 boutons max
        for (let i = 0; i < criteriaButtons.length; i += 4) {
          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            criteriaButtons.slice(i, i + 4)
          );
          rows.push(row);
        }
      }
    }

    return rows;
  }

  static getCriterionTypeEmoji(type: string): string {
    const emojis: Record<string, string> = {
      'BUILD': '🏗️',
      'ITEM': '📦',
      'LEVEL': '📊',
      'MONEY': '💰',
      'RESOURCE': '🌲',
      'OTHER': '❓'
    };
    return emojis[type] || '❓';
  }

  static createProgressBar(percentage: number, length: number = 20): string {
    const filled = Math.round((percentage / 100) * length);
    const empty = length - filled;
    const filledBar = '█'.repeat(filled);
    const emptyBar = '░'.repeat(empty);
    return `${filledBar}${emptyBar}`;
  }

  static async updateDashboard(_guildId: string, _channelId: string): Promise<void> {
    // Cette fonction est maintenant juste pour la compatibilité
    // La logique est dans generateDashboardEmbed
  }

  static async generateDashboardEmbed(guildId: string): Promise<EmbedBuilder> {
    const objectives = await this.getObjectives(guildId, { status: 'ACTIVE' });

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('📊 Dashboard des Objectifs')
      .setDescription(`Aperçu de tous les objectifs actifs du pays`)
      .setTimestamp();

    if (objectives.length === 0) {
      embed.addFields({ name: '📋 Objectifs', value: 'Aucun objectif actif pour le moment.', inline: false });
    } else {
      const categories: ObjectiveCategory[] = ['Économie', 'Build', 'Farm', 'R&D', 'Militaire/Diplomatie'];
      
      for (const category of categories) {
        const categoryObjectives = objectives.filter(obj => obj.category === category);
        
        if (categoryObjectives.length > 0) {
          const categoryEmojis: Record<ObjectiveCategory, string> = {
            'Économie': '💰',
            'Build': '🏗️',
            'Farm': '🌾',
            'R&D': '🔬',
            'Militaire/Diplomatie': '⚔️'
          };

          const text = categoryObjectives.map(obj => {
            const progress = this.calculateProgress(obj);
            const priorityEmoji = ['⚠️', '🔴', '🟡', '🟢', '⚪'][obj.priority - 1];
            const bar = this.createProgressBar(progress, 10);
            return `${priorityEmoji} **${obj.title}**\n${bar} ${progress}%\n*ID: \`${obj.objectiveId}\`*`;
          }).join('\n\n');

          embed.addFields({ 
            name: `${categoryEmojis[category]} ${category}`, 
            value: text, 
            inline: false 
          });
        }
      }
    }

    embed.setFooter({ text: `Dernière mise à jour` });

    return embed;
  }

  static async addContribution(
    objectiveId: string,
    criterionId: string,
    userId: string,
    userName: string,
    amount: number,
    message?: string,
    proofUrl?: string
  ): Promise<any> {
    const objective = await Objective.findOne({ objectiveId });
    if (!objective) {
      throw new Error('Objectif non trouvé');
    }

    const criterion = objective.criteria.find((c: any) => c.criterionId === criterionId);
    if (!criterion) {
      throw new Error('Critère non trouvé');
    }

    const contribution = {
      contributionId: generateShortId(),
      userId,
      userName,
      criterionId,
      amount,
      message,
      proofUrl,
      status: 'PENDING' as const,
      createdAt: new Date(),
    };

    criterion.contributions.push(contribution);
    await objective.save();

    return { objective, criterion, contribution };
  }

  static async approveContribution(objectiveId: string, contributionId: string, validatedBy: string): Promise<any> {
    const objective = await Objective.findOne({ objectiveId });
    if (!objective) {
      throw new Error('Objectif non trouvé');
    }

    let contributionFound = false;
    for (const criterion of objective.criteria) {
      const contribution = criterion.contributions.find((c: any) => c.contributionId === contributionId);
      if (contribution) {
        contribution.status = 'APPROVED';
        contribution.validatedBy = validatedBy;
        contribution.validatedAt = new Date();
        criterion.currentProgress += contribution.amount;
        contributionFound = true;
        break;
      }
    }

    if (!contributionFound) {
      throw new Error('Contribution non trouvée');
    }

    await objective.save();

    // Vérifier si l'objectif est complété
    const progress = this.calculateProgress(objective);
    if (progress >= 100 && objective.status === 'ACTIVE') {
      objective.status = 'COMPLETED';
      objective.completedAt = new Date();
      await objective.save();
    }

    return objective;
  }

  static async rejectContribution(objectiveId: string, contributionId: string, validatedBy: string): Promise<any> {
    const objective = await Objective.findOne({ objectiveId });
    if (!objective) {
      throw new Error('Objectif non trouvé');
    }

    let contributionFound = false;
    for (const criterion of objective.criteria) {
      const contribution = criterion.contributions.find((c: any) => c.contributionId === contributionId);
      if (contribution) {
        contribution.status = 'REJECTED';
        contribution.validatedBy = validatedBy;
        contribution.validatedAt = new Date();
        contributionFound = true;
        break;
      }
    }

    if (!contributionFound) {
      throw new Error('Contribution non trouvée');
    }

    await objective.save();
    return objective;
  }
}
