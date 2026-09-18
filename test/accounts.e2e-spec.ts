import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Accounts (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (createdIds.length) {
      await prisma.account.deleteMany({ where: { id: { in: createdIds } } });
    }
    await app.close();
  });

  it('crea una cuenta con balance 1500 y responde { id, name, balance }', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .send({ name: 'Efectivo E2E', balance: 1500 })
      .expect(201);

    createdIds.push(res.body.id);
    expect(res.body).toEqual(
      expect.objectContaining({ id: expect.any(String), name: 'Efectivo E2E', balance: 1500 }),
    );
    expect(typeof res.body.balance).toBe('number');
  });

  it('lista las cuentas incluyendo la creada', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .send({ name: 'Cuenta Listado', balance: 200 })
      .expect(201);
    createdIds.push(created.body.id);

    const res = await request(app.getHttpServer()).get('/api/v1/accounts').expect(200);
    expect(res.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: created.body.id, name: 'Cuenta Listado', balance: 200 }),
      ]),
    );
  });

  it('obtiene una cuenta por id', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .send({ name: 'Cuenta Detalle', balance: 42.5 })
      .expect(201);
    createdIds.push(created.body.id);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${created.body.id}`)
      .expect(200);
    expect(res.body).toEqual(
      expect.objectContaining({ id: created.body.id, name: 'Cuenta Detalle', balance: 42.5 }),
    );
  });

  it('actualiza el nombre sin tocar el balance', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .send({ name: 'Cuenta Renombrar', balance: 1500 })
      .expect(201);
    createdIds.push(created.body.id);

    const res = await request(app.getHttpServer())
      .put(`/api/v1/accounts/${created.body.id}`)
      .send({ name: 'Cuenta Renombrada' })
      .expect(200);
    expect(res.body).toEqual(
      expect.objectContaining({ id: created.body.id, name: 'Cuenta Renombrada', balance: 1500 }),
    );
  });

  it('actualiza el balance manteniendo openingBalance consistente', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .send({ name: 'Cuenta Saldo', balance: 500 })
      .expect(201);
    createdIds.push(created.body.id);

    const res = await request(app.getHttpServer())
      .put(`/api/v1/accounts/${created.body.id}`)
      .send({ balance: 800 })
      .expect(200);
    expect(res.body).toEqual(
      expect.objectContaining({ id: created.body.id, name: 'Cuenta Saldo', balance: 800 }),
    );

    const stored = await prisma.account.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(Number(stored.openingBalance)).toBe(800);
  });

  it('responde 404 al pedir una cuenta inexistente', () =>
    request(app.getHttpServer())
      .get('/api/v1/accounts/00000000-0000-4000-8000-000000000000')
      .expect(404));
});
