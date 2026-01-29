import dotenv from 'dotenv';

dotenv.config();

interface EnvConfig {
  DISCORD_TOKEN: string;
  DISCORD_CLIENT_ID: string;
  MONGODB_URI: string;
  NODE_ENV: 'development' | 'production';
  DEV_GUILD_ID?: string;
  PORT: number;
  DEFAULT_TAX_SERVER: number;
  DEFAULT_TAX_COUNTRY: number;
  DEFAULT_TAX_COMPANY: number;
}

function validateEnv(): EnvConfig {
  const errors: string[] = [];

  if (!process.env.DISCORD_TOKEN) {
    errors.push('❌ DISCORD_TOKEN est requis');
  }

  if (!process.env.DISCORD_CLIENT_ID) {
    errors.push('❌ DISCORD_CLIENT_ID est requis');
  }

  if (!process.env.MONGODB_URI) {
    errors.push('❌ MONGODB_URI est requis');
  }

  const nodeEnv = process.env.NODE_ENV || 'development';
  if (!['development', 'production'].includes(nodeEnv)) {
    errors.push('❌ NODE_ENV doit être "development" ou "production"');
  }

  if (errors.length > 0) {
    console.error('\n🚨 Erreurs de configuration:\n');
    errors.forEach((error) => console.error(error));
    console.error('\n📝 Vérifiez votre fichier .env\n');
    process.exit(1);
  }

  return {
    DISCORD_TOKEN: process.env.DISCORD_TOKEN!,
    DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID!,
    MONGODB_URI: process.env.MONGODB_URI!,
    NODE_ENV: nodeEnv as 'development' | 'production',
    DEV_GUILD_ID: process.env.DEV_GUILD_ID,
    PORT: parseInt(process.env.PORT || '3000', 10),
    DEFAULT_TAX_SERVER: parseFloat(process.env.DEFAULT_TAX_SERVER || '0.00'),
    DEFAULT_TAX_COUNTRY: parseFloat(process.env.DEFAULT_TAX_COUNTRY || '0.05'),
    DEFAULT_TAX_COMPANY: parseFloat(process.env.DEFAULT_TAX_COMPANY || '0.15'),
  };
}

export const env = validateEnv();
