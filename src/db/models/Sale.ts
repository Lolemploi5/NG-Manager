import mongoose, { Schema, Document } from 'mongoose';

export type SaleStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ISale extends Document {
  saleId: string;
  guildId: string;
  companyId: string;
  submittedBy: string;
  submittedByName: string;
  plant: string;
  recipe: string;
  grossAmount: number;
  serverTaxAmount: number;
  companyTaxAmount: number;
  countryTaxAmount: number;
  netAmount: number;
  status: SaleStatus;
  countryTaxPaid: boolean;
  validatedBy?: string;
  validatedAt?: Date;
  rejectionReason?: string;
  messageId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SaleSchema = new Schema<ISale>(
  {
    saleId: { type: String, required: true, unique: true, index: true },
    guildId: { type: String, required: true, index: true },
    companyId: { type: String, required: true, index: true },
    submittedBy: { type: String, required: true },
    submittedByName: { type: String, required: true },
    plant: { type: String, required: true },
    recipe: { type: String, required: true },
    grossAmount: { type: Number, required: true },
    serverTaxAmount: { type: Number, required: true },
    companyTaxAmount: { type: Number, required: true },
    countryTaxAmount: { type: Number, required: true },
    netAmount: { type: Number, required: true },
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
    countryTaxPaid: { type: Boolean, default: false },
    validatedBy: { type: String },
    validatedAt: { type: Date },
    rejectionReason: { type: String },
    messageId: { type: String },
  },
  { timestamps: true }
);

export const Sale = mongoose.model<ISale>('Sale', SaleSchema);
