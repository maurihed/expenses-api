export type DebtStatus = 'OPEN' | 'SETTLED';

export interface DebtBalance {
  paid: number;
  remaining: number;
  status: DebtStatus;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

export function debtBalance(amount: number, payments: number[]): DebtBalance {
  const paid = round2(payments.reduce((sum, value) => sum + value, 0));
  const remaining = Math.max(0, round2(amount - paid));
  return { paid, remaining, status: remaining <= 0 ? 'SETTLED' : 'OPEN' };
}
