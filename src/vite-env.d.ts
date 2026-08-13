/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_IOS_APP_STORE_URL?: string;
  readonly VITE_ANDROID_PLAY_STORE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
