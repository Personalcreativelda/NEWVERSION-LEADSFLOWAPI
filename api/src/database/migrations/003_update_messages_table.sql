-- INBOX: Migração 3 - Atualizar tabela de mensagens (messages)
-- Adiciona coluna conversation_id e triggers para atualizar contador de não lidas

-- Adicionar coluna conversation_id
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE;

-- Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);

-- Função para atualizar contador de mensagens não lidas e última mensagem
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
    -- Se for mensagem recebida (in) e não lida
    IF NEW.direction = 'in' AND NEW.status != 'read' THEN
        UPDATE conversations 
        SET unread_count = unread_count + 1,
            last_message_at = NEW.created_at,
            updated_at = NOW()
        WHERE id = NEW.conversation_id;
    END IF;
    
    -- Se for mensagem enviada (out), apenas atualiza última mensagem
    IF NEW.direction = 'out' THEN
        UPDATE conversations 
        SET last_message_at = NEW.created_at,
            updated_at = NOW()
        WHERE id = NEW.conversation_id;
    END IF;
    
    -- Se mudou de não lida para lida
    IF TG_OP = 'UPDATE' AND NEW.direction = 'in' AND NEW.status = 'read' AND OLD.status != 'read' THEN
        UPDATE conversations 
        SET unread_count = GREATEST(0, unread_count - 1),
            updated_at = NOW()
        WHERE id = NEW.conversation_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para atualizar contador automaticamente
DROP TRIGGER IF EXISTS update_conversation_on_message_trigger ON messages;
CREATE TRIGGER update_conversation_on_message_trigger
    AFTER INSERT OR UPDATE ON messages
    FOR EACH ROW
    WHEN (NEW.conversation_id IS NOT NULL)
    EXECUTE FUNCTION update_conversation_on_message();

-- Comentários de documentação
COMMENT ON COLUMN messages.conversation_id IS 'Referência para a conversa (inbox)';
