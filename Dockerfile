FROM node:24-bookworm-slim AS build

RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN HUSKY=0 npm ci

COPY prisma.config.ts ./
COPY src/prisma/schema.prisma ./src/prisma/schema.prisma
RUN DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder npx prisma generate

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && HUSKY=0 npm prune --omit=dev

FROM node:24-bookworm-slim AS production

RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma.config.ts ./prisma.config.ts
COPY --from=build --chown=node:node /app/src/prisma/schema.prisma ./src/prisma/schema.prisma
COPY --from=build --chown=node:node /app/src/prisma/migrations ./src/prisma/migrations
COPY --chown=node:node docker/entrypoint.sh ./docker/entrypoint.sh

RUN mkdir -p /app/uploads && chown node:node /app/uploads && chmod 755 /app/docker/entrypoint.sh
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "const http=require('node:http');const port=process.env.PORT||3000;const prefix=process.env.API_PREFIX||'api/v1';http.get('http://127.0.0.1:'+port+'/'+prefix+'/health',response=>{response.resume();process.exit(response.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

ENTRYPOINT ["/app/docker/entrypoint.sh"]
