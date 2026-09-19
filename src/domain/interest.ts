export interface InterestTier {
  upTo: number | null;
  annualRate: number;
}

export function computeInterest(balance: number, tiers: InterestTier[]): number {
  if (tiers.length === 0 || balance <= 0) return 0;

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
    interest += portion * (tier.annualRate / 12);
    prev = cap;
    if (balance <= prev) break;
  }

  return Number(interest.toFixed(2));
}
