export interface ParsedQuote {
  price: number;
  previousClose: number | null;
  currency: string;
  name: string | null;
  exchange: string | null;
  source: string;
}

export interface MarketSearchResult {
  symbol: string;
  name: string;
  exchange: string | null;
  currency: string | null;
}

const isPositiveNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const parseNumber = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const cleaned = Number(value.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(cleaned) ? cleaned : null;
};

const pickString = (...values: unknown[]): string | null => {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
};

export function parseYahooChart(payload: unknown, _symbol: string): ParsedQuote | null {
  const meta = (payload as { chart?: { result?: { meta?: unknown }[] } } | null)?.chart?.result?.[0]
    ?.meta as Record<string, unknown> | undefined;
  if (!meta) return null;
  const price = meta.regularMarketPrice;
  if (!isPositiveNumber(price)) return null;
  const previous = meta.chartPreviousClose;
  return {
    price,
    previousClose: isPositiveNumber(previous) ? previous : null,
    currency: pickString(meta.currency) ?? 'USD',
    name: pickString(meta.longName, meta.shortName),
    exchange: pickString(meta.fullExchangeName, meta.exchangeName),
    source: 'yahoo',
  };
}

export function parseYahooSearch(payload: unknown): MarketSearchResult[] {
  const quotes = (payload as { quotes?: unknown[] } | null)?.quotes;
  if (!Array.isArray(quotes)) return [];
  return quotes
    .filter(
      (q): q is Record<string, unknown> =>
        typeof q === 'object' && q !== null && (q as Record<string, unknown>).quoteType === 'ETF',
    )
    .map((q) => {
      const symbol = pickString(q.symbol);
      return symbol == null
        ? null
        : {
            symbol,
            name: pickString(q.longname, q.shortname) ?? symbol,
            exchange: pickString(q.exchDisp),
            currency: null,
          };
    })
    .filter((item): item is MarketSearchResult => item !== null);
}

export function parseNasdaqInfo(payload: unknown, _symbol: string): ParsedQuote | null {
  const data = (payload as { data?: Record<string, unknown> } | null)?.data;
  if (!data) return null;
  const primary = data.primaryData as Record<string, unknown> | undefined;
  const price = parseNumber(primary?.lastSalePrice);
  if (!isPositiveNumber(price)) return null;
  const netChange = parseNumber(primary?.netChange);
  const previousClose =
    netChange == null ? null : Number((price - netChange).toFixed(4)) || null;
  return {
    price,
    previousClose: previousClose != null && previousClose > 0 ? previousClose : null,
    currency: 'USD',
    name: pickString(data.companyName),
    exchange: pickString(data.exchange),
    source: 'nasdaq',
  };
}

export function parseNasdaqSearch(payload: unknown): MarketSearchResult[] {
  const rows = (payload as { data?: unknown[] } | null)?.data;
  if (!Array.isArray(rows)) return [];
  return rows
    .filter(
      (r): r is Record<string, unknown> =>
        typeof r === 'object' && r !== null && (r as Record<string, unknown>).asset === 'ETF',
    )
    .map((r) => {
      const symbol = pickString(r.symbol);
      return symbol == null
        ? null
        : {
            symbol,
            name: pickString(r.name) ?? symbol,
            exchange: pickString(r.exchange),
            currency: null,
          };
    })
    .filter((item): item is MarketSearchResult => item !== null);
}
