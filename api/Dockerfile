# syntax=docker/dockerfile:1
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
# Cache npm downloads between builds
RUN --mount=type=cache,target=/root/.npm \
    npm install --legacy-peer-deps

COPY . .
RUN npm run build

# ── Production image ───────────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --omit=dev --legacy-peer-deps

COPY --from=build /app/dist ./dist

EXPOSE 4001
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
