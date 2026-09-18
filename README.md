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

## Production (Docker)

The production stack is defined in `docker-compose.prod.yml` (`api` + `postgres`,
with a persistent volume and a PostgreSQL healthcheck). Configuration is read
from `.env`; `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` are used to
build the container `DATABASE_URL`, so the API connects to the `postgres`
service instead of `localhost`.

```bash
cp .env.example .env   # set POSTGRES_* and any secrets
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

Make sure the script is executable:

```bash
chmod +x scripts/backup.sh
```
