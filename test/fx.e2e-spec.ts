import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Fx (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    // A fresh cached rate so the request never hits the network.
    await prisma.exchangeRate.upsert({
      where: { base_quote: { base: 'USD', quote: 'MXN' } },
      update: { rate: 17.42, source: 'e2e', fetchedAt: new Date() },
      create: { base: 'USD', quote: 'MXN', rate: 17.42, source: 'e2e' },
    });
  });

  afterAll(async () => {
    await prisma.exchangeRate.deleteMany({ where: { base: 'USD', quote: 'MXN', source: 'e2e' } });
    await app.close();
  });

  it('GET /fx/rate devuelve la tasa cacheada', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/fx/rate?base=USD&quote=MXN')
      .expect(200);

    expect(res.body).toMatchObject({ base: 'USD', quote: 'MXN', stale: false });
    expect(res.body.rate).toBeCloseTo(17.42, 5);
    expect(typeof res.body.fetchedAt).toBe('string');
  });

  it('GET /fx/rate usa USD/MXN por defecto', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/fx/rate').expect(200);
    expect(res.body).toMatchObject({ base: 'USD', quote: 'MXN' });
  });

  it('rechaza un par no soportado con 400', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/fx/rate?base=USD&quote=EUR')
      .expect(400);
  });
});
