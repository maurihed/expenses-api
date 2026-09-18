#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

mkdir -p backups

tmp="backups/expenses-$(date +%F).sql.gz.tmp"
trap 'rm -f "$tmp"' EXIT
docker compose -f docker-compose.prod.yml exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  | gzip > "$tmp" && mv "$tmp" "backups/expenses-$(date +%F).sql.gz"
