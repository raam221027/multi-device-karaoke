import { useEffect, useRef, useState } from 'react'
import { acquireEcho, realtimeEnabled } from './echo'

// Realtime failures fall back to polling silently, so non-production builds log enough
// to tell why from the console. The flag is a build-time constant, so production drops these calls.
const debug = __REALTIME_DEBUG__

/**
 * Listen for "room changed" signals from Reverb. onChange gets the room's new
 * version, or nothing when (re)subscribing: signals sent while the socket was
 * down are lost, so that's the moment to catch up.
 *
 * Returns whether signals are flowing. Callers keep polling either way, slowly
 * while live and at full speed when not, so a dropped socket costs nothing.
 */
export function useRoomChannel(
  roomId: string | number | undefined,
  token: string | null,
  onChange: (version?: number) => void,
): boolean {
  const [live, setLive] = useState(false)
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })

  useEffect(() => {
    if (!realtimeEnabled || roomId === undefined || !token) {
      if (debug) console.info('[realtime] off', { realtimeEnabled, roomId, hasToken: Boolean(token) })
      return
    }

    const name = `room.${roomId}`
    const { echo, release } = acquireEcho(token)
    const connection = echo.connector.pusher.connection
    if (debug) console.info('[realtime] socket', connection.state)

    const onState = ({ previous, current }: { previous: string; current: string }) => {
      if (debug) console.info('[realtime]', previous, '→', current)
      // pusher-js resubscribes after a reconnect, and subscribed() fires again then.
      if (current !== 'connected') setLive(false)
    }
    connection.bind('state_change', onState)

    echo
      .private(name)
      .subscribed(() => {
        if (debug) console.info('[realtime] subscribed', name)
        setLive(true)
        onChangeRef.current()
      })
      .error((error: unknown) => {
        if (debug) console.warn('[realtime] subscribe failed', name, error)
        setLive(false)
      })
      .listen('.room.changed', (event: { version: number }) => onChangeRef.current(event.version))

    return () => {
      connection.unbind('state_change', onState)
      echo.leave(name)
      release()
      setLive(false)
    }
  }, [roomId, token])

  return live
}
