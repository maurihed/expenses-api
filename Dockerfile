# ---- Build stage ----
FROM node:22-alpine AS builder

RUN apk add --no-cache openssl

WORKDIR /app

RUN npm install -g pnpm@10.33.2

COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma

RUN pnpm install --frozen-lockfile
RUN pnpm prisma generate

COPY . .
RUN pnpm build

# ---- Runtime stage ----
FROM node:22-alpine AS runtime

RUN apk add --no-cache openssl

ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000

CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/main.js"]
