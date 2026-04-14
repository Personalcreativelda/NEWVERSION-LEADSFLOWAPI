-- ═══════════════════════════════════════════════════════════════════════════════
-- 🧹 LIMPEZA DE NÚMEROS TELEFÔNICOS - Normaliza todos os números no banco
-- ═══════════════════════════════════════════════════════════════════════════════

-- ✅ PASSO 1: Backup da tabela leads (cria uma cópia antes de modificar)
-- Se algo der errado, você pode restaurar a partir desta cópia
CREATE TABLE IF NOT EXISTS leads_backup_phone_cleanup AS
SELECT * FROM leads WHERE phone IS NOT NULL OR whatsapp IS NOT NULL;

ALTER TABLE leads_backup_phone_cleanup ADD COLUMN backup_created_at TIMESTAMP DEFAULT NOW();

-- ✅ PASSO 2: Normalizar coluna 'phone' na tabela 'leads'
-- Remove todos os caracteres não-numéricos e limpa formatação
UPDATE leads
SET phone = TRIM(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'))
WHERE phone IS NOT NULL
  AND phone != ''
  AND TRIM(REGEXP_REPLACE(phone, '[^0-9]', '', 'g')) ~ '^\d{5,15}$';  -- Validar: 5-15 dígitos

-- ✅ PASSO 3: Normalizar coluna 'whatsapp' na tabela 'leads'
UPDATE leads
SET whatsapp = TRIM(REGEXP_REPLACE(whatsapp, '[^0-9]', '', 'g'))
WHERE whatsapp IS NOT NULL
  AND whatsapp != ''
  AND TRIM(REGEXP_REPLACE(whatsapp, '[^0-9]', '', 'g')) ~ '^\d{5,15}$';  -- Validar: 5-15 dígitos

-- ✅ PASSO 4: Verificar resultado da limpeza
SELECT 
  COUNT(*) AS total_leads,
  COUNT(CASE WHEN phone IS NOT NULL AND phone ~ '^\d+$' THEN 1 END) AS phone_cleaned_numeric,
  COUNT(CASE WHEN phone IS NOT NULL AND phone !~ '^\d+$' THEN 1 END) AS phone_still_malformed,
  COUNT(CASE WHEN whatsapp IS NOT NULL AND whatsapp ~ '^\d+$' THEN 1 END) AS whatsapp_cleaned,
  COUNT(CASE WHEN whatsapp IS NOT NULL AND whatsapp !~ '^\d+$' THEN 1 END) AS whatsapp_still_malformed
FROM leads;

-- ✅ PASSO 5: Mostrar alguns exemplos de números limpos (antes vs depois)
SELECT 
  user_id,
  name,
  phone,
  whatsapp,
  'Exemplo de número normalizado' AS _info
FROM leads
WHERE (phone ~ '^\d+$' OR whatsapp ~ '^\d+$')
LIMIT 10;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 📊 ESTATÍSTICAS DE LIMPEZA
-- ═══════════════════════════════════════════════════════════════════════════════

-- Mostrar distribuição de comprimento de números (validação)
SELECT 
  CASE 
    WHEN phone IS NULL OR phone = '' THEN '(vazio)'
    WHEN phone !~ '^\d+$' THEN '(malformado)'
    ELSE LENGTH(phone)::text
  END AS phone_length,
  COUNT(*) AS count
FROM leads
GROUP BY phone_length
ORDER BY count DESC;

-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ NOTAS IMPORTANTES:
-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. A tabela leads_backup_phone_cleanup foi criada com segurança
--    Se houver problema, restaure com: DELETE FROM leads WHERE id IN (SELECT id FROM leads_backup_phone_cleanup); INSERT INTO leads SELECT * FROM leads_backup_phone_cleanup;
--
-- 2. Apenas números com 5-15 dígitos foram normalizados (validação E.164)
--    Números muito curtos ou muito longos foram ignorados
--
-- 3. Depois disso, TODOS os leads com phone duplicados terão o mesmo número normalizado
--    Convocações de webhook vão procurar com números normalizados também
