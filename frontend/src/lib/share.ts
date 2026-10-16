import { useState } from 'react'

const onLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)

/**
 * The origin other devices can reach. A page opened at localhost would put
 * "localhost" in its QR codes, which a phone resolves to itself, so swap in
 * the dev machine's LAN address (or an explicit VITE_PUBLIC_URL).
 */
export function publicOrigin(): string {
  const configured = import.meta.env.VITE_PUBLIC_URL?.replace(/\/+$/, '')
  if (configured) return configured
  if (onLocalhost && __LAN_HOST__) {
    const port = window.location.port ? `:${window.location.port}` : ''
    return `${window.location.protocol}//${__LAN_HOST__}${port}`
  }
  return window.location.origin
}

/** publicOrigin() without the protocol, for addresses shown as text. */
export function publicHost(): string {
  return publicOrigin().replace(/^https?:\/\//, '')
}

export function joinUrl(code: string | null): string {
  return `${publicOrigin()}/join/${code ?? ''}`
}

/** Opens the display page with the code filled in, for a phone or tablet used as the screen. */
export function displayUrl(code: string | null): string {
  return `${publicOrigin()}/display?code=${encodeURIComponent(code ?? '')}`
}

/** True only when QR codes would point at an address phones can't reach. */
export const isLocalhost = onLocalhost && publicOrigin() === window.location.origin

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false // Clipboard needs HTTPS or localhost.
  }
}

/** Share sheet on phones, clipboard elsewhere. The label flips to "Copied" briefly. */
export function useShare() {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle')

  function flash(next: 'copied' | 'failed') {
    setStatus(next)
    window.setTimeout(() => setStatus('idle'), 2000)
  }

  async function share(data: { title: string; text: string; url: string }) {
    if (navigator.share) {
      try {
        await navigator.share(data)
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }
    flash((await copyText(data.url)) ? 'copied' : 'failed')
  }

  async function copy(text: string) {
    flash((await copyText(text)) ? 'copied' : 'failed')
  }

  return { status, share, copy }
}
