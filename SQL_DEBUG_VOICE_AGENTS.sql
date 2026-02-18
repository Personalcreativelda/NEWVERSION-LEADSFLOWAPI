-- Verify if API keys are saved correctly

-- Run this query to check if your API keys were saved:
SELECT 
  id,
  email,
  elevenlabs_api_key IS NOT NULL as "ElevenLabs Saved",
  SUBSTRING(elevenlabs_api_key, 1, 8) || '...' as "ElevenLabs Preview",
  openai_api_key IS NOT NULL as "OpenAI Saved",
  SUBSTRING(openai_api_key, 1, 8) || '...' as "OpenAI Preview",
  anthropic_api_key IS NOT NULL as "Anthropic Saved",
  SUBSTRING(anthropic_api_key, 1, 8) || '...' as "Anthropic Preview",
  google_api_key IS NOT NULL as "Google Saved",
  SUBSTRING(google_api_key, 1, 8) || '...' as "Google Preview",
  preferred_ai_model,
  updated_at
FROM users
WHERE email = 'seu_email@aqui.com'  -- Substitua com seu email
ORDER BY updated_at DESC;

-- Ver todos os agentes de voz
SELECT 
  id,
  user_id,
  name,
  voice_provider,
  call_provider,
  call_config->>'api_key' IS NOT NULL as "Has Wavoip Key",
  call_config->>'from_number' as "From Number",
  is_active,
  created_at
FROM voice_agents
WHERE user_id = (SELECT id FROM users WHERE email = 'seu_email@aqui.com')  -- Substitua com seu email
ORDER BY created_at DESC;
