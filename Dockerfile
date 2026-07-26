FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ARG CODEX_VERSION=0.144.1
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN apt-get update \
    && apt-get install -y --no-install-recommends gosu \
    && rm -rf /var/lib/apt/lists/*
RUN npm install --global "@openai/codex@${CODEX_VERSION}"
RUN npx playwright install --with-deps chromium \
    && chmod -R a+rX /ms-playwright
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4174 \
    ENABLE_SCHEDULED_SCAN=true \
    SCAN_INTERVAL_MINUTES=240 \
    ENABLE_CEPIK=true \
    CEPIK_INTERVAL_SECONDS=300
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server ./server
COPY --from=build /app/src ./src
COPY --from=build /app/dist ./dist
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN mkdir -p /app/data \
    && chown -R node:node /app/data
EXPOSE 4174
VOLUME ["/app/data"]
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "run", "server"]
