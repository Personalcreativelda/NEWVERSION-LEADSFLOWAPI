FROM node:20-alpine AS build
WORKDIR /app

ARG VITE_API_URL
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY

ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}

# Install dependencies — clean npm cache in same layer to minimise image size
COPY package*.json ./
RUN npm ci --prefer-offline && npm cache clean --force

# Copy only frontend sources (api/ is excluded via .dockerignore)
COPY . .
RUN npm run build

# ── Production image ───────────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

RUN npm install --global serve@14 && npm cache clean --force

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app/dist ./dist

EXPOSE 3000

CMD ["serve", "-s", "dist", "-l", "tcp://0.0.0.0:3000"]
