FROM node:20-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# --- Dependencies ---
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# --- Build ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# --- Production ---
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# su-exec drops root privileges in the entrypoint after fixing up the mounted
# volume's ownership (mounted volumes are root-owned at container start).
RUN apk add --no-cache su-exec

# Copy standalone output and source files used by the MCP code-control tools.
COPY --chown=nextjs:nodejs --from=builder /app/.next/standalone ./
COPY --chown=nextjs:nodejs --from=builder /app/.next/static ./.next/static
COPY --chown=nextjs:nodejs --from=builder /app/public ./public
COPY --chown=nextjs:nodejs --from=builder /app/src ./src
COPY --chown=nextjs:nodejs --from=builder /app/package.json ./package.json
COPY --chown=nextjs:nodejs --from=builder /app/next.config.js ./next.config.js
COPY --chown=nextjs:nodejs --from=builder /app/postcss.config.js ./postcss.config.js
COPY --chown=nextjs:nodejs --from=builder /app/tailwind.config.ts ./tailwind.config.ts
COPY --chown=nextjs:nodejs --from=builder /app/tsconfig.json ./tsconfig.json
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

# Runs as root (dropped to `nextjs` inside the entrypoint) so it can chown
# the mounted /data volume before the app ever starts.
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
