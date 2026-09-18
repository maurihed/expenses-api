import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const PERSONS = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Mauricio' },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Maria' },
];

async function main() {
  const start = new Date('2026-01-04');
  for (const person of PERSONS) {
    await prisma.person.upsert({
      where: { id: person.id },
      update: {},
      create: { id: person.id, name: person.name, weeklyAllowance: 300, allowanceStartDate: start },
    });
  }
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
