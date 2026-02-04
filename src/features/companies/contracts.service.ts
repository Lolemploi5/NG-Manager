import { GuildConfig } from '../../db/models/GuildConfig';
import { Company } from '../../db/models/Company';

export interface ContractTaxes {
  grossAmount: number;
  countryTax: number;
  companyTax: number;
  employeeShare: number;
  perEmployeeAmount: number;
}

export async function calculateContractTaxes(
  guildId: string,
  companyId: string,
  contractAmount: number,
  employeeCount: number
): Promise<ContractTaxes> {
  // Récupérer la configuration du serveur
  const guildConfig = await GuildConfig.findOne({ guildId });
  const company = await Company.findOne({ companyId });

  if (!company) {
    throw new Error('Entreprise non trouvée');
  }

  const grossAmount = contractAmount;
  
  // Calcul des taxes
  const countryTaxRate = guildConfig?.taxes?.countryTaxRate || 0.1; // 10% par défaut
  const countryTax = grossAmount * countryTaxRate;
  
  // Taxe entreprise sur le montant restant après taxe pays
  const remainingAfterCountryTax = grossAmount - countryTax;
  const companyTax = remainingAfterCountryTax * company.taxCompanyRate;
  
  // Montant à partager entre employés
  const employeeShare = remainingAfterCountryTax - companyTax;
  
  // Montant par employé
  const perEmployeeAmount = employeeShare / employeeCount;

  return {
    grossAmount,
    countryTax,
    companyTax,
    employeeShare,
    perEmployeeAmount,
  };
}