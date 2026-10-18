FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
  libnss3 libdbus-1-3 libatk1.0-0 libgbm-dev libasound2 libxrandr2 libxkbcommon-dev \
  libxfixes3 libxcomposite1 libxdamage1 libpango-1.0-0 libcairo2 libcups2 libgtk-3-0 \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY packages ./packages
RUN npm ci --ignore-scripts \
  && npm run build -w @krayon/shared \
  && npm run build -w @krayon/renderer \
  && node -e "import('@remotion/renderer').then((r) => r.ensureBrowser())" \
  && node --input-type=module -e "import { bundle } from '@remotion/bundler'; await bundle({ entryPoint: 'packages/shared/dist/remotion/entry.js', outDir: '/app/bundle' });"
ENV SERVE_URL=/app/bundle
ENV NODE_ENV=production
# 2 vCPU, 4 GiB, concurrency = RENDER_CONCURRENCY, min-instances 0 are set on Cloud Run.
CMD ["node", "packages/renderer/dist/server.js"]
