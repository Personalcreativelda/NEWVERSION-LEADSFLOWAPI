FROM node:20-alpine AS base
WORKDIR /app

# ffmpeg: converte os áudios gravados no app (WebM/OGG) para M4A antes de os enviar
# ao Instagram/Messenger, que não aceitam WebM (utils/audio-convert.ts)
# postgresql-client: pg_dump/pg_restore das cópias de segurança (services/backup.service.ts)
RUN apk add --no-cache ffmpeg postgresql-client

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 4000
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
