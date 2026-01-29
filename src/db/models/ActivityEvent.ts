import mongoose, { Schema, Document } from 'mongoose';

export type ActivityEventType = 'OBJECTIVE_CONTRIB_APPROVED' | 'SALE_APPROVED';

export interface IActivityEvent extends Document {
  eventId: string;
  guildId: string;
  userId: string;
  userName: string;
  type: ActivityEventType;
  points: number;
  referenceId: string;
  createdAt: Date;
}

const ActivityEventSchema = new Schema<IActivityEvent>(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    userName: { type: String, required: true },
    type: { type: String, enum: ['OBJECTIVE_CONTRIB_APPROVED', 'SALE_APPROVED'], required: true },
    points: { type: Number, required: true },
    referenceId: { type: String, required: true },
  },
  { timestamps: true }
);

export const ActivityEvent = mongoose.model<IActivityEvent>('ActivityEvent', ActivityEventSchema);
