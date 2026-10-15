/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_REVERB_APP_KEY: string
  readonly VITE_REVERB_HOST?: string
  readonly VITE_REVERB_PORT?: string
  readonly VITE_REVERB_SCHEME?: 'http' | 'https'
  /** Origin phones should use in QR codes and invite links, e.g. a tunnel URL. */
  readonly VITE_PUBLIC_URL?: string
}

/** The dev machine's LAN IPv4 address (injected by vite.config.ts), or ''. */
declare const __LAN_HOST__: string

interface ImportMeta {
  readonly env: ImportMetaEnv
}
