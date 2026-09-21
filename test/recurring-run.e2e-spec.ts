import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RecurringService } from '../src/recurring/recurring.service';

const SEEDED_PERSON_ID = '11111111-1111-4111-8111-111111111111';

const day = (date: Date) => date.toISOString().slice(0, 10);

describe('Recurring runDue engine (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let recurring: RecurringService;
  const accountIds: string[] = [];
  const categoryIds: string[] = [];
  const ruleIds: string[] = [];
  let categorySeq = 0;
  let currentRuleIds: string[] | null = null;

  const uniqueCategory = (label: string) => `E2E Run ${label} ${Date.now()}-${categorySeq++}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    recurring = app.get(RecurringService);
  });

  afterEach(async () => {
    // runDue is global: keep only the rule under test active so aggregate
    // counters stay deterministic and other suites' rules are never touched.
    if (ruleIds.length) {
      await prisma.recurringRule.updateMany({
        where: { id: { in: ruleIds } },
        data: { active: false },
      });
    }
  });

  afterAll(async () => {
    if (ruleIds.length) {
      await prisma.recurringOccurrence.deleteMany({ where: { ruleId: { in: ruleIds } } });
    }
    if (accountIds.length) {
      await prisma.transaction.deleteMany({ where: { accountId: { in: accountIds } } });
    }
    if (ruleIds.length) {
      await prisma.recurringRule.deleteMany({ where: { id: { in: ruleIds } } });
    }
    if (accountIds.length) {
      await prisma.account.deleteMany({ where: { id: { in: accountIds } } });
    }
    if (categoryIds.length) {
      await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    }
    await app.close();
  });

  const createAccount = async (
    name: string,
    balance = 1000,
    extra: Record<string, unknown> = {},
  ) => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .send({ name, balance, ...extra })
      .expect(201);
    accountIds.push(res.body.id);
    return res.body.id as string;
  };

  const createCategory = async (label: string) => {
    const category = await prisma.category.create({ data: { name: uniqueCategory(label) } });
    categoryIds.push(category.id);
    return category.id;
  };

  const createRule = async (payload: Record<string, unknown>) => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/recurring')
      .send(payload)
      .expect(201);
    ruleIds.push(res.body.id);
    currentRuleIds = [res.body.id];
    return res.body;
  };

  // Scope the sweep to the rule(s) under test so parallel suites don't interfere.
  const runAsOf = (asOf: Date) => recurring.runDue(asOf, currentRuleIds ?? undefined);

  const balanceOf = async (accountId: string) => {
    const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    return Number(account.balance);
  };

  it('materializa una suscripción vencida, ajusta el saldo y es idempotente', async () => {
    const accountId = await createAccount('Run Suscripción', 1000);
    const categoryId = await createCategory('Suscripción');
    const rule = await createRule({
      name: 'Netflix Run',
      type: 'subscription',
      accountId,
      categoryId,
      amount: 199.99,
      frequency: 'monthly',
      dayOfMonth: 15,
      startDate: '2025-01-15',
      scope: 'joint',
    });
    expect(rule.nextRunDate).toBe('2025-01-15');

    const asOf = new Date('2025-01-31T00:00:00.000Z');
    const first = await runAsOf(asOf);
    expect(first).toEqual({ created: 1, skipped: 0, failed: 0 });

    const tx = await prisma.transaction.findMany({ where: { accountId } });
    expect(tx).toHaveLength(1);
    expect(tx[0].type).toBe('EXPENSE');
    expect(tx[0].description).toBe('Netflix Run');
    expect(tx[0].categoryId).toBe(categoryId);
    expect(Number(tx[0].amount)).toBe(199.99);
    expect(day(tx[0].date)).toBe('2025-01-15');
    expect(Number(await balanceOf(accountId))).toBe(800.01);

    const occurrences = await prisma.recurringOccurrence.findMany({ where: { ruleId: rule.id } });
    expect(occurrences).toHaveLength(1);
    expect(day(occurrences[0].date)).toBe('2025-01-15');
    expect(Number(occurrences[0].amount)).toBe(199.99);
    expect(occurrences[0].transactionId).toBe(tx[0].id);

    const second = await runAsOf(asOf);
    expect(second).toEqual({ created: 0, skipped: 0, failed: 0 });
    expect(await prisma.transaction.count({ where: { accountId } })).toBe(1);

    const reloaded = await prisma.recurringRule.findUniqueOrThrow({ where: { id: rule.id } });
    expect(day(reloaded.nextRunDate)).toBe('2025-02-15');
    expect(reloaded.lastRunDate).not.toBeNull();
    expect(day(reloaded.lastRunDate as Date)).toBe('2025-01-15');
  });

  it('materializa varias ocurrencias vencidas de una sola regla', async () => {
    const accountId = await createAccount('Run Varias', 1000);
    const rule = await createRule({
      name: 'Varias ocurrencias',
      type: 'subscription',
      accountId,
      amount: 100,
      frequency: 'monthly',
      dayOfMonth: 1,
      startDate: '2025-01-01',
    });

    const result = await runAsOf(new Date('2025-03-15T00:00:00.000Z'));
    expect(result).toEqual({ created: 3, skipped: 0, failed: 0 });
    expect(Number(await balanceOf(accountId))).toBe(700);

    const reloaded = await prisma.recurringRule.findUniqueOrThrow({ where: { id: rule.id } });
    expect(day(reloaded.nextRunDate)).toBe('2025-04-01');
    expect(day(reloaded.lastRunDate as Date)).toBe('2025-03-01');
  });

  it('crea un INCOME cuando corre una regla de ingreso y sube el saldo', async () => {
    const accountId = await createAccount('Run Ingreso', 1000);
    const rule = await createRule({
      name: 'Nómina Run',
      type: 'income',
      accountId,
      amount: 5000,
      frequency: 'monthly',
      dayOfMonth: 1,
      startDate: '2025-03-01',
      scope: 'personal',
      personId: SEEDED_PERSON_ID,
    });

    const result = await runAsOf(new Date('2025-03-31T00:00:00.000Z'));
    expect(result).toEqual({ created: 1, skipped: 0, failed: 0 });

    const tx = await prisma.transaction.findMany({ where: { accountId } });
    expect(tx).toHaveLength(1);
    expect(tx[0].type).toBe('INCOME');
    expect(Number(tx[0].amount)).toBe(5000);
    expect(tx[0].scope).toBe('PERSONAL');
    expect(tx[0].personId).toBe(SEEDED_PERSON_ID);
    expect(Number(await balanceOf(accountId))).toBe(6000);

    const occurrences = await prisma.recurringOccurrence.findMany({ where: { ruleId: rule.id } });
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].transactionId).toBe(tx[0].id);
  });

  it('crea el INCOME de interés con computeInterest sobre el saldo actual', async () => {
    const accountId = await createAccount('Run Interés', 10000);
    const rule = await createRule({
      name: 'Interés Run',
      type: 'interest',
      accountId,
      interestTiers: [
        { upTo: 10000, annualRate: 0.12 },
        { upTo: null, annualRate: 0.06 },
      ],
      frequency: 'monthly',
      startDate: '2025-04-30',
    });

    const result = await runAsOf(new Date('2025-04-30T00:00:00.000Z'));
    expect(result).toEqual({ created: 1, skipped: 0, failed: 0 });

    const tx = await prisma.transaction.findMany({ where: { accountId } });
    expect(tx).toHaveLength(1);
    expect(tx[0].type).toBe('INCOME');
    expect(Number(tx[0].amount)).toBe(100);
    expect(Number(await balanceOf(accountId))).toBe(10100);

    const occurrences = await prisma.recurringOccurrence.findMany({ where: { ruleId: rule.id } });
    expect(occurrences).toHaveLength(1);
    expect(Number(occurrences[0].amount)).toBe(100);
    expect(occurrences[0].transactionId).toBe(tx[0].id);
  });

  it('materializa interés diario (tasa anual / 365) en cada día vencido', async () => {
    const accountId = await createAccount('Run Interés Diario', 10000);
    const rule = await createRule({
      name: 'Interés diario',
      type: 'interest',
      accountId,
      interestTiers: [{ upTo: null, annualRate: 0.365 }],
      frequency: 'daily',
      startDate: '2025-07-01',
    });
    expect(rule.nextRunDate).toBe('2025-07-01');
    expect(rule.dayOfMonth).toBeNull();
    expect(rule.dayOfWeek).toBeNull();

    const result = await runAsOf(new Date('2025-07-03T00:00:00.000Z'));
    expect(result).toEqual({ created: 3, skipped: 0, failed: 0 });

    const tx = await prisma.transaction.findMany({
      where: { accountId },
      orderBy: { date: 'asc' },
    });
    expect(tx).toHaveLength(3);
    expect(tx.map((t) => day(t.date))).toEqual(['2025-07-01', '2025-07-02', '2025-07-03']);
    expect(tx.every((t) => t.type === 'INCOME')).toBe(true);
    // 10000 * 0.365 / 365 = 10/día, componiendo sobre el saldo actualizado.
    expect(tx.map((t) => Number(t.amount))).toEqual([10, 10.01, 10.02]);
    expect(Number(await balanceOf(accountId))).toBeCloseTo(10030.03, 2);
  });

  it('registra la ocurrencia de interés con monto 0 y sin transacción', async () => {
    const accountId = await createAccount('Run Interés Cero', 0);
    const rule = await createRule({
      name: 'Interés cero',
      type: 'interest',
      accountId,
      interestTiers: [{ upTo: null, annualRate: 0.1 }],
      frequency: 'monthly',
      startDate: '2025-05-31',
    });

    const result = await runAsOf(new Date('2025-05-31T00:00:00.000Z'));
    expect(result).toEqual({ created: 1, skipped: 0, failed: 0 });
    expect(await prisma.transaction.count({ where: { accountId } })).toBe(0);

    const occurrences = await prisma.recurringOccurrence.findMany({ where: { ruleId: rule.id } });
    expect(occurrences).toHaveLength(1);
    expect(Number(occurrences[0].amount)).toBe(0);
    expect(occurrences[0].transactionId).toBeNull();
  });

  it('salta una ocurrencia ya registrada sin duplicar la transacción', async () => {
    const accountId = await createAccount('Run Skip', 1000);
    const rule = await createRule({
      name: 'Skip Run',
      type: 'subscription',
      accountId,
      amount: 50,
      frequency: 'monthly',
      dayOfMonth: 10,
      startDate: '2025-06-10',
    });

    await prisma.recurringOccurrence.create({
      data: { ruleId: rule.id, date: new Date('2025-06-10T00:00:00.000Z'), amount: 50 },
    });

    const result = await runAsOf(new Date('2025-06-10T00:00:00.000Z'));
    expect(result).toEqual({ created: 0, skipped: 1, failed: 0 });
    expect(await prisma.transaction.count({ where: { accountId } })).toBe(0);

    const reloaded = await prisma.recurringRule.findUniqueOrThrow({ where: { id: rule.id } });
    expect(day(reloaded.nextRunDate)).toBe('2025-07-10');
  });

  it('respeta endDate al materializar', async () => {
    const accountId = await createAccount('Run Fin', 1000);
    const rule = await createRule({
      name: 'Fin Run',
      type: 'subscription',
      accountId,
      amount: 10,
      frequency: 'monthly',
      dayOfMonth: 1,
      startDate: '2025-01-01',
      endDate: '2025-02-15',
    });

    const result = await runAsOf(new Date('2025-12-31T00:00:00.000Z'));
    expect(result).toEqual({ created: 2, skipped: 0, failed: 0 });
    expect(await prisma.transaction.count({ where: { accountId } })).toBe(2);

    const reloaded = await prisma.recurringRule.findUniqueOrThrow({ where: { id: rule.id } });
    expect(day(reloaded.nextRunDate)).toBe('2025-03-01');
    expect(reloaded.active).toBe(false);
  });

  it('desactiva una regla cuyo nextRunDate ya superó endDate sin materializar nada', async () => {
    const accountId = await createAccount('Run Fin Pasado', 1000);
    const rule = await createRule({
      name: 'Fin Pasado',
      type: 'subscription',
      accountId,
      amount: 10,
      frequency: 'monthly',
      dayOfMonth: 31,
      startDate: '2025-01-01',
      endDate: '2025-01-15',
    });
    expect(rule.nextRunDate).toBe('2025-01-31');

    const result = await runAsOf(new Date('2025-03-31T00:00:00.000Z'));
    expect(result).toEqual({ created: 0, skipped: 0, failed: 0 });
    expect(await prisma.transaction.count({ where: { accountId } })).toBe(0);

    const reloaded = await prisma.recurringRule.findUniqueOrThrow({ where: { id: rule.id } });
    expect(reloaded.active).toBe(false);
    expect(day(reloaded.nextRunDate)).toBe('2025-01-31');
  });

  it('POST /recurring/run devuelve { created, skipped, failed }', async () => {
    const accountId = await createAccount('Run Endpoint', 1000);
    await createRule({
      name: 'Endpoint Run',
      type: 'subscription',
      accountId,
      amount: 25,
      frequency: 'monthly',
      dayOfMonth: 1,
      startDate: '2025-01-01',
      endDate: '2025-02-15',
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/recurring/run?ruleId=${currentRuleIds?.[0]}`)
      .expect(201);
    expect(res.body).toEqual({ created: 2, skipped: 0, failed: 0 });
    expect(await prisma.transaction.count({ where: { accountId } })).toBe(2);
  });

  it('materializa un EXPENSE de suscripción en CREDIT incrementando la deuda', async () => {
    const accountId = await createAccount('Run Crédito Suscripción', 0, {
      type: 'CREDIT',
      creditLimit: 50000,
    });
    const categoryId = await createCategory('Crédito Suscripción');
    await createRule({
      name: 'Suscripción Crédito',
      type: 'subscription',
      accountId,
      categoryId,
      amount: 300,
      frequency: 'monthly',
      dayOfMonth: 5,
      startDate: '2025-01-05',
    });

    const result = await runAsOf(new Date('2025-01-31T00:00:00.000Z'));
    expect(result).toEqual({ created: 1, skipped: 0, failed: 0 });

    const tx = await prisma.transaction.findMany({ where: { accountId } });
    expect(tx).toHaveLength(1);
    expect(tx[0].type).toBe('EXPENSE');
    expect(Number(await balanceOf(accountId))).toBe(300);
  });

  it('materializa un INCOME de interés en CREDIT reduciendo la deuda', async () => {
    const accountId = await createAccount('Run Crédito Interés', 1000, {
      type: 'CREDIT',
      creditLimit: 50000,
    });
    await createRule({
      name: 'Interés Crédito',
      type: 'interest',
      accountId,
      interestTiers: [{ upTo: null, annualRate: 0.12 }],
      frequency: 'monthly',
      startDate: '2025-02-28',
    });

    const result = await runAsOf(new Date('2025-02-28T00:00:00.000Z'));
    expect(result).toEqual({ created: 1, skipped: 0, failed: 0 });

    const tx = await prisma.transaction.findMany({ where: { accountId } });
    expect(tx).toHaveLength(1);
    expect(tx[0].type).toBe('INCOME');
    expect(Number(tx[0].amount)).toBe(10);
    expect(Number(await balanceOf(accountId))).toBe(990);
  });

  it('aísla el fallo de una regla y continúa con las demás', async () => {
    const brokenAccountId = await createAccount('Run Fallo', 1000);
    const brokenRule = await createRule({
      name: 'Regla con tramos corruptos',
      type: 'interest',
      accountId: brokenAccountId,
      interestTiers: [{ upTo: null, annualRate: 0.1 }],
      frequency: 'monthly',
      startDate: '2025-01-01',
    });
    // Force a per-rule failure: a null entry inside the JSON tiers makes
    // computeInterest throw at runtime.
    await prisma.recurringRule.update({
      where: { id: brokenRule.id },
      data: { interestTiers: [null] as any },
    });

    const goodAccountId = await createAccount('Run Bueno', 1000);
    const goodRule = await createRule({
      name: 'Regla posterior válida',
      type: 'subscription',
      accountId: goodAccountId,
      amount: 100,
      frequency: 'monthly',
      dayOfMonth: 1,
      startDate: '2025-01-01',
    });
    // Sweep both rules to exercise per-rule failure isolation.
    currentRuleIds = [brokenRule.id, goodRule.id];

    const result = await runAsOf(new Date('2025-01-31T00:00:00.000Z'));
    expect(result).toEqual({ created: 1, skipped: 0, failed: 1 });
    expect(await prisma.transaction.count({ where: { accountId: goodAccountId } })).toBe(1);

    const broken = await prisma.recurringRule.findUniqueOrThrow({ where: { id: brokenRule.id } });
    expect(day(broken.nextRunDate)).toBe('2025-01-01');
  });
});
