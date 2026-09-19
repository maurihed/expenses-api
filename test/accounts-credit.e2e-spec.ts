import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Accounts credit (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const accountIds: string[] = [];
  const categoryIds: string[] = [];

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const closingDay = now.getUTCDate();
  const month = now.getUTCMonth();
  const year = now.getUTCFullYear();
  const label = `E2E credito ${Date.now()}`;

  const createAccount = async (payload: Record<string, unknown>) => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .send(payload)
      .expect(201);
    accountIds.push(res.body.id);
    return res.body;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (accountIds.length) {
      const txs = await prisma.transaction.findMany({
        where: { accountId: { in: accountIds } },
        select: { id: true },
      });
      const txIds = txs.map((t) => t.id);
      if (txIds.length) {
        const plans = await prisma.installmentPlan.findMany({
          where: { transactionId: { in: txIds } },
          select: { id: true },
        });
        const planIds = plans.map((p) => p.id);
        if (planIds.length) {
          await prisma.installment.deleteMany({ where: { planId: { in: planIds } } });
          await prisma.installmentPlan.deleteMany({ where: { id: { in: planIds } } });
        }
        await prisma.transaction.deleteMany({ where: { id: { in: txIds } } });
      }
      await prisma.account.deleteMany({ where: { id: { in: accountIds } } });
    }
    if (categoryIds.length) {
      await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    }
    await app.close();
  });

  it('administra una cuenta de crédito, su resumen y su borrado suave', async () => {
    const created = await createAccount({
      name: `${label} Tarjeta`,
      type: 'CREDIT',
      currency: 'MXN',
      creditLimit: 10000,
      statementClosingDay: closingDay,
      paymentDueDay: 5,
      balance: 0,
    });

    expect(created).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        type: 'CREDIT',
        currency: 'MXN',
        creditLimit: 10000,
        statementClosingDay: closingDay,
        paymentDueDay: 5,
      }),
    );

    const accountId = created.id as string;

    await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .send({
        type: 'expense',
        accountId,
        amount: 1500,
        description: 'Cargo de prueba',
        date: today,
        category: `${label} Compras`,
      })
      .expect(201);

    const summary = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${accountId}/credit-summary`)
      .expect(200);
    expect(summary.body).toEqual({
      totalDebt: 1500,
      periodPayment: 1500,
      available: 8500,
      msiCommitted: 0,
    });

    await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .send({
        type: 'income',
        accountId,
        amount: 500,
        description: 'Pago de tarjeta',
        date: today,
        category: `${label} Compras`,
      })
      .expect(201);

    const afterPayment = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${accountId}/credit-summary`)
      .expect(200);
    expect(afterPayment.body).toEqual({
      totalDebt: 1000,
      periodPayment: 1000,
      available: 9000,
      msiCommitted: 0,
    });

    const category = await prisma.category.findUniqueOrThrow({ where: { name: `${label} Compras` } });
    categoryIds.push(category.id);

    const archived = await request(app.getHttpServer())
      .delete(`/api/v1/accounts/${accountId}`)
      .expect(200);
    expect(archived.body).toEqual(expect.objectContaining({ id: accountId, archived: true }));

    const list = await request(app.getHttpServer()).get('/api/v1/accounts').expect(200);
    expect(list.body.map((a: any) => a.id)).not.toContain(accountId);

    const withArchived = await request(app.getHttpServer())
      .get('/api/v1/accounts?includeArchived=true')
      .expect(200);
    expect(withArchived.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: accountId, archived: true })]),
    );

    const history = await request(app.getHttpServer())
      .get(`/api/v1/transactions?month=${month}&year=${year}`)
      .expect(200);
    const ids = history.body.map((t: any) => t.accountId);
    expect(ids.filter((value: string) => value === accountId)).toHaveLength(2);

    const stored = await prisma.transaction.count({ where: { accountId } });
    expect(stored).toBe(2);
  });

  it('cuenta solo la mensualidad MSI vencida en el periodo y las futuras en msiCommitted', async () => {
    const created = await createAccount({
      name: `${label} MSI`,
      type: 'CREDIT',
      currency: 'MXN',
      creditLimit: 10000,
      statementClosingDay: closingDay,
      paymentDueDay: 5,
      balance: 0,
    });
    const accountId = created.id as string;

    await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .send({
        type: 'expense',
        accountId,
        amount: 300,
        description: 'Cargo normal',
        date: today,
        category: `${label} Normal`,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .send({
        type: 'expense',
        accountId,
        amount: 1200,
        description: 'Compra MSI',
        date: today,
        category: `${label} MSI`,
        installments: 3,
      })
      .expect(201);

    const categories = await prisma.category.findMany({
      where: { name: { in: [`${label} Normal`, `${label} MSI`] } },
    });
    categoryIds.push(...categories.map((c) => c.id));

    const summary = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${accountId}/credit-summary`)
      .expect(200);

    expect(summary.body).toEqual({
      totalDebt: 1500,
      periodPayment: 700,
      available: 8500,
      msiCommitted: 800,
    });
  });

  it('responde 400 en credit-summary para una cuenta que no es de crédito', async () => {
    const created = await createAccount({ name: `${label} Efectivo`, type: 'CASH', balance: 100 });
    await request(app.getHttpServer())
      .get(`/api/v1/accounts/${created.id}/credit-summary`)
      .expect(400);
  });

  it('rechaza type, día de corte y creditLimit inválidos con 400', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .send({ name: `${label} Tipo`, type: 'SAVINGS' })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .send({ name: `${label} Corte`, type: 'CREDIT', statementClosingDay: 32 })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .send({ name: `${label} Limite`, type: 'CREDIT', creditLimit: null })
      .expect(400);
  });
});
