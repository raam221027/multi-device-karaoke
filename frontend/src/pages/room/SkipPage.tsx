import { Navigate, useNavigate } from 'react-router-dom'
import * as icons from '../../assets/icons'
import { useRoom, useRoomMutation } from '../../lib/roomContext'
import { ConfirmCard, DangerTile } from '../../components/songs'
import { Avatar, Button, ErrorText, PageHeading, Screen, StatusPill } from '../../components/ui'
import { formatDuration, songArtist, songName, useElapsed } from '../../lib/format'
import { errorMessage, skipSong } from '../../lib/rooms'

export default function SkipPage() {
  const { state, roomId, base, isHost } = useRoom()
  const navigate = useNavigate()
  const elapsed = useElapsed(state)
  const { current, upcoming } = state.queue

  // Remember which song this screen is about: if it changes underneath us,
  // the server ignores the stale skip instead of skipping the next singer.
  const skip = useRoomMutation((itemId: number) => skipSong(roomId, itemId), {
    onSuccess: () => navigate(base, { replace: true }),
  })

  if (!current || (!isHost && !state.room.guests_can_skip && current.added_by.id !== state.me.id)) return <Navigate to={base} replace />

  const mine = current.added_by.id === state.me.id
  const singer = mine ? 'you' : (current.added_by.display_name ?? 'the singer')
  const next = upcoming[0]

  return (
    <Screen>
      <PageHeading back={{ to: base, label: 'Back to live room' }} title="Ready for the next one?" />

      <ConfirmCard
        tile={<DangerTile icon={icons.skipForwardTile} />}
        title={mine ? 'Skip your song?' : `Skip ${current.added_by.display_name}’s song?`}
        actions={
          <>
            <ErrorText>{skip.isError && errorMessage(skip.error)}</ErrorText>
            <Button variant="danger" onClick={() => skip.mutate(current.id)} disabled={skip.isPending}>
              {next ? `Yes, skip to ${next.added_by.id === state.me.id ? 'you' : next.added_by.display_name}` : 'Yes, skip it'}
            </Button>
            <Button onClick={() => navigate(base)}>{mine ? 'Keep singing' : `Keep ${singer} singing`}</Button>
          </>
        }
      >
        <p className="-mt-3 text-[14px] leading-[1.45] text-muted">
          {songName(current)} will end now and leave the queue.{' '}
          {mine ? 'The mic passes to whoever is next.' : `Check that ${singer} is ready to pass the mic.`}
        </p>

        <div className="flex items-center gap-3 border-b border-line pb-5">
          <Avatar id={current.added_by.id} name={current.added_by.display_name} size={38} />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <p className="truncate text-[15px] font-bold">{songName(current)}</p>
            <p className="text-[12px] text-muted">
              {current.added_by.display_name} · {formatDuration(elapsed)} / {formatDuration(current.duration_seconds)}
            </p>
          </div>
        </div>

        {next ? (
          <div className="flex flex-col gap-3">
            <StatusPill>Next in line</StatusPill>
            <div className="flex items-center gap-3">
              <Avatar id={next.added_by.id} name={next.added_by.display_name} size={38} />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <p className="truncate text-[15px] font-bold">{songName(next)}</p>
                <p className="truncate text-[12px] text-muted">
                  {[next.added_by.display_name, songArtist(next)].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>
            <p className="text-[11px] leading-[1.45] text-muted">
              The TV may need a tap to start the next video with sound.
            </p>
          </div>
        ) : (
          <p className="text-[12px] leading-[1.45] text-muted">
            Nothing is queued after this. The TV goes back to the invitation until someone adds a song.
          </p>
        )}
      </ConfirmCard>
    </Screen>
  )
}
