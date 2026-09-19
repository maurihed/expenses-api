import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Debts (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const debtIds: string[] = [];
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
    await prisma.debtPayment.deleteMany({ where: { debtId: { in: debtIds } } });
    await prisma.debt.deleteMany({ where: { id: { in: debtIds } } });
    if (accountIds.length) {
      const txs = await prisma.transaction.findMany({
        where: { accountId: { in: accountIds } },
        select: { id: true },
      });
      const txIds = txs.map((t) => t.id);
      if (txIds.length) {
        await prisma.debtPayment.deleteMany({ where: { transactionId: { in: txIds } } });
        await prisma.transaction.deleteMany({ where: { id: { in: txIds } } });
      }
      await prisma.account.deleteMany({ where: { id: { in: accountIds } } });
    }
    await app.close();
  });

  const createDebt = async (over: Record<string, unknown>) => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/debts')
      .send({
        type: 'receivable',
        counterparty: 'Amigo',
        amount: 1000,
        currency: 'MXN',
        date: '2026-03-01',
        ...over,
      })
      .expect(201);
    debtIds.push(res.body.id);
    return res.body;
  };

  const createAccount = async (balance: number) => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .send({ name: `Debt Cuenta ${Date.now()}`, type: 'DEBIT', balance })
      .expect(201);
    accountIds.push(res.body.id);
    return res.body.id as string;
  };

  it('crea una deuda por cobrar con pendiente igual al monto', async () => {
    const debt = await createDebt({});
    expect(debt).toMatchObject({
      type: 'receivable',
      counterparty: 'Amigo',
      amount: 1000,
      paid: 0,
      remaining: 1000,
      status: 'OPEN',
    });
  });

  it('los abonos reducen el pendiente y liquidan la deuda', async () => {
    const debt = await createDebt({ amount: 500 });

    const first = await request(app.getHttpServer())
      .post(`/api/v1/debts/${debt.id}/payments`)
      .send({ amount: 200, date: '2026-03-05' })
      .expect(201);
    expect(first.body).toMatchObject({ paid: 200, remaining: 300, status: 'OPEN' });

    const second = await request(app.getHttpServer())
      .post(`/api/v1/debts/${debt.id}/payments`)
      .send({ amount: 300, date: '2026-03-10' })
      .expect(201);
    expect(second.body).toMatchObject({ paid: 500, remaining: 0, status: 'SETTLED' });

    const payments = await request(app.getHttpServer())
      .get(`/api/v1/debts/${debt.id}/payments`)
      .expect(200);
    expect(payments.body).toHaveLength(2);
  });

  it('rechaza un abono mayor al pendiente con 400', async () => {
    const debt = await createDebt({ amount: 100 });
    await request(app.getHttpServer())
      .post(`/api/v1/debts/${debt.id}/payments`)
      .send({ amount: 150, date: '2026-03-05' })
      .expect(400);
  });

  it('un abono con cuenta ajusta el saldo y crea el movimiento; borrarlo lo revierte', async () => {
    const accountId = await createAccount(1000);
    const debt = await createDebt({ type: 'payable', amount: 400, counterparty: 'Banco' });

    await request(app.getHttpServer())
      .post(`/api/v1/debts/${debt.id}/payments`)
      .send({ amount: 400, date: '2026-03-06', accountId })
      .expect(201);

    const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(Number(account.balance)).toBe(600);
    const tx = await prisma.transaction.findFirstOrThrow({ where: { accountId } });
    expect(tx.type).toBe('EXPENSE');

    const payments = await request(app.getHttpServer())
      .get(`/api/v1/debts/${debt.id}/payments`)
      .expect(200);
    expect(payments.body).toHaveLength(1);

    await request(app.getHttpServer())
      .delete(`/api/v1/debts/${debt.id}/payments/${payments.body[0].id}`)
      .expect(200);

    const restored = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(Number(restored.balance)).toBe(1000);
    expect(await prisma.transaction.count({ where: { accountId } })).toBe(0);
  });

  it('edita una deuda y valida monto vs abonado y fecha límite', async () => {
    const debt = await createDebt({ amount: 1000 });
    await request(app.getHttpServer())
      .post(`/api/v1/debts/${debt.id}/payments`)
      .send({ amount: 400, date: '2026-03-05' })
      .expect(201);

    const updated = await request(app.getHttpServer())
      .put(`/api/v1/debts/${debt.id}`)
      .send({ counterparty: 'Editado', amount: 900 })
      .expect(200);
    expect(updated.body).toMatchObject({ counterparty: 'Editado', amount: 900, remaining: 500 });

    await request(app.getHttpServer())
      .put(`/api/v1/debts/${debt.id}`)
      .send({ amount: 100 })
      .expect(400);

    await request(app.getHttpServer())
      .put(`/api/v1/debts/${debt.id}`)
      .send({ date: '2026-06-01', dueDate: '2026-03-01' })
      .expect(400);
  });

  it('rechaza abonar a una deuda archivada con 400', async () => {
    const debt = await createDebt({ amount: 100 });
    await request(app.getHttpServer()).delete(`/api/v1/debts/${debt.id}`).expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/debts/${debt.id}/payments`)
      .send({ amount: 10, date: '2026-03-05' })
      .expect(400);
  });

  it('rechaza un abono con cuenta de moneda distinta con 400', async () => {
    const accountId = await createAccount(1000); // MXN
    const debt = await createDebt({ type: 'payable', amount: 100, currency: 'USD' });
    await request(app.getHttpServer())
      .post(`/api/v1/debts/${debt.id}/payments`)
      .send({ amount: 50, date: '2026-03-05', accountId })
      .expect(400);
  });

  it('no permite editar ni borrar el movimiento de un abono desde /transactions', async () => {
    const accountId = await createAccount(1000);
    const debt = await createDebt({ type: 'payable', amount: 300 });

    await request(app.getHttpServer())
      .post(`/api/v1/debts/${debt.id}/payments`)
      .send({ amount: 300, date: '2026-03-06', accountId })
      .expect(201);

    const tx = await prisma.transaction.findFirstOrThrow({ where: { accountId } });

    await request(app.getHttpServer())
      .put(`/api/v1/transactions/${tx.id}`)
      .send({ description: 'intento' })
      .expect(400);
    await request(app.getHttpServer())
      .delete(`/api/v1/transactions/${tx.id}`)
      .expect(400);
  });

  it('archiva una deuda y la excluye de la lista por defecto', async () => {
    const debt = await createDebt({ counterparty: 'Archivar' });
    await request(app.getHttpServer()).delete(`/api/v1/debts/${debt.id}`).expect(200);

    const list = await request(app.getHttpServer()).get('/api/v1/debts').expect(200);
    expect(list.body.some((d: { id: string }) => d.id === debt.id)).toBe(false);

    const all = await request(app.getHttpServer())
      .get('/api/v1/debts?includeArchived=true')
      .expect(200);
    expect(all.body.some((d: { id: string }) => d.id === debt.id)).toBe(true);
  });
});
