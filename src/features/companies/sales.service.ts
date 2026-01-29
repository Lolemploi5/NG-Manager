import { Sale } from '../../db/models/Sale';
import { Company } from '../../db/models/Company';
import { GuildConfig } from '../../db/models/GuildConfig';
import { generateShortId } from '../../utils/uuid';
import { roundMoney } from '../../utils/format/money';

export function calculateSaleTaxes(
  grossAmount: number,
  serverTaxRate: number,
  companyTaxRate: number,
  countryTaxRate: number
): {
  serverTax: number;
  companyTax: number;
  countryTax: number;
  netAmount: number;
} {
  // Calcul selon le prompt: "les autres taxes sont appliquées après la taxe serveur"
  const serverTax = roundMoney(grossAmount * serverTaxRate);
  const baseAfterServer = grossAmount - serverTax;
  const companyTax = roundMoney(baseAfterServer * companyTaxRate);
  const countryTax = roundMoney(baseAfterServer * countryTaxRate);
  const netAmount = roundMoney(
    grossAmount - (serverTax + companyTax + countryTax)
  );

  return {
    serverTax,
    companyTax,
    countryTax,
    netAmount,
  };
}

export class SalesService {
  static async calculateTaxes(
    guildId: string,
    companyId: string,
    grossAmount: number
  ): Promise<{
    serverTaxAmount: number;
    companyTaxAmount: number;
    countryTaxAmount: number;
    netAmount: number;
  }> {
    const config = await GuildConfig.findOne({ guildId });
    const company = await Company.findOne({ companyId });

    if (!config || !company) {
      throw new Error('Configuration ou entreprise non trouvée');
    }

    const taxes = calculateSaleTaxes(
      grossAmount,
      config.taxes.serverTaxRate,
      company.taxCompanyRate,
      config.taxes.countryTaxRate
    );

    return {
      serverTaxAmount: taxes.serverTax,
      companyTaxAmount: taxes.companyTax,
      countryTaxAmount: taxes.countryTax,
      netAmount: taxes.netAmount,
    };
  }

  static async createSale(data: any): Promise<any> {
    const taxes = await this.calculateTaxes(data.guildId, data.companyId, data.grossAmount);

    const sale = await Sale.create({
      saleId: generateShortId(),
      ...data,
      ...taxes,
      status: 'PENDING',
      countryTaxPaid: false,
    });

    return sale;
  }

  static async getSales(guildId: string, filters?: any): Promise<any[]> {
    const query: any = { guildId };
    if (filters?.companyId) {
      query.companyId = filters.companyId;
    }
    if (filters?.status) {
      query.status = filters.status;
    }
    return Sale.find(query).sort({ createdAt: -1 });
  }

  static async approveSale(saleId: string, validatorId: string): Promise<any> {
    const sale = await Sale.findOne({ saleId });
    if (!sale) {
      throw new Error('Vente non trouvée');
    }

    sale.status = 'APPROVED';
    sale.validatedBy = validatorId;
    sale.validatedAt = new Date();

    await sale.save();
    return sale;
  }
}
