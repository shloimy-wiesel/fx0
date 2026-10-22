# Self-hosted fx0 (FX0_LOCAL=1). See docker-compose.yml and SELF_HOSTING.md.
# Building needs the npm registry once; the image then runs with no network.

# Debian, not Alpine: libfx ships a glibc native addon.
# Only the runtime stage ships. It is distroless: Node and the few shared
# libraries Node needs, with no shell, package manager, npm, perl or
# util-linux for a scanner to flag or an attacker to use.
FROM node:24-trixie-slim@sha256:43b9ba1142b8dcf33fa8f922ca1be85714adc444e0586c7cf7726daaeabc1bea AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
RUN FX0_LOCAL=1 npm run build && npm prune --omit=dev
# The runtime image has no shell to create the sessions directory with.
RUN mkdir -p /data/sessions

FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:78f07ef1b5ea71ad7c055df15d0dd8997f2d288f9158623c4d4ae3d765b7d50d
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
COPY --from=build --chown=nonroot:nonroot /data/sessions /data/sessions
USER nonroot
EXPOSE 3000
# The image's entrypoint is node, so commands are node's arguments.
CMD ["node_modules/next/dist/bin/next", "start"]
