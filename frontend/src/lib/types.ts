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
  role: Role
  status: 'pending' | 'approved' | 'rejected' | 'kicked'
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
  position: number
  status: 'queued' | 'playing' | 'played' | 'skipped' | 'removed' | 'failed'
  started_at: string | null
  added_by: { id: number; display_name: string | null }
}

export type Video = {
  id: string
  title: string
  /** On suggestions, from the server's catalogue lookup; search results only have the title. */
  song_title?: string | null
  artist?: string | null
  channel_title: string | null
  thumbnail_url: string | null
  duration_seconds: number | null
}

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
