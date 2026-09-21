export type Currency = 'MXN' | 'USD';

export interface PositionInput {
  quantity: number;
  price: number | null;
  previousClose: number | null;
  priceCurrency: string;
  accountCurrency: Currency;
  usdRate: number | null;
}

export interface PositionValue {
  marketValue: number | null;
  marketValueAccountCurrency: number | null;
  changePercent: number | null;
}

export const convertToAccountCurrency = (
  amount: number,
  from: string,
  accountCurrency: Currency,
  usdRate: number | null,
): number | null => {
  if (from === accountCurrency) return amount;
  if (from === 'USD' && accountCurrency === 'MXN') {
    return usdRate == null ? null : amount * usdRate;
  }
  if (from === 'MXN' && accountCurrency === 'USD') {
    return usdRate == null ? null : amount / usdRate;
  }
  return null;
};

export const valuePosition = (input: PositionInput): PositionValue => {
  const { quantity, price, previousClose, priceCurrency, accountCurrency, usdRate } = input;
  const marketValue = price == null ? null : quantity * price;
  const marketValueAccountCurrency =
    marketValue == null
      ? null
      : convertToAccountCurrency(marketValue, priceCurrency, accountCurrency, usdRate);
  const changePercent =
    price != null && previousClose != null && previousClose > 0
      ? ((price - previousClose) / previousClose) * 100
      : null;
  return { marketValue, marketValueAccountCurrency, changePercent };
};

export const sumPositionValues = (values: (number | null)[]): number | null => {
  if (values.some((value) => value == null)) return null;
  return values.reduce<number>((sum, value) => sum + (value as number), 0);
};

export const previousPositionsValue = (
  positions: { quantity: number; previousClose: number | null; priceCurrency: string }[],
  accountCurrency: Currency,
  usdRate: number | null,
): number | null => {
  let sum = 0;
  for (const position of positions) {
    if (position.previousClose == null) return null;
    const converted = convertToAccountCurrency(
      position.quantity * position.previousClose,
      position.priceCurrency,
      accountCurrency,
      usdRate,
    );
    if (converted == null) return null;
    sum += converted;
  }
  return sum;
};

export const dayChangePercent = (
  current: number | null,
  previous: number | null,
): number | null => {
  if (current == null || previous == null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
};
