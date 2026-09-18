const DEFAULT_TEST_DATABASE_URL =
  'postgresql://expenses:expenses@localhost:5432/expenses_test?schema=public';

const testUrl = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;

process.env.TEST_DATABASE_URL = testUrl;
process.env.DATABASE_URL = testUrl;
