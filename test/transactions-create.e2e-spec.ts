import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Transactions create (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const accountIds: string[] = [];
  const categoryIds: string[] = [];

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

  it('crea un movimiento expense y ajusta el balance de la cuenta en el servidor', async () => {
    const accountId = await createAccount('Cuenta Movimiento', 1000);

    const res = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .send({
        type: 'expense',
        accountId,
        amount: 250,
        description: 'Despensa semanal',
        date: '2026-09-18',
        category: 'Despensa',
      })
      .expect(201);

    expect(res.body).toEqual({ id: expect.any(String) });

    const get = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${accountId}`)
      .expect(200);
    expect(get.body.balance).toBe(750);

    const stored = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(Number(stored.balance)).toBe(750);

    const tx = await prisma.transaction.findUniqueOrThrow({
      where: { id: res.body.id },
      include: { category: true },
    });
    expect(tx.type).toBe('EXPENSE');
    expect(Number(tx.amount)).toBe(250);
    expect(tx.accountId).toBe(accountId);
    expect(tx.category?.name).toBe('Despensa');
    categoryIds.push(tx.categoryId as string);
    expect(tx.date.toISOString()).toBe('2026-09-18T00:00:00.000Z');
  });

  it('un income en efectivo incrementa el balance', async () => {
    const accountId = await createAccount('Cuenta Ingreso', 0);

    await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .send({
        type: 'income',
        accountId,
        amount: 500,
        description: 'Sueldo',
        date: '2026-09-18',
        category: 'Ingresos',
      })
      .expect(201);

    const get = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${accountId}`)
      .expect(200);
    expect(get.body.balance).toBe(500);

    const cat = await prisma.category.findUnique({ where: { name: 'Ingresos' } });
    if (cat) categoryIds.push(cat.id);
  });

  it('reutiliza la categoría existente en lugar de duplicarla', async () => {
    const accountId = await createAccount('Cuenta Categoria', 1000);

    const first = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .send({
        type: 'expense',
        accountId,
        amount: 100,
        description: 'Compra 1',
        date: '2026-09-18',
        category: 'Despensa',
      })
      .expect(201);
    const second = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .send({
        type: 'expense',
        accountId,
        amount: 50,
        description: 'Compra 2',
        date: '2026-09-18',
        category: 'Despensa',
      })
      .expect(201);

    const [a, b] = await Promise.all([
      prisma.transaction.findUniqueOrThrow({ where: { id: first.body.id } }),
      prisma.transaction.findUniqueOrThrow({ where: { id: second.body.id } }),
    ]);
    expect(a.categoryId).toBe(b.categoryId);

    const count = await prisma.category.count({ where: { name: 'Despensa' } });
    expect(count).toBe(1);

    const get = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${accountId}`)
      .expect(200);
    expect(get.body.balance).toBe(850);

    if (a.categoryId) categoryIds.push(a.categoryId);
  });

  it('responde 404 si la cuenta no existe', () =>
    request(app.getHttpServer())
      .post('/api/v1/transactions')
      .send({
        type: 'expense',
        accountId: '00000000-0000-4000-8000-000000000000',
        amount: 10,
        description: 'Fantasma',
        date: '2026-09-18',
        category: 'Despensa',
      })
      .expect(404));

  it('responde 404 si la cuenta está archivada', async () => {
    const accountId = await createAccount('Cuenta Archivada', 100);
    await prisma.account.update({ where: { id: accountId }, data: { archived: true } });

    await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .send({
        type: 'expense',
        accountId,
        amount: 10,
        description: 'Archivada',
        date: '2026-09-18',
        category: 'Despensa',
      })
      .expect(404);

    const stored = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(Number(stored.balance)).toBe(100);
  });

  it('rechaza un type inválido con 400', async () => {
    const accountId = await createAccount('Cuenta Tipo Invalido', 100);

    await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .send({
        type: 'transfer',
        accountId,
        amount: 10,
        description: 'Transferencia',
        date: '2026-09-18',
        category: 'Despensa',
      })
      .expect(400);
  });

  it('rechaza un amount negativo con 400', () =>
    request(app.getHttpServer())
      .post('/api/v1/transactions')
      .send({
        type: 'expense',
        accountId: '00000000-0000-4000-8000-000000000000',
        amount: -250,
        description: 'Negativo',
        date: '2026-09-18',
        category: 'Despensa',
      })
      .expect(400));

  it('rechaza una fecha con día inexistente (2026-02-31) con 400', () =>
    request(app.getHttpServer())
      .post('/api/v1/transactions')
      .send({
        type: 'expense',
        accountId: '00000000-0000-4000-8000-000000000000',
        amount: 10,
        description: 'Día inválido',
        date: '2026-02-31',
        category: 'Despensa',
      })
      .expect(400));

  it('rechaza una fecha con mes inexistente (2026-13-01) con 400', () =>
    request(app.getHttpServer())
      .post('/api/v1/transactions')
      .send({
        type: 'expense',
        accountId: '00000000-0000-4000-8000-000000000000',
        amount: 10,
        description: 'Mes inválido',
        date: '2026-13-01',
        category: 'Despensa',
      })
      .expect(400));
});
