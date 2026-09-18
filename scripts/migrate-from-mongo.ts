import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { MongoClient } from 'mongodb';
import { AccountType, balanceDelta, computeOpeningBalance, TxType } from '../src/domain/balance';

type MongoAccount = { _id: unknown; name: string; balance: number; userId?: string };
type MongoTransaction = {
  _id: unknown;
  accountId: unknown;
  amount: number;
  category?: string;
  date: unknown;
  description?: string;
  type: string;
};

const ACCOUNT_TYPE: AccountType = 'CASH';
const PERSONS = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Mauricio' },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Maria' },
];

function loadDotEnv() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const match = /^\s*([\w.-]+)\s*=\s*(.*)?\s*$/.exec(line);
      if (!match || match[1].startsWith('#')) continue;
      let value = (match[2] ?? '').trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[match[1]] === undefined) process.env[match[1]] = value;
    }
  } catch {}
}

function toId(value: unknown): string {
  return value && typeof (value as { toString(): string }).toString === 'function'
    ? (value as { toString(): string }).toString()
    : String(value);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function toUtcDate(value: unknown): Date {
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  const text = String(value);
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (plain) {
    return new Date(Date.UTC(Number(plain[1]), Number(plain[2]) - 1, Number(plain[3])));
  }
  const parsed = new Date(text);
  return new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()),
  );
}

function mapType(value: string): TxType {
  const type = String(value).toUpperCase();
  if (type === 'INCOME' || type === 'EXPENSE' || type === 'TRANSFER') return type as TxType;
  throw new Error(`Unknown transaction type: ${value}`);
}

async function main() {
  loadDotEnv();
  const host = process.env.MONGO_DB_HOST;
  const username = process.env.MONGO_DB_USERNAME;
  const password = process.env.MONGO_DB_PASSWORD;
  const database = process.env.MONGO_DB;
  if (!host || !username || !password || !database) {
    throw new Error('Missing MONGO_DB_HOST/USERNAME/PASSWORD/DB environment variables');
  }

  const uri = `mongodb+srv://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}`;
  const mongo = new MongoClient(uri);
  const prisma = new PrismaClient();

  try {
    await mongo.connect();
    const db = mongo.db(database);
    const mongoAccounts = await db
      .collection<MongoAccount>('accounts')
      .find()
      .toArray();
    const mongoTransactions = await db
      .collection<MongoTransaction>('transactions')
      .find()
      .toArray();

    for (const person of PERSONS) {
      await prisma.person.upsert({
        where: { id: person.id },
        update: {},
        create: {
          id: person.id,
          name: person.name,
          weeklyAllowance: 300,
          allowanceStartDate: new Date('2026-01-04'),
        },
      });
    }

    const categoryNames = [
      ...new Set(mongoTransactions.map((tx) => tx.category).filter((name) => !!name)),
    ];
    for (const name of categoryNames) {
      await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
    }
    const categories = await prisma.category.findMany();
    const categoryIdByName = new Map(categories.map((category) => [category.name, category.id]));

    const netEffectByAccount = new Map<string, number>();
    const knownAccountIds = new Set(mongoAccounts.map((account) => toId(account._id)));
    const orphanAccountIds = new Set<string>();
    for (const tx of mongoTransactions) {
      const accountMongoId = toId(tx.accountId);
      const type = mapType(tx.type);
      const delta = balanceDelta({
        type,
        accountType: ACCOUNT_TYPE,
        role: 'SOURCE',
        amount: round2(Number(tx.amount)),
      });
      netEffectByAccount.set(accountMongoId, (netEffectByAccount.get(accountMongoId) ?? 0) + delta);
      if (!knownAccountIds.has(accountMongoId)) orphanAccountIds.add(accountMongoId);
    }

    const accountIdByMongoId = new Map<string, string>();
    for (const account of mongoAccounts) {
      const legacyMongoId = toId(account._id);
      const balance = round2(Number(account.balance));
      const netEffect = round2(netEffectByAccount.get(legacyMongoId) ?? 0);
      const openingBalance = computeOpeningBalance(balance, netEffect);
      const row = await prisma.account.upsert({
        where: { legacyMongoId },
        update: { name: account.name, type: ACCOUNT_TYPE, balance, openingBalance },
        create: { name: account.name, type: ACCOUNT_TYPE, balance, openingBalance, legacyMongoId },
      });
      accountIdByMongoId.set(legacyMongoId, row.id);
    }

    for (const orphanId of orphanAccountIds) {
      const netEffect = round2(netEffectByAccount.get(orphanId) ?? 0);
      const openingBalance = computeOpeningBalance(0, netEffect);
      const name = `Cuenta importada (${orphanId.slice(-6)})`;
      const row = await prisma.account.upsert({
        where: { legacyMongoId: orphanId },
        update: { type: ACCOUNT_TYPE, balance: 0, openingBalance },
        create: { name, type: ACCOUNT_TYPE, balance: 0, openingBalance, legacyMongoId: orphanId },
      });
      accountIdByMongoId.set(orphanId, row.id);
    }

    let transactionsMigrated = 0;
    for (const tx of mongoTransactions) {
      const legacyMongoId = toId(tx._id);
      const accountId = accountIdByMongoId.get(toId(tx.accountId));
      if (!accountId) {
        throw new Error(`No destination account for transaction ${legacyMongoId}`);
      }
      const data = {
        accountId,
        amount: round2(Number(tx.amount)),
        type: mapType(tx.type),
        categoryId: tx.category ? categoryIdByName.get(tx.category) ?? null : null,
        date: toUtcDate(tx.date),
        description: tx.description ?? '',
        scope: 'JOINT' as const,
      };
      await prisma.transaction.upsert({
        where: { legacyMongoId },
        update: data,
        create: { ...data, legacyMongoId },
      });
      transactionsMigrated += 1;
    }

    const mongoBalanceSum = round2(
      mongoAccounts.reduce((sum, account) => sum + round2(Number(account.balance)), 0),
    );
    const migratedAccounts = await prisma.account.findMany({
      where: { legacyMongoId: { not: null } },
    });
    const postgresBalanceSum = round2(
      migratedAccounts.reduce((sum, account) => sum + Number(account.balance), 0),
    );
    const balancesMatch = Math.abs(postgresBalanceSum - mongoBalanceSum) < 0.005;

    console.log('--- Mongo -> Postgres migration summary ---');
    console.log(`accounts migrated:     ${migratedAccounts.length}`);
    console.log(`categories migrated:   ${categoryNames.length}`);
    console.log(`transactions migrated: ${transactionsMigrated}`);
    console.log(`mongo balance sum:     ${mongoBalanceSum}`);
    console.log(`postgres balance sum:  ${postgresBalanceSum}`);
    console.log(`balances match:        ${balancesMatch ? 'YES' : 'NO'}`);

    if (!balancesMatch) {
      console.error('Balance mismatch detected. Migration guardrail failed.');
      process.exitCode = 1;
    }
  } finally {
    await mongo.close();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exitCode = 1;
});
