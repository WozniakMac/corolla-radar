FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM mcr.microsoft.com/playwright:v1.61.1-noble AS runtime
WORKDIR /app
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
RUN usermod --login node --home /home/node --move-home ubuntu \
    && groupmod --new-name node ubuntu \
    && node -e "require('node:fs').accessSync(require('playwright').chromium.executablePath())"
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4174 \
    ENABLE_SCHEDULED_SCAN=true \
    SCAN_INTERVAL_MINUTES=240 \
    ENABLE_CEPIK=true \
    CEPIK_INTERVAL_SECONDS=300
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
