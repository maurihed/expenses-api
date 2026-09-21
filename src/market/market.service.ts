import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  MarketSearchResult,
  ParsedQuote,
  parseNasdaqInfo,
  parseNasdaqSearch,
  parseYahooChart,
  parseYahooSearch,
} from './market.types';

const DEFAULT_CACHE_MS = 30 * 60 * 1000;
const SEARCH_CACHE_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';

export interface MarketQuote {
  symbol: string;
  price: number | null;
  previousClose: number | null;
  changePercent: number | null;
  currency: string;
  name: string | null;
  exchange: string | null;
  source: string | null;
  fetchedAt: string | null;
  stale: boolean;
}

interface PriceRow {
  symbol: string;
  price: unknown;
  previousClose: unknown;
  currency: string;
  name: string | null;
  exchange: string | null;
  source: string | null;
  fetchedAt: Date;
}

@Injectable()
export class MarketService {
  private readonly logger = new Logger(MarketService.name);
  private readonly cacheMs = (() => {
    const parsed = Number(process.env.MARKET_CACHE_MS);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CACHE_MS;
  })();
  private readonly searchCache = new Map<string, { at: number; results: MarketSearchResult[] }>();

  constructor(private prisma: PrismaService) {}

  async getQuote(symbol: string): Promise<MarketQuote> {
    const normalized = symbol.trim().toUpperCase();
    const cached = await this.prisma.assetPrice.findUnique({ where: { symbol: normalized } });

    if (cached && Date.now() - cached.fetchedAt.getTime() < this.cacheMs) {
      return this.toQuote(normalized, cached as PriceRow, false);
    }

    const fetched = await this.fetchQuote(normalized);
    if (!fetched) {
      if (cached) {
        this.logger.warn(`Market providers unavailable for ${normalized}; serving stale cache`);
        return this.toQuote(normalized, cached as PriceRow, true);
      }
      return {
        symbol: normalized,
        price: null,
        previousClose: null,
        changePercent: null,
        currency: 'USD',
        name: null,
        exchange: null,
        source: null,
        fetchedAt: null,
        stale: true,
      };
    }

    const saved = await this.prisma.assetPrice.upsert({
      where: { symbol: normalized },
      update: {
        price: fetched.price,
        previousClose: fetched.previousClose,
        currency: fetched.currency,
        name: fetched.name,
        exchange: fetched.exchange,
        source: fetched.source,
        fetchedAt: new Date(),
      },
      create: {
        symbol: normalized,
        price: fetched.price,
        previousClose: fetched.previousClose,
        currency: fetched.currency,
        name: fetched.name,
        exchange: fetched.exchange,
        source: fetched.source,
      },
    });
    return this.toQuote(normalized, saved as PriceRow, false);
  }

  async getQuotes(symbols: string[]): Promise<Map<string, MarketQuote>> {
    const unique = [...new Set(symbols.map((s) => s.trim().toUpperCase()))];
    const quotes = await Promise.all(unique.map((symbol) => this.getQuote(symbol)));
    return new Map(quotes.map((quote) => [quote.symbol, quote]));
  }

  async search(query: string, limit = 10): Promise<MarketSearchResult[]> {
    const q = query.trim();
    if (!q) return [];
    const key = `${q.toLowerCase()}:${limit}`;
    const cached = this.searchCache.get(key);
    if (cached && Date.now() - cached.at < SEARCH_CACHE_MS) return cached.results;

    const [yahoo, nasdaq] = await Promise.all([
      this.searchYahoo(q, limit),
      this.searchNasdaq(q, limit),
    ]);
    if (yahoo == null && nasdaq == null) {
      throw new ServiceUnavailableException('Market search is unavailable');
    }
    const results = yahoo && yahoo.length > 0 ? yahoo : nasdaq ?? [];
    this.searchCache.set(key, { at: Date.now(), results });
    return results;
  }

  private toQuote(symbol: string, row: PriceRow, stale: boolean): MarketQuote {
    const price = row.price == null ? null : Number(row.price);
    const previousClose = row.previousClose == null ? null : Number(row.previousClose);
    const changePercent =
      price != null && previousClose != null && previousClose > 0
        ? ((price - previousClose) / previousClose) * 100
        : null;
    return {
      symbol,
      price,
      previousClose,
      changePercent,
      currency: row.currency ?? 'USD',
      name: row.name ?? null,
      exchange: row.exchange ?? null,
      source: row.source ?? null,
      fetchedAt: row.fetchedAt.toISOString(),
      stale,
    };
  }

  private async fetchQuote(symbol: string): Promise<ParsedQuote | null> {
    const [yahoo, nasdaq] = await Promise.all([
      this.fetchYahoo(symbol),
      this.fetchNasdaq(symbol),
    ]);
    return yahoo ?? nasdaq;
  }

  private async fetchYahoo(symbol: string): Promise<ParsedQuote | null> {
    for (const host of ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']) {
      try {
        const url = `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
        const payload = await this.fetchJson(url, { 'User-Agent': USER_AGENT });
        const parsed = parseYahooChart(payload, symbol);
        if (parsed) return parsed;
      } catch (error) {
        this.logger.warn(`Yahoo (${host}) failed for ${symbol}: ${(error as Error).message}`);
      }
    }
    return null;
  }

  private async fetchNasdaq(symbol: string): Promise<ParsedQuote | null> {
    try {
      const url = `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/info?assetclass=etf`;
      const payload = await this.fetchJson(url, {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      });
      return parseNasdaqInfo(payload, symbol);
    } catch (error) {
      this.logger.warn(`Nasdaq failed for ${symbol}: ${(error as Error).message}`);
      return null;
    }
  }

  private async searchYahoo(q: string, limit: number): Promise<MarketSearchResult[] | null> {
    try {
      const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=${limit}&newsCount=0`;
      const payload = await this.fetchJson(url, { 'User-Agent': USER_AGENT });
      return parseYahooSearch(payload).slice(0, limit);
    } catch (error) {
      this.logger.warn(`Yahoo search failed: ${(error as Error).message}`);
      return null;
    }
  }

  private async searchNasdaq(q: string, limit: number): Promise<MarketSearchResult[] | null> {
    try {
      const url = `https://api.nasdaq.com/api/autocomplete/slookup/${limit}?search=${encodeURIComponent(q)}`;
      const payload = await this.fetchJson(url, {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      });
      return parseNasdaqSearch(payload).slice(0, limit);
    } catch (error) {
      this.logger.warn(`Nasdaq search failed: ${(error as Error).message}`);
      return null;
    }
  }

  private async fetchJson(url: string, headers: Record<string, string>): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal, headers });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }
}
