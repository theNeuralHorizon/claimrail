# Minimal multi-stage Dockerfile for ClaimRail.
# Uses Next.js standalone output so the final image ships only the compiled
# server + runtime deps. No separate `npm ci --production` step needed.

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# `--legacy-peer-deps` because we have a mix of Next 14 and React 18 peers.
RUN npm ci --legacy-peer-deps --no-audit --no-fund

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# AUTH_SECRET must be non-empty at build time to satisfy the server-side
# import-time check in lib/auth/session.ts. Real deployments pass a real
# one via the runtime env.
ENV AUTH_SECRET=build-time-placeholder-replace-at-runtime-minimum-32
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup -S claimrail && adduser -S claimrail -G claimrail
USER claimrail

COPY --from=builder --chown=claimrail:claimrail /app/public ./public
COPY --from=builder --chown=claimrail:claimrail /app/.next ./.next
COPY --from=builder --chown=claimrail:claimrail /app/node_modules ./node_modules
COPY --from=builder --chown=claimrail:claimrail /app/package.json ./package.json
COPY --from=builder --chown=claimrail:claimrail /app/next.config.mjs ./next.config.mjs
COPY --from=builder --chown=claimrail:claimrail /app/lib ./lib
COPY --from=builder --chown=claimrail:claimrail /app/app ./app

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["npm", "start"]
