import mongoose from 'mongoose';
import { logger } from '../utils/logger';

export async function connectDB(uri: string): Promise<void> {
  try {
    logger.info('🔌 Connexion à MongoDB...');
    
    await mongoose.connect(uri);
    
    logger.info('✅ MongoDB connecté avec succès');
    
    mongoose.connection.on('error', (error) => {
      logger.error('❌ Erreur MongoDB:', error);
    });
    
    mongoose.connection.on('disconnected', () => {
      logger.warn('⚠️  MongoDB déconnecté');
    });
    
  } catch (error) {
    logger.error('❌ Échec de connexion à MongoDB:', error);
    process.exit(1);
  }
}
