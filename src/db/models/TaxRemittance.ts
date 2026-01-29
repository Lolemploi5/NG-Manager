import mongoose, { Schema, Document } from 'mongoose';

export interface ITaxRemittance extends Document {
  remittanceId: string;
  guildId: string;
  companyId: string;
  totalAmount: number;
  saleIds: string[];
  paidBy: string;
  paidByName: string;
  paidAt: Date;
  createdAt: Date;
}

const TaxRemittanceSchema = new Schema<ITaxRemittance>(
  {
    remittanceId: { type: String, required: true, unique: true, index: true },
    guildId: { type: String, required: true, index: true },
    companyId: { type: String, required: true, index: true },
    totalAmount: { type: Number, required: true },
    saleIds: [{ type: String }],
    paidBy: { type: String, required: true },
    paidByName: { type: String, required: true },
    paidAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const TaxRemittance = mongoose.model<ITaxRemittance>(
  'TaxRemittance',
  TaxRemittanceSchema
);
