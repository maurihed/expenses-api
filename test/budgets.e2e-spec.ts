import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Budgets (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const YEAR = 2099;
  const MONTH = 7;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.budget.deleteMany({ where: { year: YEAR, month: MONTH } });
    await app.close();
  });

  it('crea (upsert) y devuelve el presupuesto del mes', async () => {
    const created = await request(app.getHttpServer())
      .put('/api/v1/budgets')
      .send({ year: YEAR, month: MONTH, amount: 8000, currency: 'MXN' })
      .expect(200);
    expect(created.body).toMatchObject({ year: YEAR, month: MONTH, amount: 8000 });

    const found = await request(app.getHttpServer())
      .get(`/api/v1/budgets?year=${YEAR}&month=${MONTH}`)
      .expect(200);
    expect(found.body).toMatchObject({ id: created.body.id, amount: 8000 });
  });

  it('actualiza el mismo mes sin duplicar (idempotente)', async () => {
    const first = await request(app.getHttpServer())
      .put('/api/v1/budgets')
      .send({ year: YEAR, month: MONTH, amount: 9000 })
      .expect(200);
    const second = await request(app.getHttpServer())
      .put('/api/v1/budgets')
      .send({ year: YEAR, month: MONTH, amount: 9500 })
      .expect(200);
    expect(second.body.id).toBe(first.body.id);
    expect(second.body.amount).toBe(9500);

    const count = await prisma.budget.count({ where: { year: YEAR, month: MONTH } });
    expect(count).toBe(1);
  });

  it('acepta los meses límite 1 y 12', async () => {
    await request(app.getHttpServer())
      .put('/api/v1/budgets')
      .send({ year: YEAR, month: 1, amount: 100 })
      .expect(200);
    await request(app.getHttpServer())
      .put('/api/v1/budgets')
      .send({ year: YEAR, month: 12, amount: 100 })
      .expect(200);
    await prisma.budget.deleteMany({ where: { year: YEAR, month: { in: [1, 12] } } });
  });

  it('valida year/month y monto', async () => {
    await request(app.getHttpServer()).get(`/api/v1/budgets?year=${YEAR}`).expect(400);
    await request(app.getHttpServer())
      .get(`/api/v1/budgets?year=${YEAR}&month=0`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`/api/v1/budgets?year=${YEAR}&month=13`)
      .expect(400);
    await request(app.getHttpServer())
      .put('/api/v1/budgets')
      .send({ year: YEAR, month: MONTH, amount: -5 })
      .expect(400);
    await request(app.getHttpServer())
      .put('/api/v1/budgets')
      .send({ year: YEAR, month: 13, amount: 100 })
      .expect(400);
  });

  it('elimina el presupuesto', async () => {
    const created = await request(app.getHttpServer())
      .put('/api/v1/budgets')
      .send({ year: YEAR, month: MONTH, amount: 1000 })
      .expect(200);
    await request(app.getHttpServer()).delete(`/api/v1/budgets/${created.body.id}`).expect(200);
    const found = await request(app.getHttpServer())
      .get(`/api/v1/budgets?year=${YEAR}&month=${MONTH}`)
      .expect(200);
    expect(found.body == null || Object.keys(found.body).length === 0).toBe(true);
  });
});
