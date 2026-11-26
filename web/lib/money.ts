/** Rupee amounts in the Sharks deal table are in lakh (1 crore = 100 lakh). Client-safe. */

const round2 = (n: number) => Math.round(n * 100) / 100;

export function money(lakh: number): string {
  return lakh >= 100 ? `₹${round2(lakh / 100)} crore` : `₹${round2(lakh)} lakh`;
}

/** What a deal says the whole company is worth. */
export function valuationLakh(investmentLakh: number, equityPct: number): number | null {
  return investmentLakh > 0 && equityPct > 0 ? (investmentLakh * 100) / equityPct : null;
}

export const ASK_LIMITS = { amountMin: 1, amountMax: 100_000, equityMin: 0.1, equityMax: 100 };
