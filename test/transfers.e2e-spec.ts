import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Transfers (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const accountIds: string[] = [];
  let seq = 0;

  const uniqueName = (label: string) => `E2E ${label} ${Date.now()}-${seq++}`;
  const date = '2032-05-10';

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
    await app.close();
  });

  const createAccount = async (payload: Record<string, unknown>) => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .send(payload)
      .expect(201);
    accountIds.push(res.body.id);
    return res.body.id as string;
  };

  const getBalance = async (accountId: string) => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${accountId}`)
      .expect(200);
    return res.body.balance as number;
  };

  const addDebt = async (accountId: string, amount: number) => {
    await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .send({
        type: 'expense',
        accountId,
        amount,
        description: 'Cargo tarjeta',
        date: '2032-05-01',
      })
      .expect(201);
    expect(await getBalance(accountId)).toBe(amount);
  };

  it('transfiere de débito a crédito reduciendo la deuda y devuelve { id }', async () => {
    const debit = await createAccount({ name: uniqueName('Debito'), type: 'DEBIT', balance: 5000 });
    const credit = await createAccount({
      name: uniqueName('Credito'),
      type: 'CREDIT',
      creditLimit: 10000,
      balance: 0,
    });
    await addDebt(credit, 2000);

    const res = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .send({
        type: 'transfer',
        accountId: debit,
        toAccountId: credit,
        amount: 1500,
        description: 'Pago de tarjeta',
        date,
      })
      .expect(201);

    expect(res.body).toEqual({ id: expect.any(String) });

    expect(await getBalance(debit)).toBe(3500);
    expect(await getBalance(credit)).toBe(500);

    const stored = await prisma.transaction.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(stored.type).toBe('TRANSFER');
    expect(stored.accountId).toBe(debit);
    expect(stored.toAccountId).toBe(credit);
    expect(Number(stored.amount)).toBe(1500);
    expect(stored.categoryId).toBeNull();

    const list = await request(app.getHttpServer())
      .get('/api/v1/transactions?month=4&year=2032')
      .expect(200);
    const listed = list.body.find((t: any) => t.id === res.body.id);
    expect(listed).toEqual(
      expect.objectContaining({
        accountId: debit,
        toAccountId: credit,
        amount: 1500,
        category: '',
        type: 'transfer',
      }),
    );
  });

  it('revierte ambos lados al editar el monto y al borrar la transferencia', async () => {
    const debit = await createAccount({ name: uniqueName('Debito'), type: 'DEBIT', balance: 5000 });
    const credit = await createAccount({
      name: uniqueName('Credito'),
      type: 'CREDIT',
      creditLimit: 10000,
      balance: 0,
    });
    await addDebt(credit, 2000);

    const created = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .send({ type: 'transfer', accountId: debit, toAccountId: credit, amount: 1500, date })
      .expect(201);

    expect(await getBalance(debit)).toBe(3500);
    expect(await getBalance(credit)).toBe(500);

    await request(app.getHttpServer())
      .put(`/api/v1/transactions/${created.body.id}`)
      .send({ amount: 500 })
      .expect(200);

    expect(await getBalance(debit)).toBe(4500);
    expect(await getBalance(credit)).toBe(1500);

    await request(app.getHttpServer())
      .delete(`/api/v1/transactions/${created.body.id}`)
      .expect(200);

    expect(await getBalance(debit)).toBe(5000);
    expect(await getBalance(credit)).toBe(2000);
    expect(await prisma.transaction.findUnique({ where: { id: created.body.id } })).toBeNull();
  });

  it('revierte en el destino original y aplica en el nuevo al cambiarlo', async () => {
    const debit = await createAccount({ name: uniqueName('Debito'), type: 'DEBIT', balance: 5000 });
    const first = await createAccount({
      name: uniqueName('Credito A'),
      type: 'CREDIT',
      creditLimit: 10000,
      balance: 0,
    });
    const second = await createAccount({
      name: uniqueName('Credito B'),
      type: 'CREDIT',
      creditLimit: 10000,
      balance: 0,
    });
    await addDebt(first, 2000);
    await addDebt(second, 3000);

    const created = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .send({ type: 'transfer', accountId: debit, toAccountId: first, amount: 1500, date })
      .expect(201);

    expect(await getBalance(debit)).toBe(3500);
    expect(await getBalance(first)).toBe(500);
    expect(await getBalance(second)).toBe(3000);

    await request(app.getHttpServer())
      .put(`/api/v1/transactions/${created.body.id}`)
      .send({ toAccountId: second })
      .expect(200);

    expect(await getBalance(debit)).toBe(3500);
    expect(await getBalance(first)).toBe(2000);
    expect(await getBalance(second)).toBe(1500);
  });

  it('rechaza con 400 si falta toAccountId, es igual a accountId o no existe', async () => {
    const debit = await createAccount({ name: uniqueName('Debito'), type: 'DEBIT', balance: 5000 });

    await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .send({ type: 'transfer', accountId: debit, amount: 100, date })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .send({ type: 'transfer', accountId: debit, toAccountId: debit, amount: 100, date })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .send({
        type: 'transfer',
        accountId: debit,
        toAccountId: '00000000-0000-4000-8000-000000000000',
        amount: 100,
        date,
      })
      .expect(400);

    expect(await getBalance(debit)).toBe(5000);
  });
});
