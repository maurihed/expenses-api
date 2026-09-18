# expenses-api

NestJS 10 + Prisma 5 + PostgreSQL 16 API for the expenses app.

- Base URL: `http://localhost:3000/api/v1`
- Health: `GET /api/v1/health` → `{ "status": "ok" }`

## Requirements

- Node.js 22 + pnpm 10
- Docker + Docker Compose

## Local development

Install dependencies and start PostgreSQL:

```bash
pnpm install
cp .env.example .env   # adjust values
docker compose up -d postgres
pnpm prisma migrate deploy
pnpm start:dev
```

Run the tests:

```bash
pnpm test
pnpm test:e2e
```

E2E tests run against a dedicated `expenses_test` database that is created,
migrated and seeded automatically from `TEST_DATABASE_URL` (defaults to the
local `postgresql://expenses:expenses@localhost:5432/expenses_test`). They never
touch the development/production `expenses` database.

## Production (Docker)

The production stack is defined in `docker-compose.prod.yml` (`api` +
`postgres`, with a persistent volume and a PostgreSQL healthcheck). Configuration
is read from `.env`: `DATABASE_URL` is passed verbatim to the API container (use
the `postgres` hostname and a strong password), and `POSTGRES_PASSWORD` is
required with no weak default.

```bash
cp .env.example .env   # set DATABASE_URL and a strong POSTGRES_PASSWORD
docker compose -f docker-compose.prod.yml up -d --build
curl http://localhost:3000/api/v1/health   # {"status":"ok"}
```

Migrations are applied automatically on container start (`prisma migrate deploy`).

Stop the stack:

```bash
docker compose -f docker-compose.prod.yml down
```

## Database backup

`scripts/backup.sh` dumps the production database with `pg_dump`, gzips it and
writes it to `backups/expenses-<date>.sql.gz`.

```bash
./scripts/backup.sh
```

Schedule it daily with cron (runs every day at 03:00):

```cron
0 3 * * * cd /path/to/expenses-api && ./scripts/backup.sh >> /var/log/expenses-backup.log 2>&1
```

Restore a dump (the container reads `POSTGRES_USER`/`POSTGRES_DB` from its env):

```bash
gunzip -c backups/expenses-<date>.sql.gz | docker compose -f docker-compose.prod.yml exec -T postgres sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"'
```

Make sure the script is executable:

```bash
chmod +x scripts/backup.sh
```
