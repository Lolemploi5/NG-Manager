import mongoose, { Schema, Document } from 'mongoose';

export type ContractStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface IContract extends Document {
  contractId: string;
  companyId: string;
  guildId: string;
  submittedBy: string;
  clientCountry?: string;
  clientPlayer?: string;
  contractAmount: number;
  employeeCount: number;
  description?: string;
  status: ContractStatus;
  grossAmount: number;
  countryTax: number;
  companyTax: number;
  employeeShare: number;
  perEmployeeAmount: number;
  countryTaxPaid: boolean;
  approvedBy?: string;
  approvedAt?: Date;
  rejectedBy?: string;
  rejectedAt?: Date;
  rejectionReason?: string;
  salesMessageId?: string;
  confirmationMessageId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ContractSchema = new Schema<IContract>(
  {
    contractId: { type: String, required: true, unique: true, index: true },
    companyId: { type: String, required: true, index: true },
    guildId: { type: String, required: true, index: true },
    submittedBy: { type: String, required: true },
    clientCountry: { type: String },
    clientPlayer: { type: String },
    contractAmount: { type: Number, required: true },
    employeeCount: { type: Number, required: true, min: 1 },
    description: { type: String },
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
    grossAmount: { type: Number, required: true },
    countryTax: { type: Number, required: true },
    companyTax: { type: Number, required: true },
    employeeShare: { type: Number, required: true },
    perEmployeeAmount: { type: Number, required: true },
    countryTaxPaid: { type: Boolean, default: false },
    approvedBy: { type: String },
    approvedAt: { type: Date },
    rejectedBy: { type: String },
    rejectedAt: { type: Date },
    rejectionReason: { type: String },
    salesMessageId: { type: String },
    confirmationMessageId: { type: String },
  },
  { timestamps: true }
);

export const Contract = mongoose.model<IContract>('Contract', ContractSchema);