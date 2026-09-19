import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const BASE = `E2E Categoria ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const MISSING = '00000000-0000-4000-8000-000000000000';

describe('Categories (e2e)', () => {
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
      await prisma.category.deleteMany({ where: { id: { in: createdIds } } });
    }
    await app.close();
  });

  const createCategory = async (body: Record<string, unknown>) => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .send(body)
      .expect(201);
    createdIds.push(res.body.id);
    return res;
  };

  it('crea una categoría con { id, name, icon, color, archived }', async () => {
    const res = await createCategory({ name: BASE, icon: 'PawPrint', color: '#F8359B' });

    expect(res.body).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: BASE,
        icon: 'PawPrint',
        color: '#F8359B',
        archived: false,
      }),
    );

    const list = await request(app.getHttpServer()).get('/api/v1/categories').expect(200);
    expect(list.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: res.body.id, name: BASE })]),
    );
  });

  it('actualiza nombre e ícono y archiva la categoría', async () => {
    const created = await createCategory({ name: `${BASE} A`, icon: 'Tag', color: '#111111' });

    const updated = await request(app.getHttpServer())
      .put(`/api/v1/categories/${created.body.id}`)
      .send({ name: `${BASE} A Renombrada`, icon: 'Tag2' })
      .expect(200);
    expect(updated.body).toEqual(
      expect.objectContaining({
        id: created.body.id,
        name: `${BASE} A Renombrada`,
        icon: 'Tag2',
        color: '#111111',
        archived: false,
      }),
    );

    const archived = await request(app.getHttpServer())
      .delete(`/api/v1/categories/${created.body.id}`)
      .expect(200);
    expect(archived.body.archived).toBe(true);

    const stored = await prisma.category.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(stored.archived).toBe(true);

    const activeList = await request(app.getHttpServer()).get('/api/v1/categories').expect(200);
    expect(activeList.body.find((c: any) => c.id === created.body.id)).toBeUndefined();

    const allList = await request(app.getHttpServer())
      .get('/api/v1/categories?includeArchived=true')
      .expect(200);
    expect(allList.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: created.body.id, archived: true }),
      ]),
    );
  });

  it('archivar es idempotente', async () => {
    const created = await createCategory({ name: `${BASE} Idempotente` });

    await request(app.getHttpServer())
      .delete(`/api/v1/categories/${created.body.id}`)
      .expect(200);
    const second = await request(app.getHttpServer())
      .delete(`/api/v1/categories/${created.body.id}`)
      .expect(200);
    expect(second.body.archived).toBe(true);
  });

  it('ordena el listado por nombre ascendente', async () => {
    await createCategory({ name: `${BASE} Zeta` });
    await createCategory({ name: `${BASE} Alfa` });

    const res = await request(app.getHttpServer()).get('/api/v1/categories').expect(200);
    const names: string[] = res.body.map((c: any) => c.name);
    expect(names.indexOf(`${BASE} Alfa`)).toBeLessThan(names.indexOf(`${BASE} Zeta`));
  });

  it('responde 409 al crear una categoría con nombre duplicado (no 500)', async () => {
    await createCategory({ name: `${BASE} Duplicada` });
    await request(app.getHttpServer())
      .post('/api/v1/categories')
      .send({ name: `${BASE} Duplicada` })
      .expect(409);
  });

  it('rechaza nombre ausente, vacío o null al crear con 400', async () => {
    await request(app.getHttpServer()).post('/api/v1/categories').send({}).expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/categories')
      .send({ name: '   ' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/categories')
      .send({ name: null })
      .expect(400);
  });

  it('rechaza null e ícono no-string en un update con 400', async () => {
    const created = await createCategory({ name: `${BASE} Null Update` });

    await request(app.getHttpServer())
      .put(`/api/v1/categories/${created.body.id}`)
      .send({ name: null })
      .expect(400);
    await request(app.getHttpServer())
      .put(`/api/v1/categories/${created.body.id}`)
      .send({ icon: null })
      .expect(400);
    await request(app.getHttpServer())
      .put(`/api/v1/categories/${created.body.id}`)
      .send({ color: 123 })
      .expect(400);
  });

  it('responde 404 al actualizar o archivar una categoría inexistente', async () => {
    await request(app.getHttpServer())
      .put(`/api/v1/categories/${MISSING}`)
      .send({ name: `${BASE} Fantasma` })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/v1/categories/${MISSING}`)
      .expect(404);
  });
});
