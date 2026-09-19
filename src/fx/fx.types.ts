export interface FxRateResult {
  base: string;
  quote: string;
  rate: number;
  fetchedAt: string;
  stale: boolean;
}

export interface FetchedRate {
  rate: number;
  source: string;
}

export const FX_PROVIDERS = ['open.er-api.com', 'fawazahmed0/currency-api'] as const;

const isPositiveNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

export function parseOpenErApi(payload: unknown, quote: string): number | null {
  const rates = (payload as { rates?: Record<string, unknown> } | null)?.rates;
  const value = rates?.[quote.toUpperCase()];
  return isPositiveNumber(value) ? value : null;
}

export function parseFawaz(payload: unknown, base: string, quote: string): number | null {
  const table = (payload as Record<string, unknown> | null)?.[base.toLowerCase()];
  const value = (table as Record<string, unknown> | undefined)?.[quote.toLowerCase()];
  return isPositiveNumber(value) ? value : null;
}
