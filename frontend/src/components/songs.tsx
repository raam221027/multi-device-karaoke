import type { ReactNode } from 'react'
import * as icons from '../assets/icons'
import { formatDuration, labelFor, parseSongTitle, songArtist, songMeta, songName } from '../lib/format'
import type { QueueItem, RoomState } from '../lib/types'
import { Avatar, Icon } from './ui'



/** One row of the shared queue: [leading] avatar, song, artist · time, singer, [trailing]. */
export function QueueRow({
  item,
  meId,
  leading,
  trailing,
}: {
  item: QueueItem
  meId: number
  leading?: ReactNode
  trailing?: ReactNode
}) {
  return (
    <div className="flex items-center gap-[11px] border-b border-line py-[13px]">
      {leading}
      <Avatar id={item.added_by.id} name={item.added_by.display_name} />
      <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
        <p className="truncate text-[15px]">{songName(item)}</p>
        <p className="truncate text-[13px] text-muted">{songMeta(item)}</p>
        <p className="text-[13px] text-accent">{labelFor(item.added_by, meId)}</p>
      </div>
      {trailing}
    </div>
  )
}

/** Shared layout for the confirmation screens (skip, remove song, remove guest, close). */
export function ConfirmCard({
  tile,
  title,
  children,
  actions,
}: {
  tile: ReactNode
  title: ReactNode
  children: ReactNode
  actions: ReactNode
}) {
  return (
    <section className="flex flex-col gap-6 rounded-3xl bg-surface p-6">
      {tile}
      <h2 className="text-[28px] leading-[1.1] font-bold">{title}</h2>
      {children}
      <div className="flex flex-col gap-2.5">{actions}</div>
    </section>
  )
}

export function DangerTile({ icon }: { icon: string }) {
  return (
    <span className="flex size-16 items-center justify-center rounded-[20px] bg-danger-soft">
      <Icon src={icon} size={30} />
    </span>
  )
}


/** The YouTube thumbnail stands in for the video, which plays on the TV display. */
function thumbnail(item: QueueItem): string {
  return item.thumbnail_url ?? `https://i.ytimg.com/vi/${item.youtube_video_id}/mqdefault.jpg`
}

/**
 * The live song: who's on the mic, a preview of what the TV is playing with
 * progress, and the song title.
 */
export function NowSinging({
  state,
  elapsed,
  onTogglePause,
}: {
  state: RoomState
  elapsed: number
  /** Host only: the centre badge pauses/resumes the TV. */
  onTogglePause?: () => void
}) {
  const current = state.queue.current!
  const paused = state.room.playback_status === 'paused'
  const duration = current.duration_seconds ?? 0
  const progress = duration > 0 ? Math.min(1, elapsed / duration) : 0
  const { isKaraoke } = parseSongTitle(current.title)
  const artist = songArtist(current)

  const badge = (
    <span className="flex size-12 items-center justify-center rounded-full bg-[rgba(16,17,21,0.8)]">
      <Icon src={paused ? icons.playBadge : icons.pauseBadge} size={24} />
    </span>
  )

  return (
    <section className="flex flex-col gap-[14px]">
      <div className="flex items-center gap-3">
        <Avatar id={current.added_by.id} name={current.added_by.display_name} size={44} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-[13px] font-semibold text-accent">ON THE MIC</p>
          <p className="truncate text-[22px] font-bold">{labelFor(current.added_by, state.me.id)}</p>
        </div>
        <Icon src={icons.micVocal} size={25} />
      </div>

      <div className="relative h-[197px] overflow-hidden rounded-[10px] bg-screen">
        <img src={thumbnail(current)} alt="" className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0 bg-black/40" />
        <div className="absolute top-3 left-3 flex items-center gap-[5px]">
          <Icon src={icons.youtube} size={19} />
          <span className="text-[12px] font-semibold text-white">
            YouTube · {state.display_connected ? 'playing on the TV' : 'waiting for the TV'}
          </span>
        </div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          {onTogglePause ? (
            <button type="button" onClick={onTogglePause} aria-label={paused ? 'Resume' : 'Pause'}>
              {badge}
            </button>
          ) : (
            badge
          )}
        </div>
        <div className="absolute inset-x-3 bottom-3 flex items-center gap-2.5">
          <Icon src={paused ? icons.playSmall : icons.pauseSmall} size={14} />
          <span className="text-[12px] text-white tabular-nums">
            {formatDuration(elapsed)} / {formatDuration(current.duration_seconds)}
          </span>
          <div className="flex h-[3px] flex-1 bg-white/40" role="progressbar" aria-valuenow={Math.round(progress * 100)}>
            <div className="h-full bg-accent" style={{ width: `${progress * 100}%` }} />
          </div>
          <Icon src={icons.maximize} size={14} />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <h2 className="truncate text-[23px] font-bold">{songName(current)}</h2>
        <p className="truncate text-[14px] text-muted">
          {[artist ?? current.channel_title, isKaraoke && 'Karaoke version', 'YouTube'].filter(Boolean).join(' · ')}
        </p>
      </div>
    </section>
  )
}
