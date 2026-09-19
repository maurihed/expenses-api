import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Defensive no-op: `Transaction.scope` is `Scope @default(JOINT)` and NOT NULL
// in the schema, so `WHERE "scope" IS NULL` never matches any row. Kept as a
// safety net for legacy databases where the NOT NULL/DEFAULT constraint may be
// missing.
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
