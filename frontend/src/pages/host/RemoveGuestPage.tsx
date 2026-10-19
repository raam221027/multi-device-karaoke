import { Navigate, useNavigate, useParams } from 'react-router-dom'
import * as icons from '../../assets/icons'
import { useRoom, useRoomMutation } from '../../lib/roomContext'
import { Avatar, Button, ErrorText, Icon, PageHeading, Screen, StatusPill, TextLink } from '../../components/ui'
import { displayLabel, plural } from '../../lib/format'
import { errorMessage, removeParticipant } from '../../lib/rooms'

/** "Remove guest · Confirmation". Also disconnects the display. */
export default function RemoveGuestPage() {
  const { state, roomId, base } = useRoom()
  const navigate = useNavigate()
  const participantId = Number(useParams().participantId)
  const guestsPath = `${base}/guests`

  const remove = useRoomMutation(() => removeParticipant(roomId, participantId), {
    onSuccess: () => navigate(guestsPath, { replace: true }),
  })

  const guest = state.participants.find((p) => p.id === participantId && p.role !== 'host')
  if (!guest) return remove.isPending || remove.isSuccess ? null : <Navigate to={guestsPath} replace />

  const isDisplay = guest.role === 'display'
  const waiting = state.queue.upcoming.filter((item) => item.added_by.id === guest.id).length
  const singing = state.queue.current?.added_by.id === guest.id

  return (
    <Screen>
      <PageHeading back={{ to: guestsPath, label: 'Back to guests' }} title="Guest controls" />

      <section className="flex flex-col gap-6 rounded-3xl bg-surface p-[22px]">
        <div className="flex flex-col items-center gap-3">
          {isDisplay ? (
            <span className="flex size-[68px] items-center justify-center rounded-full bg-surface-2">
              <Icon src={icons.monitor} size={30} />
            </span>
          ) : (
            <Avatar id={guest.id} name={guest.display_name} size={68} />
          )}
          {!isDisplay &&
            (guest.can_add_songs ? (
              <StatusPill>{singing ? 'Singing now' : 'Can add songs'}</StatusPill>
            ) : (
              <StatusPill tone="danger">Additions blocked</StatusPill>
            ))}
        </div>

        <div className="flex flex-col gap-3 text-center">
          <h2 className="text-[28px] font-bold">
            {isDisplay ? `Disconnect ${displayLabel(guest)}?` : `Remove ${guest.display_name}?`}
          </h2>
          <p className="text-[15px] leading-[1.45] text-muted">
            {isDisplay
              ? 'It stops playing and goes back to its connect screen. Everyone keeps their place in the queue. To move playback instead, just connect the new screen.'
              : `${guest.display_name}’s current browser session will lose access to this room. Everyone else keeps singing.`}
          </p>
        </div>

        {!isDisplay && (
          <div className="flex flex-col gap-[15px] rounded-[14px] bg-bg p-4">
            <div className="flex items-start gap-2.5">
              <Icon src={icons.listMusicMuted} size={18} />
              <p className="flex-1 text-[14px] leading-[1.45] text-muted">
                {waiting === 0
                  ? `${guest.display_name} has no songs waiting. No songs will be removed.`
                  : `${guest.display_name}’s ${plural(waiting, 'waiting song')} will be removed.`}
                {singing && ' The song playing now finishes first.'}
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <Icon src={icons.link} size={18} />
              <p className="flex-1 text-[14px] leading-[1.45] text-muted">
                The invite link stays active. To stop new joins, turn on “Lock room &amp; hide QR code” in Room.
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2.5">
          <ErrorText>{remove.isError && errorMessage(remove.error)}</ErrorText>
          <Button variant="danger" icon={icons.userMinusButton} onClick={() => remove.mutate()} disabled={remove.isPending}>
            {isDisplay ? `Disconnect ${displayLabel(guest)}` : `Remove ${guest.display_name}`}
          </Button>
          <Button variant="secondary" onClick={() => navigate(guestsPath)}>
            {isDisplay ? 'Keep it connected' : `Keep ${guest.display_name} in the room`}
          </Button>
          {isDisplay ? (
            <TextLink to={`${base}/invite/tv`} className="text-center">
              Switch to another display instead
            </TextLink>
          ) : (
            <TextLink to={`${guestsPath}/${guest.id}/make-host`} className="text-center">
              Make {guest.display_name} the host instead
            </TextLink>
          )}
        </div>
      </section>

      {!isDisplay && (
        <p className="text-center text-[14px] leading-[1.45] text-muted">
          {guest.can_add_songs
            ? `Just want to stop new songs? Turn off ${guest.display_name}’s “Can add” permission instead.`
            : `Just want to stop new songs? ${guest.display_name}’s “Can add” permission is already off.`}
        </p>
      )}
    </Screen>
  )
}
