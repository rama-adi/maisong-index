# cache-busting & explicit tag
ARG BUN_TAG=1.2.20-alpine
FROM oven/bun:${BUN_TAG} AS base
WORKDIR /app
# guard: fail if wrong Bun
RUN bun --version | grep -q "Bun v1\.2\.20"

# Install dependencies
FROM base AS install
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source code
FROM base AS prerelease
COPY --from=install /app/node_modules node_modules
COPY . .

# Final stage
FROM base AS release
COPY --from=install /app/node_modules node_modules
COPY --from=prerelease /app .

ENV NODE_ENV=production
USER bun
EXPOSE 3000/tcp
ENTRYPOINT [ "bun", "run", "start" ]
