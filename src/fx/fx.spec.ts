import { FxService } from './fx.service';
import { parseFawaz, parseOpenErApi } from './fx.types';

describe('fx parsers', () => {
  it('parseOpenErApi lee rates[quote]', () => {
    expect(parseOpenErApi({ rates: { MXN: 17.5 } }, 'MXN')).toBe(17.5);
    expect(parseOpenErApi({ rates: { MXN: 0 } }, 'MXN')).toBeNull();
    expect(parseOpenErApi({}, 'MXN')).toBeNull();
    expect(parseOpenErApi(null, 'MXN')).toBeNull();
  });

  it('parseFawaz lee [base][quote]', () => {
    expect(parseFawaz({ usd: { mxn: 17.23 } }, 'USD', 'MXN')).toBe(17.23);
    expect(parseFawaz({ usd: {} }, 'USD', 'MXN')).toBeNull();
    expect(parseFawaz(null, 'USD', 'MXN')).toBeNull();
  });
});

const okJson = (payload: unknown) => ({ ok: true, json: async () => payload });

const buildPrisma = (cached: unknown = null) => ({
  exchangeRate: {
    findUnique: jest.fn().mockResolvedValue(cached),
    upsert: jest.fn().mockImplementation(async ({ create }) => ({
      ...create,
      rate: create.rate,
      fetchedAt: new Date(),
    })),
  },
});

const freshRow = { base: 'USD', quote: 'MXN', rate: 17.1, fetchedAt: new Date() };
const oldRow = { base: 'USD', quote: 'MXN', rate: 16.9, fetchedAt: new Date(Date.now() - 10 * 60 * 60 * 1000) };

describe('FxService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('devuelve la caché fresca sin llamar a la red', async () => {
    const prisma = buildPrisma(freshRow);
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const service = new FxService(prisma as never);
    const result = await service.getRate('usd', 'mxn');

    expect(result).toEqual({ base: 'USD', quote: 'MXN', rate: 17.1, fetchedAt: freshRow.fetchedAt.toISOString(), stale: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.exchangeRate.upsert).not.toHaveBeenCalled();
  });

  it('refresca con el proveedor primario y hace upsert', async () => {
    const prisma = buildPrisma(null);
    global.fetch = jest.fn().mockResolvedValueOnce(okJson({ rates: { MXN: 17.5 } })) as unknown as typeof fetch;

    const service = new FxService(prisma as never);
    const result = await service.getRate('USD', 'MXN');

    expect(result.rate).toBe(17.5);
    expect(result.stale).toBe(false);
    expect(prisma.exchangeRate.upsert).toHaveBeenCalledTimes(1);
  });

  it('usa el fallback si el primario falla', async () => {
    const prisma = buildPrisma(null);
    global.fetch = jest
      .fn()
      .mockRejectedValueOnce(new Error('primary down'))
      .mockResolvedValueOnce(okJson({ usd: { mxn: 17.23 } })) as unknown as typeof fetch;

    const service = new FxService(prisma as never);
    const result = await service.getRate('USD', 'MXN');

    expect(result.rate).toBe(17.23);
    expect(prisma.exchangeRate.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ source: 'fawazahmed0/currency-api' }) }),
    );
  });

  it('devuelve la caché stale si ambos proveedores fallan', async () => {
    const prisma = buildPrisma(oldRow);
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;

    const service = new FxService(prisma as never);
    const result = await service.getRate('USD', 'MXN');

    expect(result.rate).toBe(16.9);
    expect(result.stale).toBe(true);
  });

  it('lanza si ambos proveedores fallan y no hay caché', async () => {
    const prisma = buildPrisma(null);
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;

    const service = new FxService(prisma as never);
    await expect(service.getRate('USD', 'MXN')).rejects.toThrow();
  });
});
