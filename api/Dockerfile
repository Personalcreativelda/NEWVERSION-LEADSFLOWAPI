FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci --prefer-offline && npm cache clean --force

COPY . .
RUN npm run build

# ── Production image ───────────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production --prefer-offline && npm cache clean --force

COPY --from=build /app/dist ./dist

EXPOSE 4000
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
