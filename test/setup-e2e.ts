import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const DEFAULT_TEST_DATABASE_URL =
  'postgresql://expenses:expenses@localhost:5432/expenses_test?schema=public';

export default async function globalSetup() {
  const testUrl = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
  process.env.TEST_DATABASE_URL = testUrl;

  const parsed = new URL(testUrl);
  const dbName = parsed.pathname.replace(/^\//, '');
  if (!dbName) throw new Error(`TEST_DATABASE_URL must include a database name: ${testUrl}`);

  const adminUrl = new URL(testUrl);
  adminUrl.pathname = '/postgres';
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } });
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  } catch (error) {
    if (!/already exists/i.test((error as Error).message)) throw error;
  } finally {
    await admin.$disconnect();
  }

  execSync('pnpm prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'inherit',
  });

  execSync('pnpm ts-node prisma/seed.ts', {
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'inherit',
  });
}
