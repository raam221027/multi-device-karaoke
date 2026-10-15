import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { networkInterfaces } from 'node:os'
import { defineConfig } from 'vite'

// The browser only talks to the Vite origin; API and broadcasting-auth calls
// are proxied to Laravel so local dev mirrors the single-domain production setup.
const backend = 'http://127.0.0.1:8000'

/** This machine's LAN address, so QR codes shown on a localhost page still work on phones. */
function lanHost(): string {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) return address.address
    }
  }
  return ''
}

// https://vite.dev/config/
export default defineConfig({
  // HTTPS (self-signed) so phones on the LAN may open the camera for the QR scanner.
  plugins: [react(), tailwindcss(), basicSsl()],
  define: {
    __LAN_HOST__: JSON.stringify(lanHost()),
  },
  server: {
    host: true, // expose on the LAN so phones can connect
    proxy: {
      '/api': backend,
      '/broadcasting': backend,
    },
  },
})
