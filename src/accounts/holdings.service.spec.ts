import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { HoldingsService } from './holdings.service';

const account = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'acc1',
  name: 'Inversión',
  type: 'INVESTMENT',
  currency: 'MXN',
  balance: 10000,
  openingBalance: 10000,
  ...over,
});

const buildPrisma = (over: Record<string, unknown> = {}) => {
  const db = {
    account: {
      findUnique: jest.fn().mockResolvedValue(account()),
      update: jest.fn().mockResolvedValue(account()),
    },
    holding: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'h1', ...data })),
      update: jest.fn().mockImplementation(async ({ data }) => ({ id: 'h1', symbol: 'VOO', quantity: 1, ...data })),
      delete: jest.fn().mockResolvedValue({}),
    },
  };
  return {
    ...db,
    $transaction: jest.fn().mockImplementation(async (fn: (client: unknown) => unknown) => fn(db)),
    ...over,
  };
};

const market = (price: number | null = 700, previousClose: number | null = 690) => ({
  getQuote: jest.fn().mockResolvedValue({
    symbol: 'VOO', price, previousClose, changePercent: null, currency: 'USD',
    name: 'Vanguard S&P 500 ETF', exchange: 'NYSEArca', source: 'yahoo',
    fetchedAt: price == null ? null : new Date().toISOString(), stale: price == null,
  }),
  getQuotes: jest.fn().mockResolvedValue(
    new Map([
      ['VOO', {
        symbol: 'VOO', price, previousClose, changePercent: null, currency: 'USD',
        name: 'Vanguard S&P 500 ETF', exchange: 'NYSEArca', source: 'yahoo',
        fetchedAt: price == null ? null : new Date().toISOString(), stale: price == null,
      }],
    ]),
  ),
});

const fx = (rate: number | null = 17) => ({
  getRate: rate == null ? jest.fn().mockRejectedValue(new Error('no fx')) : jest.fn().mockResolvedValue({ rate }),
});

describe('HoldingsService.create', () => {
  it('crea la posición y descuenta el efectivo (puede quedar negativo)', async () => {
    const prisma = buildPrisma();
    const service = new HoldingsService(prisma as never, market() as never, fx() as never);

    const result = await service.create('acc1', { symbol: 'voo', quantity: 1, deductFromCash: true });

    expect(result).toMatchObject({ symbol: 'VOO', quantity: 1 });
    expect(prisma.account.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ balance: 10000 - 1 * 700 * 17 }),
      }),
    );
  });

  it('rechaza símbolo inexistente con 400 y no crea', async () => {
    const prisma = buildPrisma();
    const service = new HoldingsService(prisma as never, market(null) as never, fx() as never);

    await expect(service.create('acc1', { symbol: 'ZZZZ', quantity: 1 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.holding.create).not.toHaveBeenCalled();
  });

  it('rechaza símbolo duplicado con 409', async () => {
    const prisma = buildPrisma();
    (prisma.holding.findUnique as jest.Mock).mockResolvedValue({ id: 'existing' });
    const service = new HoldingsService(prisma as never, market() as never, fx() as never);

    await expect(
      service.create('acc1', { symbol: 'VOO', quantity: 1 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rechaza cuentas que no son de inversión con 400', async () => {
    const prisma = buildPrisma();
    (prisma.account.findUnique as jest.Mock).mockResolvedValue(account({ type: 'CASH' }));
    const service = new HoldingsService(prisma as never, market() as never, fx() as never);

    await expect(service.create('acc1', { symbol: 'VOO', quantity: 1 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('HoldingsService.listForAccount', () => {
  it('valúa posiciones y suma el efectivo', async () => {
    const prisma = buildPrisma();
    (prisma.holding.findMany as jest.Mock).mockResolvedValue([
      { id: 'h1', symbol: 'VOO', name: 'Vanguard S&P 500 ETF', quantity: 2 },
    ]);
    const service = new HoldingsService(prisma as never, market() as never, fx() as never);

    const summary = await service.listForAccount('acc1');

    expect(summary.cashBalance).toBe(10000);
    expect(summary.positionsValue).toBeCloseTo(2 * 700 * 17, 6);
    expect(summary.totalValue).toBeCloseTo(10000 + 2 * 700 * 17, 6);
    expect(summary.holdings).toHaveLength(1);
    expect(summary.holdings[0].marketValueAccountCurrency).toBeCloseTo(2 * 700 * 17, 6);
  });

  it('deja los totales en null si no hay tasa FX (cuenta MXN)', async () => {
    const prisma = buildPrisma();
    (prisma.holding.findMany as jest.Mock).mockResolvedValue([
      { id: 'h1', symbol: 'VOO', name: 'Vanguard S&P 500 ETF', quantity: 2 },
    ]);
    const service = new HoldingsService(prisma as never, market() as never, fx(null) as never);

    const summary = await service.listForAccount('acc1');

    expect(summary.positionsValue).toBeNull();
    expect(summary.totalValue).toBeNull();
  });

  it('lanza 404 si la cuenta no existe', async () => {
    const prisma = buildPrisma();
    (prisma.account.findUnique as jest.Mock).mockResolvedValue(null);
    const service = new HoldingsService(prisma as never, market() as never, fx() as never);

    await expect(service.listForAccount('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('HoldingsService.update / remove', () => {
  it('update cambia la cantidad y no toca el efectivo', async () => {
    const prisma = buildPrisma();
    (prisma.holding.findFirst as jest.Mock).mockResolvedValue({ id: 'h1', accountId: 'acc1', symbol: 'VOO', quantity: 1 });
    const service = new HoldingsService(prisma as never, market() as never, fx() as never);

    await service.update('acc1', 'h1', { quantity: 3 });

    expect(prisma.holding.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'h1' }, data: { quantity: 3 } }),
    );
    expect(prisma.account.update).not.toHaveBeenCalled();
  });

  it('remove borra la posición', async () => {
    const prisma = buildPrisma();
    (prisma.holding.findFirst as jest.Mock).mockResolvedValue({ id: 'h1', accountId: 'acc1', symbol: 'VOO', quantity: 1 });
    const service = new HoldingsService(prisma as never, market() as never, fx() as never);

    await service.remove('acc1', 'h1');

    expect(prisma.holding.delete).toHaveBeenCalledWith({ where: { id: 'h1' } });
  });
});
