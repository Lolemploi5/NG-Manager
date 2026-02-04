import mongoose, { Schema, Document } from 'mongoose';

export type CompanyType = 'Agricole' | 'Build';

export interface ICompany extends Document {
  companyId: string;
  guildId: string;
  name: string;
  type: CompanyType;
  emoji?: string;
  categoryId: string;
  channels: {
    salesChannelId: string;
    confirmationsChannelId: string;
  };
  roles: {
    ceoRoleId: string;
    managerRoleId: string;
    employeeRoleId: string;
  };
  taxCompanyRate: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const CompanySchema = new Schema<ICompany>(
  {
    companyId: { type: String, required: true, unique: true, index: true },
    guildId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    type: { type: String, enum: ['Agricole', 'Build'], required: true },
    emoji: { type: String },
    categoryId: { type: String, required: true },
    channels: {
      salesChannelId: { type: String, required: true },
      confirmationsChannelId: { type: String, required: true },
    },
    roles: {
      ceoRoleId: { type: String, required: true },
      managerRoleId: { type: String, required: true },
      employeeRoleId: { type: String, required: true },
    },
    taxCompanyRate: { type: Number, required: true },
    createdBy: { type: String, required: true },
  },
  { timestamps: true }
);

export const Company = mongoose.model<ICompany>('Company', CompanySchema);
