import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const day = (date: Date) => date.toISOString().slice(0, 10);

describe('MSI installments (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const accountIds: string[] = [];
  const categoryIds: string[] = [];
  let categorySeq = 0;

  const uniqueCategory = (label: string) => `E2E MSI ${label} ${Date.now()}-${categorySeq++}`;

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

  const createAccount = async (
    name: string,
    balance = 0,
    extra: Record<string, unknown> = {},
  ) => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .send({ name, balance, ...extra })
      .expect(201);
    accountIds.push(res.body.id);
    return res.body.id as string;
  };

  const createCredit = (name: string, balance = 0) =>
    createAccount(name, balance, { type: 'CREDIT', creditLimit: 50000 });

  const createMsi = async (
    accountId: string,
    payload: Record<string, unknown> = {},
  ) => {
    const category = uniqueCategory('Compra');
    const res = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .send({
        type: 'expense',
        accountId,
        amount: 1000,
        description: 'Compra MSI',
        date: '2026-09-18',
        category,
        installments: 3,
        ...payload,
      })
      .expect(201);
    const cat = await prisma.category.findUnique({ where: { name: category } });
    if (cat) categoryIds.push(cat.id);
    return res.body.id as string;
  };

  const balanceOf = async (accountId: string) => {
    const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    return Number(account.balance);
  };

  it('registra el total, sube la deuda y genera 3 mensualidades en una compra CREDIT', async () => {
    const accountId = await createCredit('MSI Crédito');
    const txId = await createMsi(accountId);

    const tx = await prisma.transaction.findUniqueOrThrow({
      where: { id: txId },
      include: { installmentPlan: { include: { installments_: { orderBy: { number: 'asc' } } } } },
    });
    expect(tx.type).toBe('EXPENSE');
    expect(Number(tx.amount)).toBe(1000);
    expect(tx.installments).toBe(3);
    expect(await balanceOf(accountId)).toBe(1000);

    const plan = tx.installmentPlan;
    expect(plan).not.toBeNull();
    expect(Number(plan!.totalAmount)).toBe(1000);
    expect(plan!.installments).toBe(3);
    expect(day(plan!.startDate)).toBe('2026-09-18');

    const installments = plan!.installments_;
    expect(installments.map((i) => i.number)).toEqual([1, 2, 3]);
    expect(installments.map((i) => Number(i.amount))).toEqual([333.33, 333.33, 333.34]);
    expect(installments.map((i) => day(i.dueDate))).toEqual([
      '2026-09-18',
      '2026-10-18',
      '2026-11-18',
    ]);

    const month = await request(app.getHttpServer())
      .get('/api/v1/transactions?month=8&year=2026')
      .expect(200);
    const found = month.body.find((t: any) => t.id === txId);
    expect(found.installments).toBe(3);
    expect(found.amount).toBe(1000);
  });

  it('regenera el plan al cambiar installments y lo conserva en ediciones no relacionadas', async () => {
    const accountId = await createCredit('MSI Editar');
    const txId = await createMsi(accountId);

    await request(app.getHttpServer())
      .put(`/api/v1/transactions/${txId}`)
      .send({ amount: 1000, installments: 6, date: '2026-09-18' })
      .expect(200);

    const regenerated = await prisma.installmentPlan.findMany({
      where: { transactionId: txId },
      include: { installments_: true },
    });
    expect(regenerated).toHaveLength(1);
    expect(regenerated[0].installments).toBe(6);
    expect(regenerated[0].installments_).toHaveLength(6);

    await request(app.getHttpServer())
      .put(`/api/v1/transactions/${txId}`)
      .send({ description: 'editada' })
      .expect(200);

    const preserved = await prisma.installmentPlan.findMany({
      where: { transactionId: txId },
      include: { installments_: true },
    });
    expect(preserved).toHaveLength(1);
    expect(preserved[0].installments).toBe(6);
    expect(preserved[0].installments_).toHaveLength(6);
    const preservedTx = await prisma.transaction.findUniqueOrThrow({ where: { id: txId } });
    expect(preservedTx.installments).toBe(6);
    expect(preservedTx.description).toBe('editada');

    await request(app.getHttpServer())
      .put(`/api/v1/transactions/${txId}`)
      .send({ installments: null })
      .expect(200);

    const removed = await prisma.installmentPlan.findMany({ where: { transactionId: txId } });
    expect(removed).toHaveLength(0);
    const tx = await prisma.transaction.findUniqueOrThrow({ where: { id: txId } });
    expect(tx.installments).toBeNull();
  });

  it('regenera el plan cuando cambia el monto y no se envían installments', async () => {
    const accountId = await createCredit('MSI Monto');
    const txId = await createMsi(accountId);

    await request(app.getHttpServer())
      .put(`/api/v1/transactions/${txId}`)
      .send({ amount: 500 })
      .expect(200);

    const plan = await prisma.installmentPlan.findUniqueOrThrow({
      where: { transactionId: txId },
      include: { installments_: true },
    });
    expect(plan.installments).toBe(3);
    expect(plan.installments_).toHaveLength(3);
    expect(Number(plan.totalAmount)).toBe(500);
    expect(await balanceOf(accountId)).toBe(500);

    const tx = await prisma.transaction.findUniqueOrThrow({ where: { id: txId } });
    expect(tx.installments).toBe(3);
  });

  it('borra el plan y las mensualidades al eliminar el movimiento', async () => {
    const accountId = await createCredit('MSI Borrar');
    const txId = await createMsi(accountId);

    expect(await prisma.installmentPlan.count({ where: { transactionId: txId } })).toBe(1);

    await request(app.getHttpServer()).delete(`/api/v1/transactions/${txId}`).expect(200);

    expect(await prisma.transaction.findUnique({ where: { id: txId } })).toBeNull();
    expect(await prisma.installmentPlan.count({ where: { transactionId: txId } })).toBe(0);
    expect(await prisma.installment.count({ where: { plan: { transactionId: txId } } })).toBe(0);
    expect(await balanceOf(accountId)).toBe(0);
  });

  it('rechaza installments en un income con 400 y no crea el movimiento', async () => {
    const accountId = await createCredit('MSI Income');
    await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .send({
        type: 'income',
        accountId,
        amount: 1000,
        description: 'Income MSI',
        date: '2026-09-18',
        installments: 3,
      })
      .expect(400);
    expect(await prisma.transaction.count({ where: { accountId } })).toBe(0);
  });

  it('rechaza installments en una cuenta no CREDIT con 400 sin alterar el saldo', async () => {
    const accountId = await createAccount('MSI Debit', 1000, { type: 'DEBIT' });
    await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .send({
        type: 'expense',
        accountId,
        amount: 1000,
        description: 'Débito MSI',
        date: '2026-09-18',
        installments: 3,
      })
      .expect(400);
    expect(await balanceOf(accountId)).toBe(1000);
  });

  it('rechaza installments fuera del rango 2–48 con 400', async () => {
    const accountId = await createCredit('MSI Rango');
    for (const n of [1, 49]) {
      await request(app.getHttpServer())
        .post('/api/v1/transactions')
        .send({
          type: 'expense',
          accountId,
          amount: 1000,
          description: `Rango ${n}`,
          date: '2026-09-18',
          installments: n,
        })
        .expect(400);
    }
  });

  it('acepta los límites válidos 2 y 48', async () => {
    const accountId = await createCredit('MSI Límites');
    const two = await createMsi(accountId, { installments: 2 });
    const twoPlan = await prisma.installmentPlan.findUniqueOrThrow({
      where: { transactionId: two },
    });
    expect(twoPlan.installments).toBe(2);

    const fortyEight = await createMsi(accountId, { installments: 48 });
    const fortyEightPlan = await prisma.installmentPlan.findUniqueOrThrow({
      where: { transactionId: fortyEight },
      include: { installments_: true },
    });
    expect(fortyEightPlan.installments).toBe(48);
    expect(fortyEightPlan.installments_).toHaveLength(48);
  });

  it('rechaza installments en PUT sobre un movimiento no EXPENSE o cuenta no CREDIT', async () => {
    const category = uniqueCategory('Put');
    const debitId = await createAccount('MSI Put Debit', 1000, { type: 'DEBIT' });
    const debitTx = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .send({
        type: 'expense',
        accountId: debitId,
        amount: 100,
        description: 'Gasto débito',
        date: '2026-09-18',
        category,
      })
      .expect(201);
    const cat = await prisma.category.findUnique({ where: { name: category } });
    if (cat) categoryIds.push(cat.id);

    await request(app.getHttpServer())
      .put(`/api/v1/transactions/${debitTx.body.id}`)
      .send({ installments: 3 })
      .expect(400);

    const creditId = await createCredit('MSI Put Credit');
    const incomeTx = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .send({
        type: 'income',
        accountId: creditId,
        amount: 100,
        description: 'Ingreso crédito',
        date: '2026-09-18',
      })
      .expect(201);

    await request(app.getHttpServer())
      .put(`/api/v1/transactions/${incomeTx.body.id}`)
      .send({ installments: 3 })
      .expect(400);
  });

  it('ajusta el vencimiento al fin de mes cuando la compra es el día 31', async () => {
    const accountId = await createCredit('MSI Fin de Mes');
    const txId = await createMsi(accountId, { amount: 300, date: '2026-01-31', installments: 3 });

    const plan = await prisma.installmentPlan.findUniqueOrThrow({
      where: { transactionId: txId },
      include: { installments_: { orderBy: { number: 'asc' } } },
    });
    expect(plan.installments_.map((i) => day(i.dueDate))).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
    ]);
  });

  it('findByMonth devuelve installments null en un gasto normal', async () => {
    const accountId = await createAccount('MSI Normal', 1000);
    const category = uniqueCategory('Normal');
    const res = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .send({
        type: 'expense',
        accountId,
        amount: 100,
        description: 'Gasto normal',
        date: '2026-09-18',
        category,
      })
      .expect(201);
    const cat = await prisma.category.findUnique({ where: { name: category } });
    if (cat) categoryIds.push(cat.id);

    const month = await request(app.getHttpServer())
      .get('/api/v1/transactions?month=8&year=2026')
      .expect(200);
    const found = month.body.find((t: any) => t.id === res.body.id);
    expect(found.installments).toBeNull();
  });
});
