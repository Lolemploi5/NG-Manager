/**
 * Formate un montant en euros avec 2 décimales
 */
export function formatMoney(amount: number): string {
  return `${amount.toFixed(2)} €`;
}

/**
 * Arrondit un montant à 2 décimales
 */
export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}
