/**
 * Registry centralisé pour les customIds d'interactions Discord
 * Évite les strings magiques et facilite le parsing
 */

export const CustomIds = {
  objectives: {
    // Objectifs
    addCriterion: (objectiveId: string) => `obj_add_crit_${objectiveId}`,
    viewContributions: (objectiveId: string) => `obj_view_contrib_${objectiveId}`,
    select: () => 'objective_select',

    // Critères
    contribute: (objectiveId: string, criterionId: string) =>
      `obj_contrib_${objectiveId}_${criterionId}`,

    // Contributions
    approveContribution: (contributionId: string) => `contrib_approve_${contributionId}`,
    rejectContribution: (contributionId: string) => `contrib_reject_${contributionId}`,

    // Modals
    createModal: () => 'objective_create_modal',
    criterionModal: (objectiveId: string) => `criterion_modal_${objectiveId}`,
    contributionModal: (objectiveId: string, criterionId: string) =>
      `contribution_modal_${objectiveId}_${criterionId}`,

    // Pagination
    listPage: (page: number) => `obj_list_page_${page}`,
    listFirst: () => 'obj_list_first',
    listPrev: () => 'obj_list_prev',
    listNext: () => 'obj_list_next',
    listLast: () => 'obj_list_last',
  },

  sales: {
    // Ventes
    approve: (saleId: string) => `sale_approve_${saleId}`,
    reject: (saleId: string) => `sale_reject_${saleId}`,
    view: (saleId: string) => `sale_view_${saleId}`,

    // Select menus
    select: (companyId: string) => `sale_select_${companyId}`,

    // Modals
    createModal: (companyId: string) => `sale_modal_${companyId}`,
  },

  contracts: {
    // Contrats
    approve: (contractId: string) => `contract_approve_${contractId}`,
    reject: (contractId: string) => `contract_reject_${contractId}`,
    view: (contractId: string) => `contract_view_${contractId}`,

    // Modals
    createModal: (companyId: string) => `contract_modal_${companyId}`,
  },

  companies: {
    // Entreprises
    view: (companyId: string) => `company_view_${companyId}`,
    edit: (companyId: string) => `company_edit_${companyId}`,

    // Modals
    createModal: () => 'create_company_modal',
  },

  taxes: {
    // Taxes
    configureRates: () => 'tax_configure',
    payTaxes: (companyId: string) => `tax_pay_${companyId}`,
    viewRemittance: (companyId: string) => `tax_view_remit_${companyId}`,

    // Modals
    rateModal: () => 'tax_rate_modal',
    payModal: () => 'pay_taxes_modal',
  },

  ministry: {
    // Postes
    viewPost: (postId: string) => `post_view_${postId}`,
    assignMember: (postId: string) => `post_assign_${postId}`,
    removeMember: (postId: string) => `post_remove_${postId}`,

    // Modals
    createPostModal: () => 'ministry_create_post_modal',
    assignModal: (postId: string) => `ministry_assign_modal_${postId}`,
  },
} as const;

/**
 * Interface pour le résultat du parsing
 */
export interface ParsedCustomId {
  category: 'objective' | 'sale' | 'contract' | 'company' | 'tax' | 'ministry' | 'contrib' | 'criterion' | 'post' | 'obj';
  action: string;
  params: string[];
  raw: string;
}

/**
 * Parse un customId pour extraire ses composants
 * @param customId Le customId à parser
 * @returns Les composants parsés
 */
export function parseCustomId(customId: string): ParsedCustomId {
  const parts = customId.split('_');

  if (parts.length < 2) {
    return {
      category: parts[0] as any,
      action: '',
      params: [],
      raw: customId,
    };
  }

  return {
    category: parts[0] as any,
    action: parts[1],
    params: parts.slice(2),
    raw: customId,
  };
}

/**
 * Vérifie si un customId correspond à un pattern
 * @param customId Le customId à vérifier
 * @param prefix Le préfixe attendu
 * @returns true si le customId commence par le préfixe
 */
export function matchesPrefix(customId: string, prefix: string): boolean {
  return customId.startsWith(prefix);
}

/**
 * Extrait des paramètres spécifiques d'un customId
 */
export const Extractors = {
  /**
   * Extrait l'objectiveId d'un customId d'objectif
   */
  objectiveId(customId: string): string | null {
    const parsed = parseCustomId(customId);
    if (parsed.category === 'obj' || parsed.category === 'objective') {
      return parsed.params[0] || null;
    }
    return null;
  },

  /**
   * Extrait objectiveId et criterionId d'un customId de contribution
   */
  objectiveAndCriterion(customId: string): { objectiveId: string; criterionId: string } | null {
    const parsed = parseCustomId(customId);
    if (parsed.action === 'contrib' && parsed.params.length >= 2) {
      return {
        objectiveId: parsed.params[0],
        criterionId: parsed.params[1],
      };
    }
    return null;
  },

  /**
   * Extrait le saleId d'un customId de vente
   */
  saleId(customId: string): string | null {
    const parsed = parseCustomId(customId);
    if (parsed.category === 'sale') {
      return parsed.params[0] || null;
    }
    return null;
  },

  /**
   * Extrait le contractId d'un customId de contrat
   */
  contractId(customId: string): string | null {
    const parsed = parseCustomId(customId);
    if (parsed.category === 'contract') {
      return parsed.params[0] || null;
    }
    return null;
  },

  /**
   * Extrait le companyId d'un customId d'entreprise
   */
  companyId(customId: string): string | null {
    const parsed = parseCustomId(customId);
    if (parsed.category === 'company' || parsed.category === 'tax') {
      return parsed.params[0] || null;
    }
    return null;
  },

  /**
   * Extrait le postId d'un customId de poste ministériel
   */
  postId(customId: string): string | null {
    const parsed = parseCustomId(customId);
    if (parsed.category === 'post' || parsed.category === 'ministry') {
      return parsed.params[0] || parsed.params[1] || null;
    }
    return null;
  },

  /**
   * Extrait le contributionId d'un customId de contribution
   */
  contributionId(customId: string): string | null {
    const parsed = parseCustomId(customId);
    if (parsed.category === 'contrib') {
      return parsed.params[0] || null;
    }
    return null;
  },
};
