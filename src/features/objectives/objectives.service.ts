import { Objective } from '../../db/models/Objective';
import { generateShortId } from '../../utils/uuid';

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
    const query: any = { guildId };
    if (filters?.status) {
      query.status = filters.status;
    }
    return Objective.find(query).sort({ priority: 1, createdAt: -1 });
  }

  static async getObjectiveById(objectiveId: string): Promise<any> {
    return Objective.findOne({ objectiveId });
  }
}
