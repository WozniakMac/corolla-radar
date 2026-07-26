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
RUN mkdir -p /app/data
RUN chown -R node:node /app/data
USER node
EXPOSE 4174
VOLUME ["/app/data"]
CMD ["npm", "run", "server"]
