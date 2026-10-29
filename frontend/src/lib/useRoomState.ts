import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, getToken, setToken } from './api'
import { getRoomState } from './rooms'
import type { RoomState } from './types'
import { useRoomChannel } from './useRoomChannel'

// Reverb says when the room changes; polling is the fallback for when it can't.
const POLL_MS = 4000
const LIVE_POLL_MS = 30_000

/**
 * Room state for the current device. If the session is gone (room closed,
 * guest left, token expired) the device is sent home with a notice.
 */
export function useRoomState(roomId: string | undefined) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const token = getToken()
  const hasToken = token !== null
  const queryKey = ['room', roomId, 'state']

  const live = useRoomChannel(roomId, token, (version) => {
    // Skip signals this device already has, like the echo of its own change.
    const cached = queryClient.getQueryData<RoomState>(queryKey)
    if (version !== undefined && cached && cached.room.version >= version) return
    void queryClient.invalidateQueries({ queryKey })
  })

  const query = useQuery({
    queryKey,
    queryFn: () => getRoomState(roomId!),
    enabled: hasToken && roomId !== undefined,
    refetchInterval: live ? LIVE_POLL_MS : POLL_MS,
    retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 3,
  })

  const ended =
    !hasToken || (query.error instanceof ApiError && [401, 403, 404].includes(query.error.status))

  useEffect(() => {
    if (!ended) return
    setToken(null)
    // Drop the failed state, or rejoining this room later would hit it and bounce home again.
    queryClient.removeQueries({ queryKey: ['room', roomId] })
    navigate('/', { replace: true, state: { notice: 'That room has ended or you are no longer in it.' } })
  }, [ended, navigate, queryClient, roomId])

  return query
}
