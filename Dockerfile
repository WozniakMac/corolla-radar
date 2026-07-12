FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
RUN npm install --global @openai/codex
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4174 \
    ENABLE_SCHEDULED_SCAN=true \
    SCAN_INTERVAL_MINUTES=240 \
    SCAN_CANDIDATE_LIMIT=300 \
    SCAN_MAX_PAGES=20 \
    SCAN_DISCOVERY_LIMIT=500
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server ./server
COPY --from=build /app/src ./src
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/data
EXPOSE 4174
VOLUME ["/app/data"]
CMD ["npm", "run", "server"]
