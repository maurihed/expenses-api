export function splitInstallments(total: number, count: number): number[] {
  if (!Number.isInteger(count) || count < 1) return [];

  const totalCents = Math.round(total * 100);
  const baseCents = Math.round(totalCents / count);
  const amounts: number[] = [];
  for (let i = 0; i < count - 1; i += 1) {
    amounts.push(baseCents / 100);
  }
  amounts.push((totalCents - baseCents * (count - 1)) / 100);
  return amounts;
}
