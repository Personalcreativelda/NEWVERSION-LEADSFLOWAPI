#!/usr/bin/env node

/**
 * Script para testar configuração do MinIO
 *
 * Como usar:
 * Execute no diretório raiz: node test-minio.cjs
 */

const fs = require('fs');
const path = require('path');

console.log('\n🔍 Verificando Configuração do MinIO...\n');

// Ler arquivo .env
const envPath = path.join(__dirname, '.env');
let envVars = {};

try {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      if (value && !value.startsWith('#')) {
        envVars[key] = value;
      }
    }
  });
} catch (error) {
  console.error('❌ Erro ao ler arquivo .env:', error.message);
  process.exit(1);
}

// Verificar variáveis de ambiente
const config = {
  ENDPOINT: envVars.MINIO_ENDPOINT,
  PORT: envVars.MINIO_PORT,
  USE_SSL: envVars.MINIO_USE_SSL,
  ACCESS_KEY: envVars.MINIO_ACCESS_KEY || envVars.SERVICE_USER_MINIO,
  SECRET_KEY: envVars.MINIO_SECRET_KEY || envVars.SERVICE_PASSWORD_MINIO,
  BUCKET: envVars.MINIO_BUCKET,
  PUBLIC_URL: envVars.MINIO_PUBLIC_URL,
};

console.log('📋 Configurações no .env:');
console.log('  MINIO_ENDPOINT:', config.ENDPOINT || '❌ VAZIO');
console.log('  MINIO_PORT:', config.PORT || '❌ VAZIO');
console.log('  MINIO_USE_SSL:', config.USE_SSL || '❌ VAZIO');
console.log('  ACCESS_KEY:', config.ACCESS_KEY ? `✅ ${config.ACCESS_KEY.substring(0, 10)}...` : '❌ VAZIO');
console.log('  SECRET_KEY:', config.SECRET_KEY ? `✅ ${config.SECRET_KEY.substring(0, 10)}...` : '❌ VAZIO');
console.log('  MINIO_BUCKET:', config.BUCKET || '❌ VAZIO');
console.log('  MINIO_PUBLIC_URL:', config.PUBLIC_URL || '⚠️ Vazio (opcional)');

// Verificar se está configurado
const isConfigured = Boolean(
  config.ENDPOINT &&
  config.ACCESS_KEY &&
  config.SECRET_KEY
);

console.log('\n📊 Status da Configuração:');

if (!isConfigured) {
  console.log('❌ MinIO NÃO está configurado!\n');
  console.log('💡 Para configurar, edite o arquivo .env e preencha:');
  console.log('   - MINIO_ENDPOINT=seu-dominio.com');
  console.log('   - MINIO_ACCESS_KEY=sua_chave (ou SERVICE_USER_MINIO)');
  console.log('   - MINIO_SECRET_KEY=sua_senha (ou SERVICE_PASSWORD_MINIO)');
  console.log('   - MINIO_BUCKET=leadflow-avatars');
  console.log('\n📝 Enquanto não configurado, o sistema usa Base64 (banco de dados).\n');
  process.exit(0);
}

console.log('✅ MinIO está configurado!\n');

// Informações de uso
console.log('🧪 Como Testar no Sistema:');
console.log('\n1️⃣ Teste de Avatar (Perfil do Usuário):');
console.log('   - Acesse: Configurações da Conta');
console.log('   - Faça upload de uma foto');
console.log('   - Verifique os logs do servidor');
console.log('   - Deve ver: "[MinIO] Uploading to user-specific path: avatars/users/..."');

console.log('\n2️⃣ Teste de Mídia (Campanhas):');
console.log('   - Acesse: Campanhas → Nova Campanha');
console.log('   - Faça upload de imagem/vídeo');
console.log('   - Endpoint usado: POST /api/campaigns/upload-media');
console.log('   - Deve ver: "[MinIO] Uploading to user-specific path: campaigns/users/..."');

console.log('\n3️⃣ Verificar Logs do Servidor:');
console.log('   - Inicie o servidor: cd api && npm start');
console.log('   - Faça um upload');
console.log('   - Veja os logs para confirmar MinIO ou Base64');

console.log('\n4️⃣ Verificar no MinIO Console:');
console.log('   - Acesse o console do MinIO');
console.log('   - Bucket:', config.BUCKET);
console.log('   - Estrutura esperada:');
console.log('     • avatars/users/{userId}/timestamp_filename.jpg');
console.log('     • campaigns/users/{userId}/timestamp_filename.mp4');

console.log('\n📁 Estrutura de Pastas no MinIO:');
console.log('   leadflow-avatars/');
console.log('   ├── avatars/');
console.log('   │   └── users/');
console.log('   │       ├── user-123/');
console.log('   │       │   └── 1234567890_photo.jpg');
console.log('   │       └── user-456/');
console.log('   │           └── 1234567890_avatar.png');
console.log('   └── campaigns/');
console.log('       └── users/');
console.log('           ├── user-123/');
console.log('           │   └── 1234567890_video.mp4');
console.log('           └── user-456/');
console.log('               └── 1234567890_image.jpg');

console.log('\n✨ Configuração validada com sucesso!\n');
