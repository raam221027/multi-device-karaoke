import Echo from 'laravel-echo'
import Pusher from 'pusher-js'

// Reverb speaks the Pusher protocol, so Echo uses the pusher-js client.

declare global {
  interface Window {
    Pusher: typeof Pusher
  }
}

window.Pusher = Pusher

/** Without a Reverb key (e.g. local dev without Reverb running) devices just poll. */
export const realtimeEnabled = Boolean(import.meta.env.VITE_REVERB_APP_KEY)

// One connection per token: the TV display keeps its own token apart from the phone's.
const clients = new Map<string, { echo: Echo<'reverb'>; users: number }>()

function connect(token: string): Echo<'reverb'> {
  const scheme = import.meta.env.VITE_REVERB_SCHEME || 'http'

  return new Echo({
    broadcaster: 'reverb',
    key: import.meta.env.VITE_REVERB_APP_KEY,
    wsHost: import.meta.env.VITE_REVERB_HOST || window.location.hostname,
    wsPort: Number(import.meta.env.VITE_REVERB_PORT || 8080),
    wssPort: Number(import.meta.env.VITE_REVERB_PORT || 443),
    forceTLS: scheme === 'https',
    enabledTransports: ['ws', 'wss'],
    authEndpoint: '/broadcasting/auth',
    auth: {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    },
  })
}

/** Share the connection for a token; call release() when done, and the last user closes it. */
export function acquireEcho(token: string): { echo: Echo<'reverb'>; release: () => void } {
  let client = clients.get(token)
  if (!client) {
    client = { echo: connect(token), users: 0 }
    clients.set(token, client)
  }
  client.users++

  const held = client
  let released = false
  return {
    echo: held.echo,
    release: () => {
      if (released) return
      released = true
      if (--held.users > 0) return
      held.echo.disconnect()
      clients.delete(token)
    },
  }
}
