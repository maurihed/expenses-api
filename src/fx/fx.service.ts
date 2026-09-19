import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FetchedRate, FxRateResult, parseFawaz, parseOpenErApi } from './fx.types';

const DEFAULT_CACHE_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

@Injectable()
export class FxService {
  private readonly logger = new Logger(FxService.name);
  private readonly cacheMs = (() => {
    const parsed = Number(process.env.FX_CACHE_MS);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CACHE_MS;
  })();

  constructor(private prisma: PrismaService) {}

  async getRate(base = 'USD', quote = 'MXN'): Promise<FxRateResult> {
    const normalizedBase = base.toUpperCase();
    const normalizedQuote = quote.toUpperCase();

    const cached = await this.prisma.exchangeRate.findUnique({
      where: { base_quote: { base: normalizedBase, quote: normalizedQuote } },
    });

    if (cached && Date.now() - cached.fetchedAt.getTime() < this.cacheMs) {
      return this.toResult(cached, false);
    }

    const fetched = await this.fetchRate(normalizedBase, normalizedQuote);
    if (!fetched) {
      if (cached) {
        this.logger.warn(
          `FX providers unavailable for ${normalizedBase}/${normalizedQuote}; serving stale cache`,
        );
        return this.toResult(cached, true);
      }
      throw new ServiceUnavailableException(
        `No exchange rate available for ${normalizedBase}/${normalizedQuote}`,
      );
    }

    return this.saveRate(normalizedBase, normalizedQuote, fetched);
  }

  async refresh(base = 'USD', quote = 'MXN'): Promise<FxRateResult> {
    const normalizedBase = base.toUpperCase();
    const normalizedQuote = quote.toUpperCase();

    const fetched = await this.fetchRate(normalizedBase, normalizedQuote);
    if (!fetched) {
      throw new ServiceUnavailableException(
        `No exchange rate available for ${normalizedBase}/${normalizedQuote}`,
      );
    }

    return this.saveRate(normalizedBase, normalizedQuote, fetched);
  }

  private async saveRate(
    base: string,
    quote: string,
    fetched: FetchedRate,
  ): Promise<FxRateResult> {
    const saved = await this.prisma.exchangeRate.upsert({
      where: { base_quote: { base, quote } },
      update: { rate: fetched.rate, source: fetched.source, fetchedAt: new Date() },
      create: { base, quote, rate: fetched.rate, source: fetched.source },
    });
    return this.toResult(saved, false);
  }

  private toResult(
    row: { base: string; quote: string; rate: unknown; fetchedAt: Date },
    stale: boolean,
  ): FxRateResult {
    return {
      base: row.base,
      quote: row.quote,
      rate: Number(row.rate),
      fetchedAt: row.fetchedAt.toISOString(),
      stale,
    };
  }

  /**
   * Consulta ambos proveedores en paralelo para acotar la latencia ante un
   * fallo total (~8s) y prefiere el primario.
   */
  private async fetchRate(base: string, quote: string): Promise<FetchedRate | null> {
    const [primary, fallback] = await Promise.all([
      this.fetchPrimary(base, quote),
      this.fetchFallback(base, quote),
    ]);
    return primary ?? fallback;
  }

  private async fetchPrimary(base: string, quote: string): Promise<FetchedRate | null> {
    try {
      const response = await this.fetchJson(`https://open.er-api.com/v6/latest/${base}`);
      const rate = parseOpenErApi(response, quote);
      return rate === null ? null : { rate, source: 'open.er-api.com' };
    } catch (error) {
      this.logger.warn(`Primary FX provider failed: ${(error as Error).message}`);
      return null;
    }
  }

  private async fetchFallback(base: string, quote: string): Promise<FetchedRate | null> {
    try {
      const response = await this.fetchJson(
        `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${base.toLowerCase()}.json`,
      );
      const rate = parseFawaz(response, base, quote);
      return rate === null ? null : { rate, source: 'fawazahmed0/currency-api' };
    } catch (error) {
      this.logger.warn(`Fallback FX provider failed: ${(error as Error).message}`);
      return null;
    }
  }

  private async fetchJson(url: string): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }
}
