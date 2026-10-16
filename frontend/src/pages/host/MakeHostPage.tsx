import { Navigate, useNavigate, useParams } from 'react-router-dom'
import * as icons from '../../assets/icons'
import { useRoom, useRoomMutation } from '../../lib/roomContext'
import { Avatar, Button, ErrorText, Icon, PageHeading, Screen, StatusPill } from '../../components/ui'
import { errorMessage, makeHost } from '../../lib/rooms'

/**
 * "Hand off host · Confirmation". Once the server agrees, the refetched state
 * says this phone is a guest and RoomLayout moves it to the guest screens.
 */
export default function MakeHostPage() {
  const { state, roomId, base } = useRoom()
  const navigate = useNavigate()
  const participantId = Number(useParams().participantId)
  const guestsPath = `${base}/guests`

  const handOff = useRoomMutation(() => makeHost(roomId, participantId))

  const guest = state.participants.find((p) => p.id === participantId && p.role === 'guest')
  if (!guest) return handOff.isPending || handOff.isSuccess ? null : <Navigate to={guestsPath} replace />

  return (
    <Screen>
      <PageHeading back={{ to: guestsPath, label: 'Back to guests' }} title="Hand off host" />

      <section className="flex flex-col gap-6 rounded-3xl bg-surface p-[22px]">
        <div className="flex flex-col items-center gap-3">
          <Avatar id={guest.id} name={guest.display_name} size={68} />
          <StatusPill>Next host</StatusPill>
        </div>

        <div className="flex flex-col gap-3 text-center">
          <h2 className="text-[28px] font-bold">Make {guest.display_name} the host?</h2>
          <p className="text-[14px] leading-[1.45] text-muted">
            {guest.display_name}’s phone gets the room settings, the guest list, the screen and playback controls. You
            stay in the room as a guest and keep your songs.
          </p>
        </div>

        <div className="flex flex-col gap-[15px] rounded-[14px] bg-bg p-4">
          <div className="flex items-start gap-2.5">
            <Icon src={icons.shieldCheck} size={18} />
            <p className="flex-1 text-[12px] leading-[1.45] text-muted">
              Only {guest.display_name} can hand it back. Moving to your other phone? Join from it as a guest first,
              then pick it here.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <ErrorText>{handOff.isError && errorMessage(handOff.error)}</ErrorText>
          <Button onClick={() => handOff.mutate()} disabled={handOff.isPending || handOff.isSuccess}>
            {handOff.isPending || handOff.isSuccess ? 'Handing off…' : `Make ${guest.display_name} host`}
          </Button>
          <Button variant="secondary" onClick={() => navigate(guestsPath)}>
            Keep hosting
          </Button>
        </div>
      </section>
    </Screen>
  )
}
