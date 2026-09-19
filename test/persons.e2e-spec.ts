import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const MAURICIO = '11111111-1111-4111-8111-111111111111';
const MARIA = '22222222-2222-4222-8222-222222222222';
const MISSING = '00000000-0000-4000-8000-000000000000';

describe('Persons (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adjustmentIds: string[] = [];
  const transactionIds: string[] = [];
  const accountIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (transactionIds.length) {
      await prisma.transaction.deleteMany({ where: { id: { in: transactionIds } } });
    }
    if (accountIds.length) {
      await prisma.account.deleteMany({ where: { id: { in: accountIds } } });
    }
    if (adjustmentIds.length) {
      await prisma.personalAdjustment.deleteMany({ where: { id: { in: adjustmentIds } } });
    }
    await app.close();
  });

  it('GET /persons devuelve las personas sembradas con presupuesto', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/persons').expect(200);

    const mauricio = res.body.find((p: any) => p.id === MAURICIO);
    const maria = res.body.find((p: any) => p.id === MARIA);
    expect(mauricio).toBeDefined();
    expect(maria).toBeDefined();

    for (const person of [mauricio, maria]) {
      expect(Object.keys(person).sort()).toEqual(
        ['id', 'name', 'weeklyAllowance', 'allowanceStartDate', 'balance', 'spent'].sort(),
      );
      expect(person.allowanceStartDate).toBe('2026-01-04');
      expect(typeof person.weeklyAllowance).toBe('number');
      expect(typeof person.balance).toBe('number');
      expect(typeof person.spent).toBe('number');
    }
    expect(mauricio.name).toBe('Mauricio');
    expect(maria.name).toBe('Maria');
  });

  it('GET /persons/:id/summary responde accrued, adjustmentTotal, spent y balance', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/persons/${MAURICIO}/summary`)
      .expect(200);
    expect(Object.keys(res.body).sort()).toEqual(
      ['accrued', 'adjustmentTotal', 'spent', 'balance'].sort(),
    );
    for (const key of ['accrued', 'adjustmentTotal', 'spent', 'balance']) {
      expect(typeof res.body[key]).toBe('number');
    }
  });

  it('GET /persons/:id/summary responde 404 si la persona no existe', () =>
    request(app.getHttpServer()).get(`/api/v1/persons/${MISSING}/summary`).expect(404));

  it('POST /persons/:id/adjustments suma 500 al balance', async () => {
    const before = await request(app.getHttpServer())
      .get(`/api/v1/persons/${MAURICIO}/summary`)
      .expect(200);

    const created = await request(app.getHttpServer())
      .post(`/api/v1/persons/${MAURICIO}/adjustments`)
      .send({ amount: 500, reason: 'Bono', date: '2026-01-05' })
      .expect(201);
    adjustmentIds.push(created.body.id);
    expect(created.body.amount).toBe(500);

    const after = await request(app.getHttpServer())
      .get(`/api/v1/persons/${MAURICIO}/summary`)
      .expect(200);

    expect(after.body.adjustmentTotal - before.body.adjustmentTotal).toBe(500);
    expect(after.body.balance - before.body.balance).toBe(500);
    expect(after.body.spent).toBe(before.body.spent);
  });

  it('POST /persons/:id/adjustments acepta montos negativos', async () => {
    const created = await request(app.getHttpServer())
      .post(`/api/v1/persons/${MAURICIO}/adjustments`)
      .send({ amount: -50, reason: 'Ajuste', date: '2026-01-06' })
      .expect(201);
    adjustmentIds.push(created.body.id);
    expect(created.body.amount).toBe(-50);
  });

  it('POST /persons/:id/adjustments responde 404 si la persona no existe', () =>
    request(app.getHttpServer())
      .post(`/api/v1/persons/${MISSING}/adjustments`)
      .send({ amount: 10, reason: 'x', date: '2026-01-05' })
      .expect(404));

  it('POST /persons/:id/adjustments valida amount, reason y date', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/persons/${MAURICIO}/adjustments`)
      .send({ reason: 'x', date: '2026-01-05' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/v1/persons/${MAURICIO}/adjustments`)
      .send({ amount: 'no', reason: 'x', date: '2026-01-05' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/v1/persons/${MAURICIO}/adjustments`)
      .send({ amount: 10, reason: 'x', date: '2026-02-30' })
      .expect(400);
  });

  it('spent solo suma gastos PERSONAL; el ingreso personal no cuenta como gasto', async () => {
    const account = await prisma.account.create({
      data: { name: `E2E Persons ${Date.now()}`, type: 'CASH', balance: 0 },
    });
    accountIds.push(account.id);

    const before = await request(app.getHttpServer())
      .get(`/api/v1/persons/${MAURICIO}/summary`)
      .expect(200);

    const income = await prisma.transaction.create({
      data: {
        accountId: account.id,
        amount: 1000,
        type: 'INCOME',
        date: new Date('2026-01-08T00:00:00.000Z'),
        description: 'Ingreso personal',
        scope: 'PERSONAL',
        personId: MAURICIO,
      },
    });
    transactionIds.push(income.id);

    const afterIncome = await request(app.getHttpServer())
      .get(`/api/v1/persons/${MAURICIO}/summary`)
      .expect(200);
    expect(afterIncome.body.spent).toBe(before.body.spent);
    expect(afterIncome.body.balance).toBe(before.body.balance);

    const expense = await prisma.transaction.create({
      data: {
        accountId: account.id,
        amount: 250,
        type: 'EXPENSE',
        date: new Date('2026-01-09T00:00:00.000Z'),
        description: 'Gasto personal',
        scope: 'PERSONAL',
        personId: MAURICIO,
      },
    });
    transactionIds.push(expense.id);

    const afterExpense = await request(app.getHttpServer())
      .get(`/api/v1/persons/${MAURICIO}/summary`)
      .expect(200);
    expect(afterExpense.body.spent).toBe(before.body.spent + 250);
    expect(afterExpense.body.balance).toBe(before.body.balance - 250);
  });

  it('PUT /persons/:id acepta cambios válidos y rechaza null', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/v1/persons/${MAURICIO}`)
      .send({ name: 'Mauricio' })
      .expect(200);
    expect(res.body.name).toBe('Mauricio');
    expect(res.body.allowanceStartDate).toBe('2026-01-04');

    await request(app.getHttpServer())
      .put(`/api/v1/persons/${MAURICIO}`)
      .send({ name: null })
      .expect(400);
    await request(app.getHttpServer())
      .put(`/api/v1/persons/${MAURICIO}`)
      .send({ weeklyAllowance: null })
      .expect(400);
    await request(app.getHttpServer())
      .put(`/api/v1/persons/${MAURICIO}`)
      .send({ allowanceStartDate: null })
      .expect(400);
  });

  it('PUT /persons/:id responde 404 si la persona no existe', () =>
    request(app.getHttpServer())
      .put(`/api/v1/persons/${MISSING}`)
      .send({ name: 'Nadie' })
      .expect(404));
});
