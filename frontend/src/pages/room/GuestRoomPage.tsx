import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import * as icons from '../../assets/icons'
import { useRoom } from '../../lib/roomContext'
import { Avatar, Button, ErrorText, Lead, Note, PageHeading, Screen, StatusPill } from '../../components/ui'
import { setToken } from '../../lib/api'
import { phones, plural, singerStatus } from '../../lib/format'
import { errorMessage, leaveRoom } from '../../lib/rooms'

/** The guest's Room tab: who's here, what you're allowed to do, and leaving. */
export default function GuestRoomPage() {
  const { state, roomId } = useRoom()
  const navigate = useNavigate()
  const { room, me } = state
  const people = phones(state.participants)
  const host = people.find((p) => p.role === 'host')

  const leave = useMutation({
    mutationFn: () => leaveRoom(roomId),
    onSuccess: () => {
      navigate('/', { replace: true, state: { notice: 'You left the room.' } })
      setToken(null)
    },
  })

  const canAdd = room.allow_song_additions && me.can_add_songs

  return (
    <Screen>
      <PageHeading eyebrow={`${plural(people.length, 'person', 'people')} · Room ${room.code}`} title={room.name ?? 'The room'} />
      <Lead>You’re in as {me.display_name}. Add songs from Search and watch the TV for your turn.</Lead>

      <section>
        {people.map((p) => (
          <div key={p.id} className="flex items-center gap-2.5 border-b border-line py-3.5">
            <Avatar id={p.id} name={p.display_name} size={36} />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <p className="truncate text-[14px]">{p.id === me.id ? `${p.display_name} · You` : p.display_name}</p>
              <p className="text-[10px] text-muted">{singerStatus(state, p.id) ?? (p.role === 'host' ? 'Host' : 'Joined')}</p>
            </div>
            {p.role === 'host' && <StatusPill>Host</StatusPill>}
          </div>
        ))}
      </section>

      <Note icon={icons.shieldCheck}>
        {canAdd ? 'You can add songs.' : 'The host has paused song adding for you.'}{' '}
        {room.guests_can_skip ? 'Guests can skip the current song.' : 'You can skip your own song.'}
      </Note>

      <p className="text-[12px] leading-[1.45] text-muted">
        Want to run the room? Ask {host?.display_name ?? 'the host'} to make you the host from their Guests tab. This
        phone switches over on its own.
      </p>

      <ErrorText>{leave.isError && errorMessage(leave.error)}</ErrorText>
      <Button variant="danger" onClick={() => leave.mutate()} disabled={leave.isPending}>
        {leave.isPending ? 'Leaving…' : 'Leave room'}
      </Button>
    </Screen>
  )
}
