import { useMutation } from '@tanstack/react-query'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Button, Card, ErrorText, Page, ParticipantList } from '../components/ui'
import { setToken } from '../lib/api'
import { errorMessage, leaveRoom } from '../lib/rooms'
import { useRoomState } from '../lib/useRoomState'

export default function RoomPage() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const state = useRoomState(roomId)

  const leave = useMutation({
    mutationFn: () => leaveRoom(Number(roomId)),
    onSuccess: () => {
      navigate('/', { replace: true, state: { notice: 'You left the room.' } })
      setToken(null)
    },
  })

  if (!state.data) {
    return (
      <Page>
        <p className="text-center text-slate-400">Loading room…</p>
      </Page>
    )
  }

  const { room, participants, me } = state.data
  if (me.role === 'host') return <Navigate to={`/host/${room.id}`} replace />

  return (
    <Page>
      <header className="space-y-1 text-center">
        <p className="text-slate-400">You're in room</p>
        <h1 className="font-mono text-4xl font-bold tracking-[0.3em]">{room.code}</h1>
        <p className="text-slate-400">as {me.display_name}</p>
      </header>

      <Card>
        <p className="text-slate-400">Song search and the queue arrive in the next update.</p>
      </Card>

      <Card>
        <h2 className="font-semibold">In the room ({participants.length})</h2>
        <ParticipantList participants={participants} meId={me.id} />
      </Card>

      <ErrorText>{leave.isError && errorMessage(leave.error)}</ErrorText>
      <Button variant="secondary" onClick={() => leave.mutate()} disabled={leave.isPending}>
        Leave room
      </Button>
    </Page>
  )
}
