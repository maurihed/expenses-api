import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { computeOpeningBalance } from '../domain/balance';
import {
  Currency,
  convertToAccountCurrency,
  dayChangePercent,
  previousPositionsValue,
  sumPositionValues,
  valuePosition,
} from '../domain/portfolio';
import { FxService } from '../fx/fx.service';
import { MarketService } from '../market/market.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHoldingDto } from './dto/create-holding.dto';
import { UpdateHoldingDto } from './dto/update-holding.dto';

export interface HoldingView {
  id: string;
  symbol: string;
  name: string | null;
  quantity: number;
  price: number | null;
  previousClose: number | null;
  changePercent: number | null;
  currency: string;
  marketValue: number | null;
  marketValueAccountCurrency: number | null;
  fetchedAt: string | null;
  stale: boolean;
}

export interface PortfolioSummary {
  currency: Currency;
  cashBalance: number;
  positionsValue: number | null;
  totalValue: number | null;
  changePercent: number | null;
  stale: boolean;
  holdings: HoldingView[];
}

interface AccountRow {
  id: string;
  type: string;
  currency: string;
  balance: unknown;
  openingBalance: unknown;
}

interface HoldingRow {
  id: string;
  symbol: string;
  name: string | null;
  quantity: unknown;
}

type QuoteMap = Awaited<ReturnType<MarketService['getQuotes']>>;

@Injectable()
export class HoldingsService {
  constructor(
    private prisma: PrismaService,
    private market: MarketService,
    private fx: FxService,
  ) {}

  async listForAccount(accountId: string): Promise<PortfolioSummary> {
    const account = await this.requireInvestmentAccount(accountId);
    const rows = await this.loadRows(account.id);
    const quotes = await this.loadQuotes(rows);
    return this.buildSummary(account as AccountRow, rows, quotes);
  }

  async summariesForAccounts(accounts: AccountRow[]): Promise<Map<string, PortfolioSummary>> {
    const investments = accounts.filter((account) => account.type === 'INVESTMENT');
    const rowsByAccount = new Map(
      await Promise.all(
        investments.map(async (account) => [account.id, await this.loadRows(account.id)] as const),
      ),
    );
    const symbols = new Set<string>();
    for (const rows of rowsByAccount.values()) {
      for (const row of rows) symbols.add(row.symbol);
    }
    const quotes = symbols.size ? await this.market.getQuotes([...symbols]) : new Map();
    const entries = await Promise.all(
      investments.map(
        async (account) =>
          [
            account.id,
            await this.buildSummary(account, rowsByAccount.get(account.id) ?? [], quotes),
          ] as const,
      ),
    );
    return new Map(entries);
  }

  async create(accountId: string, dto: CreateHoldingDto): Promise<HoldingView> {
    const account = (await this.requireInvestmentAccount(accountId)) as AccountRow;
    const symbol = dto.symbol.trim().toUpperCase();
    const quote = await this.market.getQuote(symbol);
    if (quote.price == null) {
      throw new BadRequestException(`Unknown symbol ${symbol}`);
    }

    const existing = await this.prisma.holding.findUnique({
      where: { accountId_symbol: { accountId, symbol } },
    });
    if (existing) {
      throw new ConflictException(`Symbol ${symbol} already exists in this account`);
    }

    const accountCurrency = account.currency as Currency;
    const usdRate = accountCurrency === 'MXN' ? await this.usdRate() : null;
    const cost =
      dto.deductFromCash === true
        ? convertToAccountCurrency(dto.quantity * (quote.price ?? 0), quote.currency, accountCurrency, usdRate)
        : null;
    if (dto.deductFromCash === true && cost == null) {
      throw new BadRequestException('Cannot convert the purchase cost to the account currency');
    }

    const currentBalance = Number(account.balance);
    const holding = await this.prisma.$transaction(async (db) => {
      const created = await db.holding.create({
        data: { accountId, symbol, name: quote.name, quantity: dto.quantity },
      });
      if (cost != null) {
        const netEffect = Number(account.balance) - Number(account.openingBalance);
        const nextBalance = currentBalance - cost;
        await db.account.update({
          where: { id: accountId },
          data: {
            balance: nextBalance,
            openingBalance: computeOpeningBalance(nextBalance, netEffect),
          },
        });
      }
      return created;
    });

    return this.toHoldingView(holding, quote, accountCurrency, usdRate);
  }

  async update(accountId: string, holdingId: string, dto: UpdateHoldingDto): Promise<HoldingView> {
    const account = (await this.requireInvestmentAccount(accountId)) as AccountRow;
    const accountCurrency = account.currency as Currency;
    const usdRate = accountCurrency === 'MXN' ? await this.usdRate() : null;
    const holding = await this.prisma.holding.findFirst({ where: { id: holdingId, accountId } });
    if (!holding) throw new NotFoundException(`Holding ${holdingId} not found`);

    const data: { quantity?: number; symbol?: string; name?: string | null } = {};
    let quote = null as Awaited<ReturnType<MarketService['getQuote']>> | null;

    if (dto.quantity !== undefined) data.quantity = dto.quantity;
    if (dto.symbol !== undefined) {
      const symbol = dto.symbol.trim().toUpperCase();
      quote = await this.market.getQuote(symbol);
      if (quote.price == null) throw new BadRequestException(`Unknown symbol ${symbol}`);
      const duplicate = await this.prisma.holding.findUnique({
        where: { accountId_symbol: { accountId, symbol } },
      });
      if (duplicate && duplicate.id !== holdingId) {
        throw new ConflictException(`Symbol ${symbol} already exists in this account`);
      }
      data.symbol = symbol;
      data.name = quote.name;
    }

    const updated = await this.prisma.holding.update({ where: { id: holdingId }, data });
    if (quote == null) {
      quote = await this.market.getQuote(updated.symbol);
    }
    return this.toHoldingView(updated, quote, accountCurrency, usdRate);
  }

  async remove(accountId: string, holdingId: string): Promise<void> {
    await this.requireInvestmentAccount(accountId);
    const holding = await this.prisma.holding.findFirst({ where: { id: holdingId, accountId } });
    if (!holding) throw new NotFoundException(`Holding ${holdingId} not found`);
    await this.prisma.holding.delete({ where: { id: holdingId } });
  }

  private async requireInvestmentAccount(accountId: string): Promise<AccountRow> {
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException(`Account ${accountId} not found`);
    if (account.type !== 'INVESTMENT') {
      throw new BadRequestException(`Account ${accountId} is not an investment account`);
    }
    return account as AccountRow;
  }

  private async usdRate(): Promise<number | null> {
    try {
      const rate = await this.fx.getRate('USD', 'MXN');
      return rate.rate;
    } catch {
      return null;
    }
  }

  private loadRows(accountId: string): Promise<HoldingRow[]> {
    return this.prisma.holding.findMany({
      where: { accountId },
      orderBy: { createdAt: 'asc' },
    });
  }

  private loadQuotes(rows: HoldingRow[]): Promise<QuoteMap> {
    return rows.length
      ? this.market.getQuotes(rows.map((row) => row.symbol))
      : Promise.resolve(new Map());
  }

  private async buildSummary(
    account: AccountRow,
    rows: HoldingRow[],
    quotes: QuoteMap,
  ): Promise<PortfolioSummary> {
    const accountCurrency = account.currency as Currency;
    const usdRate = accountCurrency === 'MXN' ? await this.usdRate() : null;

    const holdings: HoldingView[] = rows.map((row) => {
      const quote = quotes.get(row.symbol);
      return this.toHoldingView(row, quote, accountCurrency, usdRate);
    });

    const positionsValue = sumPositionValues(
      holdings.map((holding) => holding.marketValueAccountCurrency),
    );
    const previous = previousPositionsValue(
      rows.map((row) => {
        const quote = quotes.get(row.symbol);
        return {
          quantity: Number(row.quantity),
          previousClose: quote?.previousClose ?? null,
          priceCurrency: quote?.currency ?? 'USD',
        };
      }),
      accountCurrency,
      usdRate,
    );
    const cashBalance = Number(account.balance);

    return {
      currency: accountCurrency,
      cashBalance,
      positionsValue,
      totalValue: positionsValue == null ? null : cashBalance + positionsValue,
      changePercent: dayChangePercent(positionsValue, previous),
      stale: holdings.some((holding) => holding.stale),
      holdings,
    };
  }

  private toHoldingView(
    holding: { id: string; symbol: string; name: string | null; quantity: unknown },
    quote:
      | {
          price: number | null;
          previousClose: number | null;
          changePercent: number | null;
          currency: string;
          name: string | null;
          fetchedAt: string | null;
          stale: boolean;
        }
      | undefined,
    accountCurrency: Currency,
    usdRate: number | null,
  ): HoldingView {
    const quantity = Number(holding.quantity);
    const price = quote?.price ?? null;
    const priceCurrency = quote?.currency ?? 'USD';
    const valued = valuePosition({
      quantity,
      price,
      previousClose: quote?.previousClose ?? null,
      priceCurrency,
      accountCurrency,
      usdRate,
    });
    return {
      id: holding.id,
      symbol: holding.symbol,
      name: holding.name ?? quote?.name ?? null,
      quantity,
      price,
      previousClose: quote?.previousClose ?? null,
      changePercent: valued.changePercent,
      currency: priceCurrency,
      marketValue: valued.marketValue,
      marketValueAccountCurrency: valued.marketValueAccountCurrency,
      fetchedAt: quote?.fetchedAt ?? null,
      stale: quote?.stale ?? true,
    };
  }
}
