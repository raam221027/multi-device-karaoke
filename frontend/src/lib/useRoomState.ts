import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, getToken, setToken } from './api'
import { getRoomState } from './rooms'

// Polling stands in for real-time until Reverb is wired up in Phase 3.
const POLL_MS = 4000

/**
 * Room state for the current device. If the session is gone (room closed,
 * guest left, token expired) the device is sent home with a notice.
 */
export function useRoomState(roomId: string | undefined) {
  const navigate = useNavigate()
  const hasToken = getToken() !== null

  const query = useQuery({
    queryKey: ['room', roomId, 'state'],
    queryFn: () => getRoomState(roomId!),
    enabled: hasToken && roomId !== undefined,
    refetchInterval: POLL_MS,
    retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 3,
  })

  const ended =
    !hasToken || (query.error instanceof ApiError && [401, 403, 404].includes(query.error.status))

  useEffect(() => {
    if (!ended) return
    setToken(null)
    navigate('/', { replace: true, state: { notice: 'That room has ended or you are no longer in it.' } })
  }, [ended, navigate])

  return query
}
