-- Script para limpar instâncias antigas do WhatsApp do banco de dados
-- Isso resolve o problema de usuários compartilhando a mesma instância

-- Execute este script no PostgreSQL para limpar todos os dados antigos do WhatsApp

BEGIN;

-- 1. Limpar TODAS as configurações antigas do WhatsApp da tabela settings
DELETE FROM settings
WHERE key IN (
  'whatsapp_connected',
  'whatsapp_instance_name',
  'whatsapp_profile_name',
  'whatsapp_connected_at',
  'whatsapp_disconnected_at',
  'whatsapp_qr_code',
  'whatsapp_state',
  'whatsapp_phone_number'
);

-- 2. Verificar quantas linhas foram removidas
SELECT
  COUNT(*) as total_removed
FROM settings
WHERE key LIKE 'whatsapp_%';

-- Se retornar 0, significa que foi tudo limpo com sucesso

COMMIT;

-- Após executar este script:
-- 1. Todos os usuários precisarão conectar o WhatsApp novamente
-- 2. Cada usuário terá sua própria instância isolada
-- 3. Não haverá mais compartilhamento de instâncias entre usuários
