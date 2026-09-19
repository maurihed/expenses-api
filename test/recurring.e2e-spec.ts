import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const SEEDED_PERSON_ID = '11111111-1111-4111-8111-111111111111';
const MISSING_ID = '00000000-0000-4000-8000-000000000000';

describe('Recurring rules CRUD (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const accountIds: string[] = [];
  const categoryIds: string[] = [];
  const ruleIds: string[] = [];
  let categorySeq = 0;

  const uniqueCategory = (label: string) => `E2E Rec ${label} ${Date.now()}-${categorySeq++}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
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

  const createAccount = async (name: string) => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .send({ name, balance: 1000 })
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
    return res.body;
  };

  const listRules = async (query = '') => {
    const res = await request(app.getHttpServer()).get(`/api/v1/recurring${query}`).expect(200);
    return res.body as any[];
  };

  it('crea, lista, edita el monto y desactiva una suscripción mensual', async () => {
    const accountId = await createAccount('Rec Suscripción');
    const categoryId = await createCategory('Suscripción');

    const created = await createRule({
      name: 'Netflix',
      type: 'subscription',
      accountId,
      categoryId,
      amount: 199.99,
      frequency: 'monthly',
      dayOfMonth: 15,
      startDate: '2026-01-01',
      scope: 'joint',
    });

    expect(created).toEqual(
      expect.objectContaining({
        name: 'Netflix',
        type: 'subscription',
        accountId,
        categoryId,
        amount: 199.99,
        frequency: 'monthly',
        dayOfMonth: 15,
        startDate: '2026-01-01',
        nextRunDate: '2026-01-15',
        lastRunDate: null,
        interestTiers: null,
        scope: 'joint',
        active: true,
      }),
    );
    expect(typeof created.amount).toBe('number');

    const listed = await listRules();
    const mine = listed.find((r) => r.id === created.id);
    expect(mine).toBeDefined();
    expect(mine.type).toBe('subscription');
    expect(mine.frequency).toBe('monthly');
    expect(mine.amount).toBe(199.99);
    expect(mine.startDate).toBe('2026-01-01');
    expect(mine.nextRunDate).toBe('2026-01-15');

    const updated = await request(app.getHttpServer())
      .put(`/api/v1/recurring/${created.id}`)
      .send({ amount: 250.5 })
      .expect(200);
    expect(updated.body.amount).toBe(250.5);
    expect(updated.body.nextRunDate).toBe('2026-01-15');

    await request(app.getHttpServer())
      .delete(`/api/v1/recurring/${created.id}`)
      .expect(200);

    const active = await listRules();
    expect(active.find((r) => r.id === created.id)).toBeUndefined();

    const all = await listRules('?includeInactive=true');
    const inactive = all.find((r) => r.id === created.id);
    expect(inactive).toBeDefined();
    expect(inactive.active).toBe(false);

    const stored = await prisma.recurringRule.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.active).toBe(false);
  });

  it('crea una regla INTEREST con tramos y una regla INCOME', async () => {
    const accountId = await createAccount('Rec Interés/Ingreso');

    const interest = await createRule({
      name: 'Interés cuenta',
      type: 'interest',
      accountId,
      interestTiers: [
        { upTo: 10000, annualRate: 0.12 },
        { upTo: null, annualRate: 0.06 },
      ],
      frequency: 'monthly',
      startDate: '2026-02-10',
    });
    expect(interest).toEqual(
      expect.objectContaining({
        type: 'interest',
        amount: null,
        frequency: 'monthly',
        startDate: '2026-02-10',
        nextRunDate: '2026-02-10',
        interestTiers: [
          { upTo: 10000, annualRate: 0.12 },
          { upTo: null, annualRate: 0.06 },
        ],
      }),
    );

    const income = await createRule({
      name: 'Nómina',
      type: 'income',
      accountId,
      amount: 5000,
      frequency: 'biweekly',
      dayOfWeek: 5,
      startDate: '2026-01-02',
      scope: 'personal',
      personId: SEEDED_PERSON_ID,
    });
    expect(income).toEqual(
      expect.objectContaining({
        type: 'income',
        amount: 5000,
        frequency: 'biweekly',
        dayOfWeek: 5,
        startDate: '2026-01-02',
        nextRunDate: '2026-01-02',
        scope: 'personal',
        personId: SEEDED_PERSON_ID,
        interestTiers: null,
      }),
    );
  });

  it('rechaza interestTiers sin tramo final null con 400', async () => {
    const accountId = await createAccount('Rec Tramos Inválidos');

    await request(app.getHttpServer())
      .post('/api/v1/recurring')
      .send({
        name: 'Interés inválido',
        type: 'interest',
        accountId,
        interestTiers: [
          { upTo: 1000, annualRate: 0.1 },
          { upTo: 5000, annualRate: 0.05 },
        ],
        frequency: 'monthly',
        startDate: '2026-01-01',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/recurring')
      .send({
        name: 'Interés sin tramos',
        type: 'interest',
        accountId,
        frequency: 'monthly',
        startDate: '2026-01-01',
      })
      .expect(400);
  });

  it('valida monto, fechas, alcance y referencias inexistentes', async () => {
    const accountId = await createAccount('Rec Validaciones');

    await request(app.getHttpServer())
      .post('/api/v1/recurring')
      .send({
        name: 'Sin monto',
        type: 'subscription',
        accountId,
        frequency: 'monthly',
        startDate: '2026-01-01',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/recurring')
      .send({
        name: 'Monto negativo',
        type: 'subscription',
        accountId,
        amount: -5,
        frequency: 'monthly',
        startDate: '2026-01-01',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/recurring')
      .send({
        name: 'Monto en interés',
        type: 'interest',
        accountId,
        amount: 100,
        interestTiers: [{ upTo: null, annualRate: 0.1 }],
        frequency: 'monthly',
        startDate: '2026-01-01',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/recurring')
      .send({
        name: 'Fechas invertidas',
        type: 'subscription',
        accountId,
        amount: 10,
        frequency: 'monthly',
        startDate: '2026-02-01',
        endDate: '2026-01-01',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/recurring')
      .send({
        name: 'Personal sin persona',
        type: 'subscription',
        accountId,
        amount: 10,
        frequency: 'monthly',
        startDate: '2026-01-01',
        scope: 'personal',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/recurring')
      .send({
        name: 'Cuenta inexistente',
        type: 'subscription',
        accountId: MISSING_ID,
        amount: 10,
        frequency: 'monthly',
        startDate: '2026-01-01',
      })
      .expect(404);

    await request(app.getHttpServer())
      .post('/api/v1/recurring')
      .send({
        name: 'Categoría inexistente',
        type: 'subscription',
        accountId,
        categoryId: MISSING_ID,
        amount: 10,
        frequency: 'monthly',
        startDate: '2026-01-01',
      })
      .expect(404);

    await request(app.getHttpServer())
      .post('/api/v1/recurring')
      .send({
        name: 'Persona inexistente',
        type: 'subscription',
        accountId,
        amount: 10,
        frequency: 'monthly',
        startDate: '2026-01-01',
        scope: 'personal',
        personId: MISSING_ID,
      })
      .expect(404);
  });

  it('rechaza tipo y frecuencia inválidos, y días fuera de rango', async () => {
    const accountId = await createAccount('Rec Enums');

    await request(app.getHttpServer())
      .post('/api/v1/recurring')
      .send({
        name: 'Tipo inválido',
        type: 'other',
        accountId,
        amount: 10,
        frequency: 'monthly',
        startDate: '2026-01-01',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/recurring')
      .send({
        name: 'Frecuencia inválida',
        type: 'subscription',
        accountId,
        amount: 10,
        frequency: 'daily',
        startDate: '2026-01-01',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/recurring')
      .send({
        name: 'Día del mes inválido',
        type: 'subscription',
        accountId,
        amount: 10,
        frequency: 'monthly',
        dayOfMonth: 32,
        startDate: '2026-01-01',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/recurring')
      .send({
        name: 'Día de la semana inválido',
        type: 'subscription',
        accountId,
        amount: 10,
        frequency: 'weekly',
        dayOfWeek: 7,
        startDate: '2026-01-01',
      })
      .expect(400);
  });

  it('rechaza crear una regla sobre una cuenta archivada', async () => {
    const accountId = await createAccount('Rec Cuenta Archivada');
    await request(app.getHttpServer()).delete(`/api/v1/accounts/${accountId}`).expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/recurring')
      .send({
        name: 'Cuenta archivada',
        type: 'subscription',
        accountId,
        amount: 10,
        frequency: 'monthly',
        startDate: '2026-01-01',
      })
      .expect(400);
  });

  it('responde 404 al editar o desactivar una regla inexistente', async () => {
    await request(app.getHttpServer())
      .put(`/api/v1/recurring/${MISSING_ID}`)
      .send({ amount: 10 })
      .expect(404);
    await request(app.getHttpServer()).delete(`/api/v1/recurring/${MISSING_ID}`).expect(404);
  });
});
