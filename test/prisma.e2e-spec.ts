import { Test } from '@nestjs/testing';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrismaModule } from '../src/prisma/prisma.module';

describe('PrismaService (e2e)', () => {
  let prisma: PrismaService;
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PrismaModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    await prisma.$connect();
  });
  afterAll(() => prisma.$disconnect());

  it('conecta y cuenta personas', async () => {
    const rows = await prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS count FROM "Person"`;
    expect(Number(rows[0].count)).toBe(2);
  });
});
