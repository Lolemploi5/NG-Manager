import { ObjectiveCategory } from '../../db/models/Objective';

/**
 * Erreur de validation avec message utilisateur
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public field: string,
    public userMessage: string
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Erreur métier avec suggestion d'action
 */
export class UserFacingError extends Error {
  constructor(
    message: string,
    public userMessage: string,
    public suggestedAction?: string
  ) {
    super(message);
    this.name = 'UserFacingError';
  }
}

/**
 * Validateurs centralisés pour les inputs
 */
export const Validators = {
  /**
   * Valide une priorité (1-5)
   */
  priority(value: number): 1 | 2 | 3 | 4 | 5 {
    if (value < 1 || value > 5 || !Number.isInteger(value)) {
      throw new ValidationError(
        'Invalid priority',
        'priority',
        '❌ La priorité doit être un nombre entier entre 1 (Critique) et 5 (Très faible)'
      );
    }
    return value as 1 | 2 | 3 | 4 | 5;
  },

  /**
   * Valide et normalise une catégorie d'objectif
   */
  category(value: string): ObjectiveCategory {
    const validCategories: ObjectiveCategory[] = [
      'Économie',
      'Build',
      'Farm',
      'R&D',
      'Militaire/Diplomatie',
    ];

    // Mapping pour normalisation (accepte les variations)
    const categoryMap: Record<string, ObjectiveCategory> = {
      'economie': 'Économie',
      'économie': 'Économie',
      'build': 'Build',
      'farm': 'Farm',
      'r&d': 'R&D',
      'rd': 'R&D',
      'militaire': 'Militaire/Diplomatie',
      'diplomatie': 'Militaire/Diplomatie',
      'militaire/diplomatie': 'Militaire/Diplomatie',
    };

    const normalized = categoryMap[value.toLowerCase()] || value;

    if (!validCategories.includes(normalized as ObjectiveCategory)) {
      throw new ValidationError(
        'Invalid category',
        'category',
        `❌ Catégorie invalide. Choix possibles :\n${validCategories.map(c => `• ${c}`).join('\n')}`
      );
    }

    return normalized as ObjectiveCategory;
  },

  /**
   * Valide un format de date YYYY-MM-DD et vérifie qu'elle est dans le futur
   */
  date(value: string): Date {
    // Vérifier le format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(value)) {
      throw new ValidationError(
        'Invalid date format',
        'deadline',
        '❌ Format de date invalide. Utilisez YYYY-MM-DD (exemple : 2026-12-31)'
      );
    }

    const date = new Date(value);
    if (isNaN(date.getTime())) {
      throw new ValidationError(
        'Invalid date',
        'deadline',
        '❌ Date invalide. Vérifiez le mois et le jour.'
      );
    }

    // Vérifier que la date est dans le futur
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Réinitialiser l'heure pour comparer seulement les dates

    if (date < now) {
      throw new ValidationError(
        'Date in past',
        'deadline',
        '❌ La date limite doit être dans le futur.'
      );
    }

    return date;
  },

  /**
   * Valide un taux de taxe (0-1)
   */
  taxRate(value: number): number {
    if (value < 0 || value > 1) {
      throw new ValidationError(
        'Invalid tax rate',
        'taxRate',
        '❌ Le taux doit être entre 0 et 1 (exemple : 0.20 pour 20%)'
      );
    }
    return value;
  },

  /**
   * Valide un montant monétaire (doit être positif)
   */
  monetaryAmount(value: number, fieldName: string = 'montant'): number {
    if (value < 0) {
      throw new ValidationError(
        'Invalid monetary amount',
        fieldName,
        `❌ Le ${fieldName} ne peut pas être négatif.`
      );
    }
    if (!isFinite(value)) {
      throw new ValidationError(
        'Invalid monetary amount',
        fieldName,
        `❌ Le ${fieldName} doit être un nombre valide.`
      );
    }
    return value;
  },

  /**
   * Valide une chaîne de caractères non vide
   */
  nonEmptyString(value: string, fieldName: string, maxLength?: number): string {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new ValidationError(
        'Empty string',
        fieldName,
        `❌ Le champ "${fieldName}" ne peut pas être vide.`
      );
    }

    if (maxLength && trimmed.length > maxLength) {
      throw new ValidationError(
        'String too long',
        fieldName,
        `❌ Le champ "${fieldName}" ne peut pas dépasser ${maxLength} caractères.`
      );
    }

    return trimmed;
  },

  /**
   * Valide une URL (optionnelle)
   */
  url(value: string | undefined, fieldName: string = 'URL'): string | undefined {
    if (!value || value.trim() === '') {
      return undefined;
    }

    try {
      new URL(value);
      return value;
    } catch {
      throw new ValidationError(
        'Invalid URL',
        fieldName,
        `❌ Le ${fieldName} fourni n'est pas une URL valide. Exemple : https://example.com`
      );
    }
  },
};

/**
 * Erreurs métier préconfigurées
 */
export const Errors = {
  guildNotConfigured: () =>
    new UserFacingError(
      'Guild config not found',
      '❌ Ce serveur n\'est pas encore configuré.',
      '💡 Utilisez `/setup init` pour initialiser le bot.'
    ),

  insufficientPermissions: (required: string) =>
    new UserFacingError(
      'Insufficient permissions',
      `❌ Vous n'avez pas les permissions nécessaires (requis : ${required}).`,
      '💡 Contactez un Chef ou Officier pour obtenir les permissions.'
    ),

  objectiveNotFound: (objectiveId: string) =>
    new UserFacingError(
      `Objective ${objectiveId} not found`,
      `❌ Objectif \`${objectiveId}\` introuvable.`,
      '💡 Vérifiez l\'ID avec `/objectif liste`.'
    ),

  companyNotFound: (companyId: string) =>
    new UserFacingError(
      `Company ${companyId} not found`,
      `❌ Entreprise \`${companyId}\` introuvable.`,
      '💡 Vérifiez l\'ID avec `/entreprise liste`.'
    ),

  postNotFound: (postId: string) =>
    new UserFacingError(
      `Ministry post ${postId} not found`,
      `❌ Poste \`${postId}\` introuvable.`,
      '💡 Vérifiez l\'ID avec `/poste liste`.'
    ),

  databaseError: (operation: string) =>
    new UserFacingError(
      `Database error during ${operation}`,
      '❌ Erreur de connexion à la base de données.',
      '🔄 Veuillez réessayer dans quelques instants. Si le problème persiste, contactez un administrateur.'
    ),

  alreadyExists: (resourceType: string, identifier: string) =>
    new UserFacingError(
      `${resourceType} ${identifier} already exists`,
      `❌ Ce ${resourceType} existe déjà : ${identifier}`,
      '💡 Choisissez un nom différent ou vérifiez la liste existante.'
    ),

  notInGuild: () =>
    new UserFacingError(
      'Command used outside guild',
      '❌ Cette commande ne peut être utilisée que dans un serveur Discord.',
      '💡 Utilisez cette commande dans un canal de serveur, pas en message privé.'
    ),
};
