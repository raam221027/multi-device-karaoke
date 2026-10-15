import { Navigate, useNavigate, useParams } from 'react-router-dom'
import * as icons from '../../assets/icons'
import { useRoom, useRoomMutation } from '../../lib/roomContext'
import { ConfirmCard, DangerTile } from '../../components/songs'
import { Avatar, Button, ErrorText, Icon, PageHeading, Screen, StatusPill } from '../../components/ui'
import { ordinal, songMeta, songName } from '../../lib/format'
import { errorMessage, removeSong } from '../../lib/rooms'

export default function RemoveSongPage() {
  const { state, roomId, base, isHost } = useRoom()
  const navigate = useNavigate()
  const itemId = Number(useParams().itemId)
  const queuePath = `${base}/queue`

  const remove = useRoomMutation(() => removeSong(roomId, itemId), {
    onSuccess: () => navigate(queuePath, { replace: true }),
  })

  const index = state.queue.upcoming.findIndex((item) => item.id === itemId)
  const item = state.queue.upcoming[index]
  const mine = item?.added_by.id === state.me.id

  // Gone (played, removed elsewhere) or not ours to remove: back to the queue.
  if (!item || (!isHost && !mine)) {
    return remove.isPending || remove.isSuccess ? null : <Navigate to={queuePath} replace />
  }

  const owner = mine ? 'your' : `${item.added_by.display_name}’s`
  const current = state.queue.current

  return (
    <Screen>
      <PageHeading back={{ to: queuePath, label: 'Back to shared queue' }} title="A little queue cleanup." />

      <ConfirmCard
        tile={<DangerTile icon={icons.listMinusTile} />}
        title="Remove this song?"
        actions={
          <>
            <ErrorText>{remove.isError && errorMessage(remove.error)}</ErrorText>
            <Button variant="danger" onClick={() => remove.mutate()} disabled={remove.isPending}>
              Remove {songName(item)}
            </Button>
            <Button onClick={() => navigate(queuePath)}>Keep it in the queue</Button>
          </>
        }
      >
        <p className="-mt-3 text-[14px] leading-[1.45] text-muted">
          This takes {owner} song out of the shared queue for everyone.
        </p>

        <div className="flex flex-col gap-4 rounded-[14px] bg-bg p-[18px]">
          <StatusPill>{ordinal(index + 1)} in the queue</StatusPill>
          <p className="text-[23px] font-bold">{songName(item)}</p>
          <p className="text-[13px] text-muted">{songMeta(item)}</p>
          <div className="flex items-center gap-2.5">
            <Avatar id={item.added_by.id} name={item.added_by.display_name} size={32} />
            <span className="text-[12px] text-muted">Added by {mine ? 'you' : item.added_by.display_name}</span>
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <Icon src={icons.music2} size={18} />
          <p className="flex-1 text-[12px] leading-[1.45] text-muted">
            {current
              ? `${current.added_by.id === state.me.id ? 'You keep' : `${current.added_by.display_name} keeps`} singing ${songName(current)}. `
              : ''}
            Everyone else keeps their place. {mine ? 'You' : item.added_by.display_name} can add another song.
          </p>
        </div>
      </ConfirmCard>
    </Screen>
  )
}
