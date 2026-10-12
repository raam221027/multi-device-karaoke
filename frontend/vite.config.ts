import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The browser only talks to the Vite origin; API and broadcasting-auth calls
// are proxied to Laravel so local dev mirrors the single-domain production setup.
const backend = 'http://127.0.0.1:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true, // expose on the LAN so phones can connect
    proxy: {
      '/api': backend,
      '/broadcasting': backend,
    },
  },
})
