import { useMutation, useQueryClient, type MutationFunction } from '@tanstack/react-query'
import { createContext, useContext } from 'react'
import type { RoomState } from './types'

export type RoomContextValue = {
  state: RoomState
  roomId: number
  /** "/host/12" or "/room/12": every screen links relative to it. */
  base: string
  isHost: boolean
}

export const RoomContext = createContext<RoomContextValue | null>(null)

export function useRoom(): RoomContextValue {
  const room = useContext(RoomContext)
  if (!room) throw new Error('useRoom() used outside a room layout')
  return room
}

/** A mutation that refreshes room state when it settles, so changes show up at once. */
export function useRoomMutation<TData = unknown, TVariables = void>(
  mutationFn: MutationFunction<TData, TVariables>,
  options: { onSuccess?: (data: TData, variables: TVariables) => void } = {},
) {
  const { roomId } = useRoom()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn,
    onSuccess: options.onSuccess,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['room', String(roomId), 'state'] }),
  })
}
