import mongoose, { Schema, Document } from 'mongoose';

export interface IGuildConfig extends Document {
  guildId: string;
  countryName: string;
  roles: {
    chefRoleId: string;
    officerRoleId: string;
    memberRoleId: string;
    recruitRoleId: string;
  };
  channels: {
    objectivesChannelId: string;
    objectivesValidationChannelId: string;
    taxesChannelId?: string;
    logsChannelId?: string;
  };
  taxes: {
    serverTaxRate: number;
    countryTaxRate: number;
    defaultCompanyTaxRate: number;
  };
  reminders: {
    taxes: {
      enabled: boolean;
      mode: 'DAYS' | 'WEEKS' | 'MONTHS';
      every: number;
    };
  };
  leaderboard: {
    enabled: boolean;
    channelId?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const GuildConfigSchema = new Schema<IGuildConfig>(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    countryName: { type: String, required: true },
    roles: {
      chefRoleId: { type: String, required: true },
      officerRoleId: { type: String, required: true },
      memberRoleId: { type: String, required: true },
      recruitRoleId: { type: String, required: true },
    },
    channels: {
      objectivesChannelId: { type: String, required: true },
      objectivesValidationChannelId: { type: String, required: true },
      taxesChannelId: { type: String },
      logsChannelId: { type: String },
    },
    taxes: {
      serverTaxRate: { type: Number, required: true, default: 0.0 },
      countryTaxRate: { type: Number, required: true, default: 0.05 },
      defaultCompanyTaxRate: { type: Number, required: true, default: 0.15 },
    },
    reminders: {
      taxes: {
        enabled: { type: Boolean, default: false },
        mode: { type: String, enum: ['DAYS', 'WEEKS', 'MONTHS'], default: 'WEEKS' },
        every: { type: Number, default: 1 },
      },
    },
    leaderboard: {
      enabled: { type: Boolean, default: false },
      channelId: { type: String },
    },
  },
  { timestamps: true }
);

export const GuildConfig = mongoose.model<IGuildConfig>('GuildConfig', GuildConfigSchema);
