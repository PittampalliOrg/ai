# Multi-stage Dockerfile for AI Chatbot (Next.js 16 Standalone)
# Optimized for production with minimal image size

# Stage 1: Dependencies
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install pnpm via corepack
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Stage 2: Builder
FROM node:22-alpine AS builder
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

# Copy deps from previous stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY . .

# Set build-time environment variables
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build-time environment variables for Next.js (NEXT_PUBLIC_* are inlined at build time)
# These can be overridden at build time via --build-arg if needed
ARG NEXT_PUBLIC_GITHUB_APP_CLIENT_ID="Iv23liOyweBA1S0cMIgB"
ARG NEXT_PUBLIC_APP_URL="https://ai-chatbot.cnoe.localtest.me:8443"
ENV NEXT_PUBLIC_GITHUB_APP_CLIENT_ID=${NEXT_PUBLIC_GITHUB_APP_CLIENT_ID}
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}

# Bundle the migration script for runtime use (self-contained with dependencies)
RUN npx esbuild lib/db/migrate.ts --bundle --platform=node --target=node22 --outfile=lib/db/migrate.bundle.js

# Build the Next.js application (standalone mode)
# Note: DB migrations run at container startup, not build time
RUN pnpm next build

# Stage 3: Runner
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone build output
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy database migration files and bundled migration script
# The bundle is self-contained with all dependencies
COPY --from=builder /app/lib/db/migrations ./lib/db/migrations
COPY --from=builder /app/lib/db/migrate.bundle.js ./lib/db/migrate.bundle.js

# Create uploads directory for local file storage
RUN mkdir -p /app/uploads && chown nextjs:nodejs /app/uploads

USER nextjs

EXPOSE 3000

# Start the server
CMD ["node", "server.js"]
