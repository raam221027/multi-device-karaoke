import { ApiError, api, setToken } from './api'
import type {
  CodeLookup,
  Me,
  QueueItem,
  RoomSettings,
  RoomState,
  SearchSuggestion,
  Session,
  Suggestions,
  Video,
} from './types'

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

export async function getRoomState(roomId: number | string, init?: RequestInit): Promise<RoomState> {
  const state = await api<Omit<RoomState, 'fetchedAt'>>(`/rooms/${roomId}/state`, init)
  return { ...state, fetchedAt: Date.now() }
}

// Callers clear the token after navigating away, so the room page doesn't
// mistake the missing token for an ended session.
export async function leaveRoom(roomId: number): Promise<void> {
  await post<null>(`/rooms/${roomId}/leave`)
}

export async function closeRoom(roomId: number): Promise<void> {
  await post<null>(`/rooms/${roomId}/close`)
}

function send<T>(method: 'PATCH' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  return api<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) })
}

export async function updateRoom(roomId: number, settings: RoomSettings): Promise<void> {
  await send('PATCH', `/rooms/${roomId}`, settings)
}

export async function setCanAddSongs(roomId: number, participantId: number, canAddSongs: boolean): Promise<void> {
  await send('PATCH', `/rooms/${roomId}/participants/${participantId}`, { can_add_songs: canAddSongs })
}

export async function removeParticipant(roomId: number, participantId: number): Promise<void> {
  await send('DELETE', `/rooms/${roomId}/participants/${participantId}`)
}

/** Hand the room to a guest. This phone stays in as a guest; neither phone needs a new token. */
export async function makeHost(roomId: number, participantId: number): Promise<void> {
  await post<null>(`/rooms/${roomId}/participants/${participantId}/make-host`)
}

/** Turn a guest's phone into the screen. It keeps its token and switches pages on its next poll. */
export async function makeDisplay(roomId: number, participantId: number): Promise<void> {
  await post<null>(`/rooms/${roomId}/participants/${participantId}/make-display`)
}

// Songs: the host sings like anyone else, so these are shared by every phone.

/** One page of YouTube results; pass `next_page` back as `page` for more. */
export async function searchSongs(
  roomId: number,
  q: string,
  karaoke: boolean,
  page?: string | null,
): Promise<{ results: Video[]; next_page: string | null }> {
  const params = new URLSearchParams({ q, karaoke: karaoke ? '1' : '0' })
  if (page) params.set('page', page)
  return api(`/rooms/${roomId}/search?${params}`)
}

/** Songs to offer before anyone types: this room's earlier songs and popular karaoke. */
export async function getSuggestions(roomId: number, page = 0, seed?: number): Promise<Suggestions> {
  const shuffle = seed === undefined ? '' : `&seed=${seed}`
  return api<Suggestions>(`/rooms/${roomId}/suggestions?page=${page}${shuffle}`)
}

/** Songs and artists matching what's typed so far (from iTunes, so no YouTube quota). */
export async function getAutocomplete(roomId: number, q: string): Promise<SearchSuggestion[]> {
  const data = await api<{ suggestions: SearchSuggestion[] }>(
    `/rooms/${roomId}/autocomplete?q=${encodeURIComponent(q)}`,
  )
  return data.suggestions
}

export async function addSong(roomId: number, videoId: string): Promise<QueueItem> {
  return (await post<{ data: QueueItem }>(`/rooms/${roomId}/queue`, { youtube_video_id: videoId })).data
}

export async function removeSong(roomId: number, itemId: number): Promise<void> {
  await send('DELETE', `/rooms/${roomId}/queue/${itemId}`)
}

export async function reorderQueue(roomId: number, itemIds: number[]): Promise<void> {
  await send('PUT', `/rooms/${roomId}/queue/order`, { item_ids: itemIds })
}

/** Names the song being skipped so a repeated or late tap can't skip the next one. */
export async function skipSong(roomId: number, itemId: number): Promise<void> {
  await post<null>(`/rooms/${roomId}/playback/skip`, { queue_item_id: itemId })
}

export async function setPaused(roomId: number, paused: boolean): Promise<void> {
  await post<null>(`/rooms/${roomId}/playback/${paused ? 'pause' : 'resume'}`)
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

/**
 * The room code in a scanned QR: an invite link ".../join/V6C8T7" from any
 * host (TVs encode the LAN address), or a bare code. Null for anything else.
 */
export function codeFromQr(text: string): string | null {
  const value = text.trim()
  const fromUrl = value.match(/^https?:\/\/[^/]+\/join\/([^/?#]+)\/?(?:[?#].*)?$/i)?.[1]
  const code = normalizeCode(fromUrl ? decodeURIComponent(fromUrl) : value)
  return /^[A-Z0-9]{6}$/.test(code) ? code : null
}

/** The code from a display QR (`/display?code=…`), or null for anything else. */
export function displayCodeFromQr(text: string): string | null {
  const match = text.trim().match(/^https?:\/\/[^/]+\/display\/?\?(?:[^#]*&)?code=([^&#]+)/i)?.[1]
  if (!match) return null
  const code = normalizeCode(decodeURIComponent(match))
  return /^[A-Z0-9]{6}$/.test(code) ? code : null
}
