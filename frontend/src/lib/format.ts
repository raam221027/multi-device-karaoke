import { useEffect, useState } from 'react'
import type { Participant, QueueItem, RoomState } from './types'

/** "Maya" → "MA", "Mary Ann" → "MA". */
export function initials(name: string | null | undefined): string {
  const words = (name ?? '?').trim().split(/\s+/).filter(Boolean)
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)
  return letters.toUpperCase()
}

const AVATAR_COLORS = ['bg-lilac', 'bg-peach', 'bg-accent', 'bg-muted'] as const

/** A stable avatar colour per participant. */
export function avatarColor(participantId: number): string {
  return AVATAR_COLORS[Math.abs(participantId) % AVATAR_COLORS.length]
}

/** Seconds → "3:52". */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '–:––'
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const rest = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${rest}` : `${m}:${rest}`
}

/** "~15 min" for the waiting songs. */
export function formatWait(items: QueueItem[]): string | null {
  const total = items.reduce((sum, item) => sum + (item.duration_seconds ?? 0), 0)
  return total > 0 ? `~${Math.max(1, Math.round(total / 60))} min` : null
}

export function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th')
  return `${n}${suffix}`
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

/** "Ben, Sam, Alex and Jules". */
export function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

export type SongTitle = { song: string; artist: string | null; isKaraoke: boolean }

/**
 * YouTube karaoke titles usually look like "ABBA - Dancing Queen (Karaoke Version)".
 * Split them into song and artist so rows read like the design.
 */
export function parseSongTitle(title: string): SongTitle {
  let rest = title
  const isKaraoke = /karaoke|instrumental|sing ?along/i.test(title)

  // Drop bracketed tags: (Karaoke Version), [Instrumental], 【カラオケ】…
  rest = rest.replace(/\s*[([【][^)\]】]*[)\]】]/g, '').trim()
  // Drop trailing tags after a pipe: "… | Karaoke Version | Sing King".
  rest = rest.split(/\s+\|\s+/)[0].trim()
  rest = rest.replace(/\s*\b(karaoke( version)?|instrumental|with lyrics|lyrics)\b\s*$/i, '').trim()

  // Drop dash-separated tags: "Jab Koi Baat - Karaoke with scrolling Lyrics", "… - Male Version - OPM Acoustic".
  const split = rest.split(/\s+[-–—]\s+/)
  const named = split.filter((part) => !/karaoke|lyrics|instrumental|version|acoustic|minus one/i.test(part))
  const parts = named.length ? named : split
  if (parts.length >= 2) {
    const [artist, ...song] = parts
    return { song: song.join(' - ') || rest, artist: artist || null, isKaraoke }
  }
  return { song: parts[0] || title, artist: null, isKaraoke }
}

/** "You" for the current device, otherwise the participant's name. */
export function nameFor(participant: { id: number; display_name: string | null }, meId: number): string {
  return participant.id === meId ? 'You' : (participant.display_name ?? 'Someone')
}

/** "Alex · You" for the current device, otherwise just the name. */
export function labelFor(participant: { id: number; display_name: string | null }, meId: number): string {
  const name = participant.display_name ?? 'Someone'
  return participant.id === meId ? `${name} · You` : name
}

/** People in the room: phones only, not the TV display. */
export function phones(participants: Participant[]): Participant[] {
  return participants.filter((p) => p.role !== 'display')
}

/**
 * Seconds into the current song, ticking each second. Uses the server's clock
 * (offset measured at fetch time) so a phone with the wrong time still agrees.
 */
export function useElapsed(state: RoomState | undefined): number {
  const [now, setNow] = useState(() => Date.now())
  const current = state?.queue.current
  const paused = state?.room.playback_status === 'paused'

  useEffect(() => {
    if (!current || paused) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [current, paused])

  if (!state || !current?.started_at) return 0

  const offset = Date.parse(state.server_time) - state.fetchedAt
  const serverNow = paused && state.room.paused_at ? Date.parse(state.room.paused_at) : now + offset
  const elapsed = (serverNow - Date.parse(current.started_at)) / 1000 - state.room.paused_seconds

  return Math.max(0, Math.min(elapsed, current.duration_seconds ?? Infinity))
}

/** "ABBA · 3:52", or "Sing King · 3:52" when the title has no artist. */
export function songMeta(item: Pick<QueueItem, 'title' | 'song_title' | 'artist' | 'channel_title' | 'duration_seconds'>): string {
  return [songArtist(item) ?? item.channel_title, formatDuration(item.duration_seconds)].filter(Boolean).join(' · ')
}

// The server looks up which half of "X - Y" is the song; the title parse is the fallback.
export function songName(item: Pick<QueueItem, 'title' | 'song_title'>): string {
  return item.song_title ?? parseSongTitle(item.title).song
}

export function songArtist(item: Pick<QueueItem, 'title' | 'artist' | 'song_title'>): string | null {
  return item.song_title ? item.artist : parseSongTitle(item.title).artist
}

/** "Maya is singing now" style status for a participant. */
export function singerStatus(state: RoomState, participantId: number): string | null {
  const { current, upcoming } = state.queue
  if (current?.added_by.id === participantId) return 'Singing now'
  if (upcoming[0]?.added_by.id === participantId) return 'Up next'
  const queued = upcoming.filter((item) => item.added_by.id === participantId).length
  return queued > 0 ? `${queued} ${queued === 1 ? 'song' : 'songs'} queued` : null
}

/** The screen's name: whose phone it is ("Ana - Display") or what joined by code ("PC - Display"). */
export function displayLabel(p: Pick<Participant, 'device' | 'display_name'>): string {
  return `${p.device ?? p.display_name ?? 'Screen'} - Display`
}
