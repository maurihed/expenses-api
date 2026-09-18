import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const updated = await prisma.$executeRawUnsafe(
    `UPDATE "Transaction" SET "scope" = 'JOINT' WHERE "scope" IS NULL`,
  );
  console.log(`backfill-scope: ${updated} transaction(s) updated to JOINT`);
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error('Backfill failed:', error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

export { main };
