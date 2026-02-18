/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_MINIO_ENDPOINT: string;
  readonly VITE_MINIO_PORT: string;
  readonly VITE_MINIO_USE_SSL: string;
  readonly VITE_MINIO_ACCESS_KEY: string;
  readonly VITE_MINIO_SECRET_KEY: string;
  readonly VITE_MINIO_BUCKET: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
