# The Loom21 storefront: build with Node, run the server-rendered store as a non-root user.
#   docker build -t loom21-storefront .
#   docker run --env-file .env -p 4000:4000 loom21-storefront

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-alpine AS run
ENV NODE_ENV=production PORT=4000
WORKDIR /app
# The build output is self-contained: the server bundle includes Express and Angular.
COPY --from=build --chown=node:node /app/dist/loom21-storefront ./dist/loom21-storefront
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/healthz || exit 1
CMD ["node", "dist/loom21-storefront/server/server.mjs"]
