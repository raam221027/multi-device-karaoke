export type Role = 'host' | 'guest' | 'display'

export type Room = {
  id: number
  code: string | null // null once the room is closed
  status: 'open' | 'closed'
  is_locked: boolean
  requires_approval: boolean
  version: number
  closed_at: string | null
}

export type Participant = {
  id: number
  room_id: number
  display_name: string
  role: Role
  status: 'pending' | 'approved' | 'rejected' | 'kicked'
  joined_at: string
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
}
