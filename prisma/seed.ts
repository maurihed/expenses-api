import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const start = new Date('2026-01-04');
  for (const name of ['Mauricio', 'Maria']) {
    await prisma.person.upsert({
      where: { id: name },
      update: {},
      create: { id: name, name, weeklyAllowance: 300, allowanceStartDate: start },
    });
  }
}
main().finally(() => prisma.$disconnect());
