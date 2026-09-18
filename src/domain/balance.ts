export type AccountType = 'CASH' | 'DEBIT' | 'CREDIT' | 'INVESTMENT';
export type TxType = 'INCOME' | 'EXPENSE' | 'TRANSFER';
export type Role = 'SOURCE' | 'DESTINATION';

export function balanceDelta(input: {
  type: TxType; accountType: AccountType; role: Role; amount: number;
}): number {
  const { type, accountType, role, amount } = input;
  const credit = accountType === 'CREDIT';
  if (type === 'INCOME') return credit ? -amount : amount;
  if (type === 'EXPENSE') return credit ? amount : -amount;
  // TRANSFER
  if (role === 'SOURCE') return credit ? amount : -amount;
  return credit ? -amount : amount;
}

export function computeOpeningBalance(storedBalance: number, netEffect: number): number {
  return storedBalance - netEffect;
}
