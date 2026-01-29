import mongoose, { Schema, Document } from 'mongoose';

export interface IMinistryPostHolder {
  userId: string;
  userName: string;
  assignedAt: Date;
  assignedBy: string;
}

export interface IMinistryPost extends Document {
  postId: string;
  guildId: string;
  name: string;
  emoji?: string;
  holders: IMinistryPostHolder[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const MinistryPostHolderSchema = new Schema<IMinistryPostHolder>({
  userId: { type: String, required: true },
  userName: { type: String, required: true },
  assignedAt: { type: Date, default: Date.now },
  assignedBy: { type: String, required: true },
});

const MinistryPostSchema = new Schema<IMinistryPost>(
  {
    postId: { type: String, required: true, unique: true, index: true },
    guildId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    emoji: { type: String },
    holders: [MinistryPostHolderSchema],
    createdBy: { type: String, required: true },
  },
  { timestamps: true }
);

export const MinistryPost = mongoose.model<IMinistryPost>('MinistryPost', MinistryPostSchema);
