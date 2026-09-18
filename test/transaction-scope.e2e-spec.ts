import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const MAURICIO = '11111111-1111-4111-8111-111111111111';
const MISSING_PERSON = '00000000-0000-4000-8000-000000000000';

describe('Transaction scope (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const accountIds: string[] = [];
  const categoryIds: string[] = [];
  const transactionIds: string[] = [];
  let categorySeq = 0;

  const uniqueCategory = (label: string) => `E2E Scope ${label} ${Date.now()}-${categorySeq++}`;

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
      await prisma.transaction.deleteMany({ where: { accountId: { in: accountIds } } });
      await prisma.account.deleteMany({ where: { id: { in: accountIds } } });
    }
    if (categoryIds.length) {
      await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    }
    await app.close();
  });

  const createAccount = async (name: string, balance: number) => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .send({ name, balance })
      .expect(201);
    accountIds.push(res.body.id);
    return res.body.id as string;
  };

  const trackCategory = async (name: string) => {
    const cat = await prisma.category.findUnique({ where: { name } });
    if (cat) categoryIds.push(cat.id);
  };

  const summary = async (personId: string) => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/persons/${personId}/summary`)
      .expect(200);
    return res.body as { spent: number; balance: number };
  };

  it('crea un gasto personal y suma su monto al spent de la persona', async () => {
    const accountId = await createAccount('Scope Personal', 1000);
    const category = uniqueCategory('Personal');
    const before = await summary(MAURICIO);

    const res = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .send({
        type: 'expense',
        accountId,
        amount: 250,
        description: 'Gasto personal',
        date: '2032-05-10',
        category,
        scope: 'personal',
        personId: MAURICIO,
      })
      .expect(201);
    transactionIds.push(res.body.id);
    await trackCategory(category);

    const after = await summary(MAURICIO);
    expect(after.spent - before.spent).toBe(250);

    const stored = await prisma.transaction.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(stored.scope).toBe('PERSONAL');
    expect(stored.personId).toBe(MAURICIO);
  });

  it('rechaza un gasto personal sin personId con 400', async () => {
    const accountId = await createAccount('Scope Sin Persona', 1000);

    await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .send({
        type: 'expense',
        accountId,
        amount: 10,
        description: 'Sin persona',
        date: '2032-05-11',
        category: uniqueCategory('SinPersona'),
        scope: 'personal',
      })
      .expect(400);
  });

  it('rechaza un gasto personal con personId inexistente con 404', async () => {
    const accountId = await createAccount('Scope Persona Invalida', 1000);

    await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .send({
        type: 'expense',
        accountId,
        amount: 10,
        description: 'Persona fantasma',
        date: '2032-05-11',
        scope: 'personal',
        personId: MISSING_PERSON,
      })
      .expect(404);
  });

  it('sin scope guarda JOINT con personId nulo', async () => {
    const accountId = await createAccount('Scope Default', 1000);
    const category = uniqueCategory('Default');

    const res = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .send({
        type: 'expense',
        accountId,
        amount: 50,
        description: 'Joint por defecto',
        date: '2032-05-12',
        category,
      })
      .expect(201);
    transactionIds.push(res.body.id);
    await trackCategory(category);

    const stored = await prisma.transaction.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(stored.scope).toBe('JOINT');
    expect(stored.personId).toBeNull();
  });

  it('findByMonth incluye scope y personId', async () => {
    const accountId = await createAccount('Scope Lista', 1000);
    const personalCategory = uniqueCategory('Lista Personal');
    const jointCategory = uniqueCategory('Lista Joint');

    const personal = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .send({
        type: 'expense',
        accountId,
        amount: 100,
        description: 'Personal en lista',
        date: '2032-06-10',
        category: personalCategory,
        scope: 'personal',
        personId: MAURICIO,
      })
      .expect(201);
    transactionIds.push(personal.body.id);

    const joint = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .send({
        type: 'expense',
        accountId,
        amount: 20,
        description: 'Joint en lista',
        date: '2032-06-11',
        category: jointCategory,
      })
      .expect(201);
    transactionIds.push(joint.body.id);
    await trackCategory(personalCategory);
    await trackCategory(jointCategory);

    const res = await request(app.getHttpServer())
      .get('/api/v1/transactions?month=5&year=2032')
      .expect(200);
    const mine = res.body.filter((t: any) => t.accountId === accountId);
    expect(mine).toHaveLength(2);

    const personalRow = mine.find((t: any) => t.id === personal.body.id);
    expect(Object.keys(personalRow).sort()).toEqual(
      ['accountId', 'amount', 'category', 'date', 'description', 'id', 'personId', 'scope', 'type'].sort(),
    );
    expect(personalRow.scope).toBe('personal');
    expect(personalRow.personId).toBe(MAURICIO);

    const jointRow = mine.find((t: any) => t.id === joint.body.id);
    expect(jointRow.scope).toBe('joint');
    expect(jointRow.personId).toBeNull();
  });

  it('update cambia a personal, preserva al omitir y limpia personId al volver a joint', async () => {
    const accountId = await createAccount('Scope Update', 1000);
    const category = uniqueCategory('Update');

    const created = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .send({
        type: 'expense',
        accountId,
        amount: 100,
        description: 'Joint inicial',
        date: '2032-07-10',
        category,
      })
      .expect(201);
    transactionIds.push(created.body.id);
    await trackCategory(category);

    const toPersonal = await request(app.getHttpServer())
      .put(`/api/v1/transactions/${created.body.id}`)
      .send({ scope: 'personal', personId: MAURICIO })
      .expect(200);
    expect(toPersonal.body.scope).toBe('personal');
    expect(toPersonal.body.personId).toBe(MAURICIO);

    const preserved = await request(app.getHttpServer())
      .put(`/api/v1/transactions/${created.body.id}`)
      .send({ description: 'Editado sin tocar scope' })
      .expect(200);
    expect(preserved.body.scope).toBe('personal');
    expect(preserved.body.personId).toBe(MAURICIO);

    const toJoint = await request(app.getHttpServer())
      .put(`/api/v1/transactions/${created.body.id}`)
      .send({ scope: 'joint' })
      .expect(200);
    expect(toJoint.body.scope).toBe('joint');
    expect(toJoint.body.personId).toBeNull();

    const stored = await prisma.transaction.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(stored.scope).toBe('JOINT');
    expect(stored.personId).toBeNull();
  });

  it('rechaza convertir a personal sin personId con 400', async () => {
    const accountId = await createAccount('Scope Update Invalido', 1000);

    const created = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .send({
        type: 'expense',
        accountId,
        amount: 30,
        description: 'Joint a personal invalido',
        date: '2032-07-11',
      })
      .expect(201);
    transactionIds.push(created.body.id);

    await request(app.getHttpServer())
      .put(`/api/v1/transactions/${created.body.id}`)
      .send({ scope: 'personal' })
      .expect(400);
  });
});
