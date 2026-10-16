import { api, getToken, setToken } from './api'
import { getMe, getRoomState } from './rooms'
import type { RoomState, Session } from './types'

// The display keeps its own token so one browser can be both a guest phone and
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

// Set when this device stops being the screen (replaced, disconnected or the
// room closed). Rejoining then asks whether it wants back in as a singer or as
// the screen, instead of silently taking the screen back. Survives reloads.
const ENDED_KEY = 'karaoke.display.ended'

export function markDisplayEnded(): void {
  try {
    localStorage.setItem(ENDED_KEY, '1')
  } catch {
    // Storage unavailable; rejoining just won't ask.
  }
}

export function displayEnded(): boolean {
  try {
    return localStorage.getItem(ENDED_KEY) !== null
  } catch {
    return false
  }
}

export function clearDisplayEnded(): void {
  try {
    localStorage.removeItem(ENDED_KEY)
  } catch {
    // Storage unavailable; nothing to clear.
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

/** This browser's phone session, if it's still valid. */
export async function currentPhone() {
  if (!getToken()) return null
  try {
    return await getMe()
  } catch {
    return null
  }
}

/** What kind of device this browser is on, so the host can tell screens apart. */
export function deviceType(): 'Mobile' | 'Tablet' | 'PC' | 'TV' {
  const ua = navigator.userAgent
  if (/SmartTV|SMART-TV|Tizen|Web0S|webOS|HbbTV|BRAVIA|AFT|CrKey|GoogleTV/i.test(ua)) return 'TV'
  // iPadOS reports itself as a Mac; only the touch screen gives it away.
  const iPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  if (iPad || /Tablet/i.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) return 'Tablet'
  if (/Mobi|iPhone|Android/.test(ua)) return 'Mobile'
  return 'PC'
}

export async function connectDisplay(code: string): Promise<DisplaySession> {
  // A guest phone already in this room becomes the screen itself (same token),
  // so the room never sees one device as two people.
  const phone = await currentPhone()
  if (phone && phone.room.code === code && phone.participant.role === 'guest') {
    await api<null>(`/rooms/${phone.room.id}/use-as-display`, { method: 'POST' })
    phoneBecomesDisplay(phone.room.id)
    setToken(null)
    return getDisplaySession()!
  }

  const session = await api<Session>('/rooms/display', { method: 'POST', body: JSON.stringify({ code, device: deviceType() }) })
  const display = { roomId: session.room.id, token: session.token }
  setDisplaySession(display)
  clearDisplayEnded()
  return display
}

/**
 * The host turns this device into the screen, handing host to `participantId`
 * (a guest, or the current screen) in the same request so the room is never
 * without one. Roles change in place: every device keeps its token and
 * follows its new role on its next poll.
 */
export async function becomeDisplay(roomId: number, participantId: number): Promise<void> {
  await api<null>(`/rooms/${roomId}/become-display`, {
    method: 'POST',
    body: JSON.stringify({ participant_id: participantId }),
  })
}

/**
 * This phone's role is now `display`: its token becomes the display session.
 * Call it before navigating to /display; clear the phone token after, so the
 * room page doesn't mistake the missing token for an ended session.
 */
export function phoneBecomesDisplay(roomId: number): void {
  const token = getToken()
  if (token) setDisplaySession({ roomId, token })
  clearDisplayEnded()
}

/** The screen's role is now host or guest: its token becomes this browser's phone session. */
export function displayBecomesPhone(session: DisplaySession): void {
  setToken(session.token)
  setDisplaySession(null)
}

export function getDisplayState(session: DisplaySession): Promise<RoomState> {
  return getRoomState(session.roomId, auth(session))
}

export function reportStarted(session: DisplaySession, itemId: number): Promise<null> {
  return post(session, `/rooms/${session.roomId}/playback/started`, { queue_item_id: itemId })
}

export function reportEnded(
  session: DisplaySession,
  itemId: number,
  reason: 'ended' | 'error',
  error?: { code: number; videoId: string },
): Promise<null> {
  return post(session, `/rooms/${session.roomId}/playback/ended`, {
    queue_item_id: itemId,
    reason,
    code: error?.code,
    video_id: error?.videoId,
  })
}

export function disconnectDisplay(session: DisplaySession): Promise<null> {
  return post(session, `/rooms/${session.roomId}/leave`)
}
