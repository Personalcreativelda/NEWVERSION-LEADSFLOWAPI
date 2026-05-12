# syntax=docker/dockerfile:1
FROM node:20-alpine AS build
WORKDIR /app

ARG VITE_API_URL
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_CHATWOOT_URL
ARG VITE_CHATWOOT_TOKEN
ARG VITE_N8N_WEBHOOK_URL
ARG VITE_N8N_SUPPORT_WEBHOOK_URL
ARG VITE_N8N_PLAN_LIMITS_WEBHOOK_URL

ENV VITE_API_URL=${VITE_API_URL} \
    VITE_SUPABASE_URL=${VITE_SUPABASE_URL} \
    VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY} \
    VITE_CHATWOOT_URL=${VITE_CHATWOOT_URL} \
    VITE_CHATWOOT_TOKEN=${VITE_CHATWOOT_TOKEN} \
    VITE_N8N_WEBHOOK_URL=${VITE_N8N_WEBHOOK_URL} \
    VITE_N8N_SUPPORT_WEBHOOK_URL=${VITE_N8N_SUPPORT_WEBHOOK_URL} \
    VITE_N8N_PLAN_LIMITS_WEBHOOK_URL=${VITE_N8N_PLAN_LIMITS_WEBHOOK_URL}

COPY package*.json ./
# Cache npm downloads between builds — dramatically speeds up redeploys
RUN --mount=type=cache,target=/root/.npm \
    npm install --legacy-peer-deps

COPY . .
RUN npm run build

# ── Production image (nginx — lightweight, fast startup) ──────────────────
FROM nginx:alpine AS production

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3200

CMD ["nginx", "-g", "daemon off;"]
