import { ApiError, api, setToken } from './api'
import type { CodeLookup, Me, RoomState, Session } from './types'

function post<T>(path: string, body?: unknown): Promise<T> {
  return api<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })
}

/** Store the device token from a create/join response. */
function start(session: Session): Session {
  setToken(session.token)
  return session
}

export async function createRoom(displayName: string): Promise<Session> {
  return start(await post<Session>('/rooms', { display_name: displayName }))
}

export async function joinRoom(code: string, displayName: string): Promise<Session> {
  return start(await post<Session>('/rooms/join', { code, display_name: displayName }))
}

export function lookupCode(code: string): Promise<CodeLookup> {
  return api<CodeLookup>(`/rooms/code/${encodeURIComponent(code)}`)
}

export function getMe(): Promise<Me> {
  return api<Me>('/me')
}

export function getRoomState(roomId: number | string): Promise<RoomState> {
  return api<RoomState>(`/rooms/${roomId}/state`)
}

// Callers clear the token after navigating away, so the room page doesn't
// mistake the missing token for an ended session.
export async function leaveRoom(roomId: number): Promise<void> {
  await post<null>(`/rooms/${roomId}/leave`)
}

export async function closeRoom(roomId: number): Promise<void> {
  await post<null>(`/rooms/${roomId}/close`)
}

/** Best human-readable message from an API failure. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return 'Too many attempts. Wait a minute and try again.'
    const body = error.body as { message?: string; errors?: Record<string, string[]> } | null
    const firstFieldError = body?.errors && Object.values(body.errors)[0]?.[0]
    return firstFieldError ?? body?.message ?? `Something went wrong (${error.status}).`
  }
  return 'Could not reach the server. Check your connection.'
}

/** Normalize a typed code the same way the server does. */
export function normalizeCode(code: string): string {
  return code.replace(/[\s-]+/g, '').toUpperCase()
}
