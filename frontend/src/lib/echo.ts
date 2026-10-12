import Echo from 'laravel-echo'
import Pusher from 'pusher-js'
import { getToken } from './api'

// Reverb speaks the Pusher protocol, so Echo uses the pusher-js client.
// Not wired into any page yet; real-time arrives in Phase 3.

declare global {
  interface Window {
    Pusher: typeof Pusher
  }
}

window.Pusher = Pusher

let echo: Echo<'reverb'> | null = null

export function getEcho(): Echo<'reverb'> {
  if (echo) return echo

  const scheme = import.meta.env.VITE_REVERB_SCHEME ?? 'http'

  echo = new Echo({
    broadcaster: 'reverb',
    key: import.meta.env.VITE_REVERB_APP_KEY,
    wsHost: import.meta.env.VITE_REVERB_HOST ?? window.location.hostname,
    wsPort: Number(import.meta.env.VITE_REVERB_PORT ?? 8080),
    wssPort: Number(import.meta.env.VITE_REVERB_PORT ?? 443),
    forceTLS: scheme === 'https',
    enabledTransports: ['ws', 'wss'],
    authEndpoint: '/broadcasting/auth',
    auth: {
      headers: {
        Authorization: `Bearer ${getToken() ?? ''}`,
        Accept: 'application/json',
      },
    },
  })

  return echo
}
