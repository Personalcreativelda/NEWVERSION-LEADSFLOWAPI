-- Migração 6: Adicionar tipos 'email' e 'website' ao CHECK constraint da tabela channels
-- Necessário para suportar canais de email (SMTP/IMAP) e widget de chat do website

-- Remover o constraint antigo (pode ter diferentes nomes dependendo de como foi criado)
DO $$
BEGIN
    -- Tentar remover constraints conhecidos
    ALTER TABLE channels DROP CONSTRAINT IF EXISTS channels_type_check;
    ALTER TABLE channels DROP CONSTRAINT IF EXISTS channels_type_check1;

    -- Adicionar novo constraint com todos os tipos suportados
    ALTER TABLE channels ADD CONSTRAINT channels_type_check
        CHECK (type IN ('whatsapp', 'whatsapp_cloud', 'facebook', 'instagram', 'telegram', 'email', 'website', 'twilio_sms'));

    RAISE NOTICE 'CHECK constraint atualizado com sucesso para incluir email e website';
EXCEPTION
    WHEN others THEN
        RAISE NOTICE 'Erro ao atualizar constraint: %. Tentando abordagem alternativa...', SQLERRM;
        -- Se falhar, tentar remover e recriar
        BEGIN
            -- Buscar e remover qualquer constraint de CHECK na coluna type
            EXECUTE (
                SELECT 'ALTER TABLE channels DROP CONSTRAINT ' || conname
                FROM pg_constraint
                WHERE conrelid = 'channels'::regclass
                AND contype = 'c'
                AND pg_get_constraintdef(oid) LIKE '%type%'
                LIMIT 1
            );
            ALTER TABLE channels ADD CONSTRAINT channels_type_check
                CHECK (type IN ('whatsapp', 'whatsapp_cloud', 'facebook', 'instagram', 'telegram', 'email', 'website', 'twilio_sms'));
            RAISE NOTICE 'Constraint recriado com sucesso';
        EXCEPTION
            WHEN others THEN
                RAISE NOTICE 'Não foi possível atualizar o constraint: %', SQLERRM;
        END;
END $$;
