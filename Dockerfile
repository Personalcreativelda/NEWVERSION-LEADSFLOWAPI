FROM node:20-alpine AS build
WORKDIR /app

ARG VITE_API_URL

ENV VITE_API_URL=${VITE_API_URL}

# Install dependencies based on the lockfile for reproducible builds
COPY package*.json ./
RUN npm ci

# Copy application sources and build the production bundle
COPY . .
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app

# Lightweight static server for the built assets
RUN npm install --global serve@14

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app/dist ./dist

EXPOSE 3000

# Sem -s: as regras (páginas públicas em HTML já desenhado + resto para o app) estão em
# dist/serve.json (public/serve.json)
CMD ["serve", "dist", "-l", "tcp://0.0.0.0:3000"]
