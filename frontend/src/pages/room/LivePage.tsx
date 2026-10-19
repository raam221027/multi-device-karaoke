import { Link, useNavigate } from 'react-router-dom'
import * as icons from '../../assets/icons'
import { useRoom, useRoomMutation } from '../../lib/roomContext'
import { NowSinging, QueueRow } from '../../components/songs'
import { Button, ButtonLink, ErrorText, Icon, PageHeading, Screen, SectionHeading, StatusPill, TextLink } from '../../components/ui'
import { phones, plural, useElapsed } from '../../lib/format'
import { errorMessage, setPaused } from '../../lib/rooms'

export default function LivePage() {
  const { state, roomId, base, isHost } = useRoom()
  const navigate = useNavigate()
  const elapsed = useElapsed(state)
  const { room, queue, me } = state

  const paused = room.playback_status === 'paused'
  const togglePause = useRoomMutation(() => setPaused(roomId, !paused))
  const canSkip = queue.current && (isHost || room.guests_can_skip || queue.current.added_by.id === me.id)
  const next = queue.upcoming[0]

  return (
    <Screen>
      <PageHeading
        eyebrow={isHost ? `Host · Room ${room.code}` : `Room ${room.code}`}
        title={room.name ?? 'Videokehan'}
        action={isHost && <TextLink to={`${base}/invite`}>Invite +</TextLink>}
      />

      <div className="flex items-center justify-between gap-3">
        <StatusPill>{!queue.current ? 'Waiting for a song' : paused ? 'Playback paused' : 'Live session'}</StatusPill>
        <span className="text-[12px] text-muted">
          {plural(phones(state.participants).length, 'person', 'people')} ·{' '}
          {plural(queue.upcoming.length, 'song')} waiting
        </span>
      </div>

      {queue.current ? (
        <NowSinging state={state} elapsed={elapsed} onTogglePause={isHost ? () => togglePause.mutate() : undefined} />
      ) : (
        <section className="flex flex-col items-center gap-4 rounded-2xl bg-surface p-6 text-center">
          <Icon src={icons.micVocal} size={25} />
          <div className="flex flex-col gap-2">
            <h2 className="text-[22px] font-bold">The mic is free.</h2>
            <p className="text-[14px] leading-[1.45] text-muted">
              Pick a song and it starts on the TV right away. {isHost && 'The host sings too.'}
            </p>
          </div>
          <ButtonLink to={`${base}/search`} icon={icons.searchOnAccent}>
            Find a song
          </ButtonLink>
        </section>
      )}

      {isHost && !state.display_connected && (
        <Link
          to={`${base}/invite/tv`}
          className="flex items-center gap-2.5 rounded-xl bg-surface p-3.5 text-[12px] leading-[1.45] text-muted"
        >
          <Icon src={icons.monitor} size={18} />
          <span className="flex-1">Songs play on a TV or laptop. No display is connected yet.</span>
          <span className="shrink-0 text-accent">Connect →</span>
        </Link>
      )}

      {isHost && queue.current && (
        <section className="flex flex-col gap-3 rounded-2xl border border-line p-3.5">
          <p className="text-[10px] font-bold text-muted">HOST CONTROLS</p>
          <div className="flex gap-2.5">
            <Button
              className="flex-1"
              icon={paused ? icons.playOnAccent : icons.pauseOnAccent}
              onClick={() => togglePause.mutate()}
              disabled={togglePause.isPending}
            >
              {paused ? 'Resume' : 'Pause'}
            </Button>
            <Button className="flex-1" variant="secondary" icon={icons.skipForward} onClick={() => navigate(`${base}/skip`)}>
              Skip song
            </Button>
          </div>
          <ErrorText>{togglePause.isError && errorMessage(togglePause.error)}</ErrorText>
          <p className="text-[11px] leading-[1.45] text-muted">
            {paused
              ? 'Tap Resume to continue. If the TV doesn’t respond, tap play on the TV.'
              : 'Pause and resume control the video on the TV display.'}
          </p>
          <p className="text-[10px] text-muted">
            Skip asks for confirmation before moving {next ? `to ${next.added_by.display_name}` : 'on'}.
          </p>
        </section>
      )}

      {!isHost && canSkip && (
        <Button variant="secondary" icon={icons.skipForward} onClick={() => navigate(`${base}/skip`)}>
          Skip song
        </Button>
      )}

      <section className="flex flex-col gap-0.5">
        <SectionHeading
          title="Up next"
          aside={
            <Link to={`${base}/queue`} className="text-accent">
              Full queue →
            </Link>
          }
        />
        {queue.upcoming.length === 0 ? (
          <p className="py-[13px] text-[13px] text-muted">Nothing queued yet. Add a song to keep the night going.</p>
        ) : (
          queue.upcoming.slice(0, 2).map((item, i) => (
            <QueueRow
              key={item.id}
              item={item}
              meId={me.id}
              leading={<span className="w-[15px] shrink-0 text-[13px] text-muted">{i + 1}</span>}
            />
          ))
        )}
      </section>
    </Screen>
  )
}
