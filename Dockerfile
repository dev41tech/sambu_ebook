# syntax=docker/dockerfile:1

# ---- build: instala todas as deps (incl. dev) e gera o bundle do frontend ----
FROM node:20-bookworm-slim AS builder

# python3/make/g++ são necessários para compilar o binário nativo do better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime: só o necessário para rodar o server (frontend já compilado em /dist) ----
FROM node:20-bookworm-slim AS runtime

# Chromium é usado pelo puppeteer-core (server/lib/pdf.ts) para renderizar PDF/capa
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium fonts-liberation ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV CHROME_PATH=/usr/bin/chromium

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
# server/routes/ebooks.ts importa src/lib/categorias — sem isto o tsx quebra no start
COPY --from=builder /app/src/lib ./src/lib
COPY --from=builder /app/package.json ./package.json

# Diretórios de dados persistentes — monte volumes do EasyPanel apontando para eles,
# senão tudo se perde a cada novo deploy (banco SQLite, exports, capas, base de conhecimento).
RUN mkdir -p /app/data /app/covers /app/knowledge

EXPOSE 3001
CMD ["npm", "start"]
