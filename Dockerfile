FROM node:20-slim

WORKDIR /app

# tsup does not bundle dependencies into dist/index.js (they're marked
# external), so runtime node_modules are still required. dist/ itself is
# committed to this repo (see README "Packaging: why dist/ is committed"),
# so no build step is needed — just install prod deps and run the compiled
# server.
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm@10 && pnpm install --prod --frozen-lockfile
COPY dist ./dist

ENTRYPOINT ["node", "dist/index.js"]
