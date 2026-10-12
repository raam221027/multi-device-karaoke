/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_REVERB_APP_KEY: string
  readonly VITE_REVERB_HOST?: string
  readonly VITE_REVERB_PORT?: string
  readonly VITE_REVERB_SCHEME?: 'http' | 'https'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
