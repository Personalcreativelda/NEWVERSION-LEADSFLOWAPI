-- Atualizações ao vivo do app Android (Capgo auto-hospedado).
-- Cada versão do app_version pode trazer um pacote web (zip) para o app instalar
-- sem reinstalar o APK. A API também aplica isto sozinha no primeiro uso
-- (ver ensureMobileColumns em routes/version.routes.ts).
ALTER TABLE app_version ADD COLUMN IF NOT EXISTS mobile_bundle_url TEXT;
ALTER TABLE app_version ADD COLUMN IF NOT EXISTS mobile_bundle_checksum TEXT;
ALTER TABLE app_version ADD COLUMN IF NOT EXISTS mobile_bundle_size INTEGER;
ALTER TABLE app_version ADD COLUMN IF NOT EXISTS mobile_built_at TIMESTAMP WITH TIME ZONE;
-- versionCode mínimo do APK (android/app/build.gradle) que suporta o pacote
ALTER TABLE app_version ADD COLUMN IF NOT EXISTS min_native_build INTEGER DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_app_version_mobile_built_at
    ON app_version (mobile_built_at DESC)
    WHERE mobile_bundle_url IS NOT NULL;
