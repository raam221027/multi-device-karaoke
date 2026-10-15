import { api } from './api'
import { getRoomState } from './rooms'
import type { RoomState, Session } from './types'

// The display keeps its own token so one browser can be both a phone and
// the TV (handy when testing) without the sessions overwriting each other.
const KEY = 'karaoke.display'

export type DisplaySession = { roomId: number; token: string }

export function getDisplaySession(): DisplaySession | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as DisplaySession) : null
  } catch {
    return null
  }
}

export function setDisplaySession(session: DisplaySession | null): void {
  try {
    if (session) localStorage.setItem(KEY, JSON.stringify(session))
    else localStorage.removeItem(KEY)
  } catch {
    // Storage unavailable; the display just won't survive a reload.
  }
}

function auth(session: DisplaySession): RequestInit {
  return { headers: { Authorization: `Bearer ${session.token}` } }
}

function post(session: DisplaySession, path: string, body?: unknown): Promise<null> {
  return api<null>(path, {
    ...auth(session),
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export async function connectDisplay(code: string): Promise<DisplaySession> {
  const session = await api<Session>('/rooms/display', { method: 'POST', body: JSON.stringify({ code }) })
  const display = { roomId: session.room.id, token: session.token }
  setDisplaySession(display)
  return display
}

export function getDisplayState(session: DisplaySession): Promise<RoomState> {
  return getRoomState(session.roomId, auth(session))
}

export function reportStarted(session: DisplaySession, itemId: number): Promise<null> {
  return post(session, `/rooms/${session.roomId}/playback/started`, { queue_item_id: itemId })
}

export function reportEnded(session: DisplaySession, itemId: number, reason: 'ended' | 'error'): Promise<null> {
  return post(session, `/rooms/${session.roomId}/playback/ended`, { queue_item_id: itemId, reason })
}

export function disconnectDisplay(session: DisplaySession): Promise<null> {
  return post(session, `/rooms/${session.roomId}/leave`)
}
