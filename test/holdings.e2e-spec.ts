import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Holdings (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accountId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.assetPrice.upsert({
      where: { symbol: 'VOO' },
      update: { price: 700, previousClose: 690, currency: 'USD', name: 'Vanguard S&P 500 ETF', exchange: 'NYSEArca', source: 'e2e', fetchedAt: new Date() },
      create: { symbol: 'VOO', price: 700, previousClose: 690, currency: 'USD', name: 'Vanguard S&P 500 ETF', exchange: 'NYSEArca', source: 'e2e' },
    });
    await prisma.exchangeRate.upsert({
      where: { base_quote: { base: 'USD', quote: 'MXN' } },
      update: { rate: 17, source: 'e2e', fetchedAt: new Date() },
      create: { base: 'USD', quote: 'MXN', rate: 17, source: 'e2e' },
    });

    const account = await prisma.account.create({
      data: { name: 'Inversión E2E', type: 'INVESTMENT', currency: 'MXN', openingBalance: 10000, balance: 10000 },
    });
    accountId = account.id;
  });

  afterAll(async () => {
    await prisma.holding.deleteMany({ where: { accountId } });
    await prisma.account.delete({ where: { id: accountId } });
    await prisma.assetPrice.deleteMany({ where: { symbol: 'VOO', source: 'e2e' } });
    await prisma.exchangeRate.deleteMany({ where: { base: 'USD', quote: 'MXN', source: 'e2e' } });
    await app.close();
  });

  it('crea una posición, descuenta el efectivo y devuelve los totales', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/accounts/${accountId}/holdings`)
      .send({ symbol: 'VOO', quantity: 0.5, deductFromCash: true })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${accountId}/holdings`)
      .expect(200);

    expect(res.body.cashBalance).toBeCloseTo(10000 - 0.5 * 700 * 17, 2);
    expect(res.body.positionsValue).toBeCloseTo(0.5 * 700 * 17, 2);
    expect(res.body.totalValue).toBeCloseTo(10000, 2);
    expect(res.body.holdings).toHaveLength(1);
    expect(res.body.holdings[0]).toMatchObject({ symbol: 'VOO', quantity: 0.5, stale: false });
  });

  it('rechaza un símbolo duplicado con 409', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/accounts/${accountId}/holdings`)
      .send({ symbol: 'VOO', quantity: 1 })
      .expect(409);
  });

  it('rechaza una cantidad no positiva con 400', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/accounts/${accountId}/holdings`)
      .send({ symbol: 'VOO', quantity: 0 })
      .expect(400);
  });

  it('rechaza una cuenta que no es de inversión con 400', async () => {
    const cash = await prisma.account.create({
      data: { name: 'Efectivo E2E holdings', type: 'CASH', balance: 0 },
    });
    await request(app.getHttpServer())
      .post(`/api/v1/accounts/${cash.id}/holdings`)
      .send({ symbol: 'VOO', quantity: 1 })
      .expect(400);
    await prisma.account.delete({ where: { id: cash.id } });
  });

  it('actualiza la cantidad sin reajustar el efectivo y elimina la posición', async () => {
    const list = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${accountId}/holdings`)
      .expect(200);
    const holdingId = list.body.holdings[0].id;
    const cashBefore = list.body.cashBalance;

    await request(app.getHttpServer())
      .put(`/api/v1/accounts/${accountId}/holdings/${holdingId}`)
      .send({ quantity: 1 })
      .expect(200);

    const after = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${accountId}/holdings`)
      .expect(200);
    expect(after.body.cashBalance).toBeCloseTo(cashBefore, 2);
    expect(after.body.positionsValue).toBeCloseTo(1 * 700 * 17, 2);

    await request(app.getHttpServer())
      .delete(`/api/v1/accounts/${accountId}/holdings/${holdingId}`)
      .expect(200);
    const empty = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${accountId}/holdings`)
      .expect(200);
    expect(empty.body.holdings).toHaveLength(0);
    expect(empty.body.positionsValue).toBe(0);
  });

  it('GET /accounts enriquece las cuentas de inversión', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/accounts/${accountId}/holdings`)
      .send({ symbol: 'VOO', quantity: 2 })
      .expect(201);

    const res = await request(app.getHttpServer()).get('/api/v1/accounts').expect(200);
    const investment = res.body.find((a: { id: string }) => a.id === accountId);
    expect(investment).toMatchObject({ type: 'INVESTMENT', currency: 'MXN' });
    expect(investment.cashBalance).toBeCloseTo(10000 - 0.5 * 700 * 17, 2);
    expect(investment.positionsValue).toBeCloseTo(2 * 700 * 17, 2);
    expect(investment.totalValue).toBeCloseTo(10000 - 0.5 * 700 * 17 + 2 * 700 * 17, 2);
  });
});
