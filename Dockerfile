# Self-hosted fx0 (FX0_LOCAL=1). See docker-compose.yml and SELF_HOSTING.md.
# Building needs the npm registry once; the image then runs with no network.

# Debian, not Alpine: libfx ships a glibc native addon.
FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
RUN FX0_LOCAL=1 npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    FX0_LOCAL=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    FX_SESSIONS_DIR=/data/sessions
COPY --from=build /app/package.json /app/next.config.mjs ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
# Read from disk at runtime: DESIGN.md styles, and the migrations the migrate service applies.
COPY --from=build /app/lib/design-md ./lib/design-md
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/scripts ./scripts
RUN mkdir -p /data/sessions && chown node:node /data/sessions
USER node
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start"]
