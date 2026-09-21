import { MarketService } from './market.service';

const okJson = (payload: unknown) => ({ ok: true, json: async () => payload });

const buildPrisma = (cached: unknown = null) => ({
  assetPrice: {
    findUnique: jest.fn().mockResolvedValue(cached),
    upsert: jest.fn().mockImplementation(async ({ create }) => ({
      ...create,
      price: create.price,
      previousClose: create.previousClose ?? null,
      fetchedAt: new Date(),
    })),
  },
});

const yahooPayload = {
  chart: {
    result: [
      {
        meta: {
          currency: 'USD',
          longName: 'Vanguard S&P 500 ETF',
          fullExchangeName: 'NYSEArca',
          regularMarketPrice: 712.8,
          chartPreviousClose: 701.78,
        },
      },
    ],
  },
};

const freshRow = {
  symbol: 'VOO',
  price: 700,
  previousClose: 690,
  currency: 'USD',
  name: 'Vanguard S&P 500 ETF',
  exchange: 'NYSEArca',
  source: 'yahoo',
  fetchedAt: new Date(),
};
const oldRow = { ...freshRow, price: 650, fetchedAt: new Date(Date.now() - 10 * 60 * 60 * 1000) };

describe('MarketService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('devuelve la caché fresca sin llamar a la red', async () => {
    const prisma = buildPrisma(freshRow);
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const service = new MarketService(prisma as never);
    const quote = await service.getQuote('voo');

    expect(quote).toMatchObject({ symbol: 'VOO', price: 700, stale: false });
    expect(quote.changePercent).toBeCloseTo(((700 - 690) / 690) * 100, 6);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refresca con Yahoo y hace upsert', async () => {
    const prisma = buildPrisma(null);
    global.fetch = jest.fn().mockResolvedValue(okJson(yahooPayload)) as unknown as typeof fetch;

    const service = new MarketService(prisma as never);
    const quote = await service.getQuote('VOO');

    expect(quote.price).toBe(712.8);
    expect(quote.stale).toBe(false);
    expect(prisma.assetPrice.upsert).toHaveBeenCalledTimes(1);
  });

  it('usa Nasdaq si Yahoo devuelve un payload inutilizable', async () => {
    const prisma = buildPrisma(null);
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('yahoo')) return Promise.resolve(okJson({ chart: { result: [] } }));
      return Promise.resolve(
        okJson({ data: { companyName: 'Vanguard S&P 500 ETF', exchange: 'PSE', primaryData: { lastSalePrice: '$711.00', netChange: '1.00' } } }),
      );
    }) as unknown as typeof fetch;

    const service = new MarketService(prisma as never);
    const quote = await service.getQuote('VOO');

    expect(quote.price).toBe(711);
    expect(prisma.assetPrice.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ source: 'nasdaq' }) }),
    );
  });

  it('sirve la caché stale si ambos proveedores fallan', async () => {
    const prisma = buildPrisma(oldRow);
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;

    const service = new MarketService(prisma as never);
    const quote = await service.getQuote('VOO');

    expect(quote.price).toBe(650);
    expect(quote.stale).toBe(true);
  });

  it('devuelve price null si ambos fallan y no hay caché', async () => {
    const prisma = buildPrisma(null);
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;

    const service = new MarketService(prisma as never);
    const quote = await service.getQuote('VOO');

    expect(quote).toMatchObject({ price: null, stale: true, fetchedAt: null });
  });

  it('search filtra a ETFs y usa Nasdaq si Yahoo falla', async () => {
    const prisma = buildPrisma(null);
    global.fetch = jest
      .fn()
      .mockRejectedValueOnce(new Error('yahoo down'))
      .mockResolvedValueOnce(
        okJson({ data: [{ symbol: 'BIV', name: 'Bond ETF', asset: 'ETF', exchange: 'PSE' }] }),
      ) as unknown as typeof fetch;

    const service = new MarketService(prisma as never);
    const results = await service.search('bond');

    expect(results).toEqual([
      { symbol: 'BIV', name: 'Bond ETF', exchange: 'PSE', currency: null },
    ]);
  });

  it('search lanza si ambos proveedores fallan', async () => {
    const prisma = buildPrisma(null);
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;

    const service = new MarketService(prisma as never);
    await expect(service.search('vanguard')).rejects.toThrow();
  });
});
