import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Market (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.assetPrice.upsert({
      where: { symbol: 'VOO' },
      update: { price: 700, previousClose: 690, currency: 'USD', name: 'Vanguard S&P 500 ETF', exchange: 'NYSEArca', source: 'e2e', fetchedAt: new Date() },
      create: { symbol: 'VOO', price: 700, previousClose: 690, currency: 'USD', name: 'Vanguard S&P 500 ETF', exchange: 'NYSEArca', source: 'e2e' },
    });
  });

  afterAll(async () => {
    await prisma.assetPrice.deleteMany({ where: { symbol: 'VOO', source: 'e2e' } });
    await app.close();
  });

  it('GET /market/quote devuelve la cotización cacheada', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/market/quote?symbol=VOO')
      .expect(200);
    expect(res.body).toMatchObject({ symbol: 'VOO', price: 700, currency: 'USD', stale: false });
    expect(res.body.changePercent).toBeCloseTo(((700 - 690) / 690) * 100, 4);
  });

  it('rechaza un símbolo inválido con 400', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/market/quote?symbol=1BAD')
      .expect(400);
  });
});
