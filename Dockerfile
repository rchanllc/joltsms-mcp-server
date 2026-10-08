FROM node:22-slim AS builder
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src/ src/
RUN npm run build

FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist/ dist/
ENV NODE_ENV=production
ENTRYPOINT ["node", "dist/server.js"]
