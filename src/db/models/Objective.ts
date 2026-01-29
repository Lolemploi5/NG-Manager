import mongoose, { Schema, Document } from 'mongoose';

export type ObjectiveStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
export type ObjectivePriority = 1 | 2 | 3 | 4 | 5;
export type CriterionType = 'BUILD' | 'ITEM' | 'LEVEL' | 'OTHER';
export type ContributionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface IContribution {
  contributionId: string;
  userId: string;
  userName: string;
  criterionId: string;
  amount: number;
  message?: string;
  proofUrl?: string;
  status: ContributionStatus;
  validatedBy?: string;
  validatedAt?: Date;
  createdAt: Date;
}

export interface ICriterion {
  criterionId: string;
  title: string;
  type: CriterionType;
  targetNumber?: number;
  currentProgress: number;
  unit?: string;
  notes?: string;
  contributions: IContribution[];
  createdAt: Date;
}

export interface IObjective extends Document {
  objectiveId: string;
  guildId: string;
  title: string;
  description?: string;
  priority: ObjectivePriority;
  category: string;
  status: ObjectiveStatus;
  deadline?: Date;
  criteria: ICriterion[];
  messageId?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const ContributionSchema = new Schema<IContribution>({
  contributionId: { type: String, required: true },
  userId: { type: String, required: true },
  userName: { type: String, required: true },
  criterionId: { type: String, required: true },
  amount: { type: Number, required: true, default: 1 },
  message: { type: String },
  proofUrl: { type: String },
  status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
  validatedBy: { type: String },
  validatedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

const CriterionSchema = new Schema<ICriterion>({
  criterionId: { type: String, required: true },
  title: { type: String, required: true },
  type: { type: String, enum: ['BUILD', 'ITEM', 'LEVEL', 'OTHER'], required: true },
  targetNumber: { type: Number },
  currentProgress: { type: Number, default: 0 },
  unit: { type: String },
  notes: { type: String },
  contributions: [ContributionSchema],
  createdAt: { type: Date, default: Date.now },
});

const ObjectiveSchema = new Schema<IObjective>(
  {
    objectiveId: { type: String, required: true, unique: true, index: true },
    guildId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    description: { type: String },
    priority: { type: Number, enum: [1, 2, 3, 4, 5], required: true },
    category: { type: String, required: true },
    status: { type: String, enum: ['ACTIVE', 'COMPLETED', 'CANCELLED'], default: 'ACTIVE' },
    deadline: { type: Date },
    criteria: [CriterionSchema],
    messageId: { type: String },
    createdBy: { type: String, required: true },
  },
  { timestamps: true }
);

export const Objective = mongoose.model<IObjective>('Objective', ObjectiveSchema);
