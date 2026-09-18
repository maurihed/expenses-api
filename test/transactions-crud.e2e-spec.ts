import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Transactions CRUD (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const accountIds: string[] = [];
  const categoryIds: string[] = [];
  let categorySeq = 0;

  const uniqueCategory = (label: string) =>
    `E2E ${label} ${Date.now()}-${categorySeq++}`;

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

  const createTx = async (payload: Record<string, unknown>) => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .send(payload)
      .expect(201);
    if (payload.category) {
      const cat = await prisma.category.findUnique({ where: { name: payload.category as string } });
      if (cat) categoryIds.push(cat.id);
    }
    return res.body.id as string;
  };

  const getBalance = async (accountId: string) => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${accountId}`)
      .expect(200);
    return res.body.balance as number;
  };

  it('lista por mes 0-indexado, con category como nombre y type en minúsculas', async () => {
    const accountId = await createAccount('Crud Lista Cuenta', 1000);
    const marchCategory = uniqueCategory('Crud Mar');
    const aprilCategory = uniqueCategory('Crud Abr');

    await createTx({
      type: 'expense',
      accountId,
      amount: 250,
      description: 'Marzo',
      date: '2031-03-15',
      category: marchCategory,
    });
    await createTx({
      type: 'expense',
      accountId,
      amount: 100,
      description: 'Abril',
      date: '2031-04-05',
      category: aprilCategory,
    });
    await createTx({
      type: 'income',
      accountId,
      amount: 75,
      description: 'Sin categoría',
      date: '2031-03-20',
    });

    const march = await request(app.getHttpServer())
      .get('/api/v1/transactions?month=2&year=2031')
      .expect(200);
    const mine = march.body.filter((t: any) => t.accountId === accountId);
    expect(mine).toHaveLength(2);

    const exp = mine.find((t: any) => t.type === 'expense');
    expect(Object.keys(exp).sort()).toEqual(
      ['accountId', 'amount', 'category', 'date', 'description', 'id', 'personId', 'scope', 'type'].sort(),
    );
    expect(exp).toEqual(
      expect.objectContaining({
        accountId,
        amount: 250,
        category: marchCategory,
        date: '2031-03-15',
        description: 'Marzo',
        type: 'expense',
      }),
    );
    expect(typeof exp.amount).toBe('number');

    const noCat = mine.find((t: any) => t.type === 'income');
    expect(noCat.category).toBe('');

    const april = await request(app.getHttpServer())
      .get('/api/v1/transactions?month=3&year=2031')
      .expect(200);
    const mineApril = april.body.filter((t: any) => t.accountId === accountId);
    expect(mineApril).toHaveLength(1);
    expect(mineApril[0]).toEqual(
      expect.objectContaining({ amount: 100, date: '2031-04-05', category: aprilCategory }),
    );
  });

  it('edita el importe 250→100 revirtiendo el efecto original (saldo 900)', async () => {
    const accountId = await createAccount('Crud Editar Cuenta', 1000);
    const category = uniqueCategory('Crud Editar');
    const id = await createTx({
      type: 'expense',
      accountId,
      amount: 250,
      description: 'Editar',
      date: '2026-09-18',
      category,
    });

    expect(await getBalance(accountId)).toBe(750);

    const res = await request(app.getHttpServer())
      .put(`/api/v1/transactions/${id}`)
      .send({
        type: 'expense',
        accountId,
        amount: 100,
        description: 'Editar',
        date: '2026-09-18',
        category,
      })
      .expect(200);
    expect(res.body.amount).toBe(100);

    expect(await getBalance(accountId)).toBe(900);

    const stored = await prisma.transaction.findUniqueOrThrow({ where: { id } });
    expect(Number(stored.amount)).toBe(100);

    const cat = await prisma.category.findUnique({ where: { name: category } });
    if (cat) categoryIds.push(cat.id);
  });

  it('borra el movimiento restaurando el saldo a 1000', async () => {
    const accountId = await createAccount('Crud Borrar Cuenta', 1000);
    const category = uniqueCategory('Crud Borrar');
    const id = await createTx({
      type: 'expense',
      accountId,
      amount: 250,
      description: 'Borrar',
      date: '2026-09-18',
      category,
    });

    expect(await getBalance(accountId)).toBe(750);

    await request(app.getHttpServer()).delete(`/api/v1/transactions/${id}`).expect(200);

    expect(await getBalance(accountId)).toBe(1000);
    expect(await prisma.transaction.findUnique({ where: { id } })).toBeNull();

    const cat = await prisma.category.findUnique({ where: { name: category } });
    if (cat) categoryIds.push(cat.id);
  });

  it('al cambiar de cuenta revierte en la original y aplica en la nueva', async () => {
    const from = await createAccount('Crud Mover Origen', 1000);
    const to = await createAccount('Crud Mover Destino', 500);
    const category = uniqueCategory('Crud Mover');
    const id = await createTx({
      type: 'expense',
      accountId: from,
      amount: 200,
      description: 'Mover',
      date: '2026-09-18',
      category,
    });

    expect(await getBalance(from)).toBe(800);
    expect(await getBalance(to)).toBe(500);

    await request(app.getHttpServer())
      .put(`/api/v1/transactions/${id}`)
      .send({
        type: 'expense',
        accountId: to,
        amount: 200,
        description: 'Mover',
        date: '2026-09-18',
        category,
      })
      .expect(200);

    expect(await getBalance(from)).toBe(1000);
    expect(await getBalance(to)).toBe(300);

    const cat = await prisma.category.findUnique({ where: { name: category } });
    if (cat) categoryIds.push(cat.id);
  });

  it('responde 404 al editar o borrar un movimiento inexistente', async () => {
    const missing = '00000000-0000-4000-8000-000000000000';
    await request(app.getHttpServer())
      .put(`/api/v1/transactions/${missing}`)
      .send({ amount: 10 })
      .expect(404);
    await request(app.getHttpServer()).delete(`/api/v1/transactions/${missing}`).expect(404);
  });

  it('responde 404 al editar hacia una cuenta inexistente sin alterar el saldo', async () => {
    const accountId = await createAccount('Crud Cuenta Invalida', 1000);
    const id = await createTx({
      type: 'expense',
      accountId,
      amount: 250,
      description: 'Destino inválido',
      date: '2026-09-18',
    });

    await request(app.getHttpServer())
      .put(`/api/v1/transactions/${id}`)
      .send({ accountId: '00000000-0000-4000-8000-000000000000' })
      .expect(404);

    expect(await getBalance(accountId)).toBe(750);
  });

  it('responde 400 si month está fuera de rango (13)', () =>
    request(app.getHttpServer())
      .get('/api/v1/transactions?month=13&year=2026')
      .expect(400));

  it('responde 400 si month no es un número (abc)', () =>
    request(app.getHttpServer())
      .get('/api/v1/transactions?month=abc&year=2026')
      .expect(400));

  it('acepta month=0 (enero) con 200', () =>
    request(app.getHttpServer())
      .get('/api/v1/transactions?month=0&year=2026')
      .expect(200));

  it('responde 400 (no 500) si month viene duplicado y el último valor es inválido', () =>
    request(app.getHttpServer())
      .get('/api/v1/transactions?month=0&month=13&year=2026')
      .expect(400));

  it('acepta month duplicado válido tomando el último valor', () =>
    request(app.getHttpServer())
      .get('/api/v1/transactions?month=13&month=0&year=2026')
      .expect(200));

  it('responde 400 si year está fuera de rango o no es numérico', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/transactions?month=0&year=1969')
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/transactions?month=0&year=2101')
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/transactions?month=0&year=abc')
      .expect(400);
  });
});
