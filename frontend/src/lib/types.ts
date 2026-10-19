export type Role = 'host' | 'guest' | 'display'

export type Room = {
  id: number
  code: string | null // null once the room is closed
  name: string | null
  status: 'open' | 'closed'
  is_locked: boolean
  requires_approval: boolean
  allow_song_additions: boolean
  guests_can_skip: boolean
  playback_status: 'playing' | 'paused'
  paused_at: string | null
  paused_seconds: number
  version: number
  closed_at: string | null
}

export type Participant = {
  id: number
  room_id: number
  display_name: string
  /** Set only for a screen that joined by code (Mobile, Tablet, PC, TV). */
  device: string | null
  role: Role
  status: 'pending' | 'approved' | 'rejected' | 'kicked' | 'left'
  can_add_songs: boolean
  joined_at: string
}

export type QueueItem = {
  id: number
  youtube_video_id: string
  title: string
  /** Song and artist from the server's catalogue lookup; null when it couldn't tell. */
  song_title: string | null
  artist: string | null
  channel_title: string | null
  thumbnail_url: string | null
  duration_seconds: number | null
  /** Times the TV swapped in another upload because the chosen one wouldn't play there. */
  video_swaps: number
  position: number
  status: 'queued' | 'playing' | 'played' | 'skipped' | 'removed' | 'failed'
  started_at: string | null
  added_by: { id: number; display_name: string | null }
}

export type Video = {
  id: string
  title: string
  /** From the server's catalogue lookup; null when it couldn't tell which half is the song. */
  song_title?: string | null
  artist?: string | null
  channel_title: string | null
  thumbnail_url: string | null
  duration_seconds: number | null
}

/** A song or artist offered while typing a search; `query` is what tapping it searches for. */
export type SearchSuggestion = { type: 'song' | 'artist'; label: string; artist?: string; query: string }

export type Suggestions = {
  popular: Video[]
  /** Which slice of the server's popular pool this is; asking past the end wraps to 0. */
  page: number
  pages: number
}

export type Session = {
  room: Room
  participant: Participant
  token: string
}

export type Me = Omit<Session, 'token'>

export type CodeLookup = {
  id: number
  code: string
  joinable: boolean
  is_locked: boolean
  requires_approval: boolean
}

export type RoomState = {
  room: Room
  participants: Participant[]
  me: Participant
  queue: { current: QueueItem | null; upcoming: QueueItem[] }
  display_connected: boolean
  server_time: string
  /** Client-side: Date.now() when this state arrived, to offset server_time. */
  fetchedAt: number
}

export type RoomSettings = Partial<Pick<Room, 'name' | 'is_locked' | 'allow_song_additions' | 'guests_can_skip'>>
