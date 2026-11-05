FROM node:22-bookworm-slim AS deps
WORKDIR /app
# build tools are only a fallback in case a prebuilt binary (argon2, sharp) is unavailable for the platform
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json server.js ./
COPY src ./src
COPY scripts ./scripts
COPY public ./public
COPY admin ./admin
RUN mkdir -p /var/data && chown -R node:node /var/data /app
USER node
VOLUME ["/var/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","--disable-warning=ExperimentalWarning","server.js"]
