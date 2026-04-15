-- Migration 018: Preservar conversas quando canal é deletado
-- ANTES: channel_id NOT NULL REFERENCES channels(id) ON DELETE CASCADE
-- DEPOIS: channel_id REFERENCES channels(id) ON DELETE SET NULL (nullable)
-- Motivo: Manter histórico de conversas/mensagens quando o usuário desconecta/apaga um canal

-- 1. Tornar channel_id nullable
ALTER TABLE conversations ALTER COLUMN channel_id DROP NOT NULL;

-- 2. Trocar constraint de CASCADE para SET NULL
-- Primeiro dropar a constraint existente
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_channel_id_fkey;

-- Recriar com ON DELETE SET NULL
ALTER TABLE conversations 
  ADD CONSTRAINT conversations_channel_id_fkey 
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE SET NULL;

-- 3. Também preservar mensagens: verificar se messages tem FK para conversations
-- (messages já tem ON DELETE CASCADE para conversations, o que é ok - 
--  se a conversa é preservada, as mensagens também são)

-- 4. Atualizar unique constraint para funcionar com channel_id nullable
-- A constraint UNIQUE(user_id, channel_id, remote_jid) não funciona bem com NULLs
-- em PostgreSQL (NULLs são sempre distintos), então conversas de canais deletados
-- não terão conflito. Não precisa alterar.

-- 5. Adicionar coluna para guardar referência do canal original (para histórico)
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS deleted_channel_info JSONB DEFAULT NULL;

COMMENT ON COLUMN conversations.deleted_channel_info IS 'Informações do canal original caso o canal tenha sido deletado (type, name, etc)';
