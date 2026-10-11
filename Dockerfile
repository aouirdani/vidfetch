# syntax=docker/dockerfile:1.7
# Build: docker build -t vidfetch .
# Run: docker run --env-file .env -p 5000:5000 vidfetch
FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install -g npm@12 --no-audit --no-fund && npm ci --no-audit --no-fund

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 VIDFETCH_SKIP_ENGINE_SETUP=1 VIDFETCH_TARGET=node
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
# Database credentials are needed only for runtime operations.
RUN NODE_OPTIONS=--max-old-space-size=6144 npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=5000 HOSTNAME=0.0.0.0 \
    YTDLP_PATH=/opt/vidfetch/bin/yt-dlp FFMPEG_PATH=/usr/bin/ffmpeg VIDFETCH_SKIP_ENGINE_SETUP=1 VIDFETCH_TARGET=node
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv ffmpeg ca-certificates curl tini \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/vidfetch \
    && /opt/vidfetch/bin/pip install --no-cache-dir --upgrade "yt-dlp[default,curl-cffi]" \
    && /opt/vidfetch/bin/yt-dlp --version \
    && /opt/vidfetch/bin/yt-dlp --list-impersonate-targets \
    && groupadd --system --gid 1001 vidfetch \
    && useradd --system --uid 1001 --gid vidfetch --create-home vidfetch
COPY --from=builder --chown=vidfetch:vidfetch /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=vidfetch:vidfetch /app/node_modules ./node_modules
COPY --from=builder --chown=vidfetch:vidfetch /app/.next ./.next
COPY --from=builder --chown=vidfetch:vidfetch /app/public ./public
COPY --from=builder --chown=vidfetch:vidfetch /app/next.config.ts /app/server.js /app/drizzle.config.ts ./
COPY --from=builder --chown=vidfetch:vidfetch /app/scripts ./scripts
COPY --from=builder --chown=vidfetch:vidfetch /app/src/db ./src/db
COPY --from=builder --chown=vidfetch:vidfetch /app/src/lib/deployment.ts ./src/lib/deployment.ts
USER vidfetch
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${PORT}/api/health" || exit 1
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]
