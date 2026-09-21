export interface InterestTier {
  upTo: number | null;
  annualRate: number;
}

/** Frecuencias soportadas para reglas de interés. */
export type InterestFrequency = 'daily' | 'monthly';

const periodsPerYear = (frequency: InterestFrequency): number =>
  frequency === 'daily' ? 365 : 12;

export function computeInterest(
  balance: number,
  tiers: InterestTier[],
  frequency: InterestFrequency = 'monthly',
): number {
  if (tiers.length === 0 || balance <= 0) return 0;

  const periods = periodsPerYear(frequency);

  const sorted = [...tiers].sort((a, b) => {
    if (a.upTo === null) return 1;
    if (b.upTo === null) return -1;
    return a.upTo - b.upTo;
  });

  let interest = 0;
  let prev = 0;
  for (const tier of sorted) {
    const cap = tier.upTo ?? Infinity;
    const portion = Math.max(0, Math.min(balance, cap) - prev);
    interest += portion * (tier.annualRate / periods);
    prev = cap;
    if (balance <= prev) break;
  }

  return Number(interest.toFixed(2));
}
