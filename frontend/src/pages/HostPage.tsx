import { useMutation } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Button, Card, ErrorText, Page, ParticipantList } from '../components/ui'
import { setToken } from '../lib/api'
import { closeRoom, errorMessage } from '../lib/rooms'
import { useRoomState } from '../lib/useRoomState'

const isLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)

export default function HostPage() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const state = useRoomState(roomId)

  const close = useMutation({
    mutationFn: () => closeRoom(Number(roomId)),
    onSuccess: () => {
      navigate('/', { replace: true, state: { notice: 'Room closed.' } })
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
  if (me.role !== 'host') return <Navigate to={`/room/${room.id}`} replace />

  const joinUrl = `${window.location.origin}/join/${room.code}`

  function onClose() {
    if (window.confirm('Close this room for everyone?')) close.mutate()
  }

  return (
    <Page>
      <header className="space-y-1 text-center">
        <p className="text-slate-400">Room code</p>
        <h1 className="font-mono text-5xl font-bold tracking-[0.3em]">{room.code}</h1>
      </header>

      <Card>
        <div className="mx-auto w-fit rounded-lg bg-white p-3">
          <QRCodeSVG value={joinUrl} size={200} marginSize={0} />
        </div>
        <p className="text-center text-sm text-slate-400">Scan to join, or enter the code on the home page.</p>
        {isLocalhost && (
          <p className="text-center text-xs text-amber-400">
            This QR code points to localhost, which phones can't reach. Open the app with your PC's LAN IP
            (e.g. http://192.168.x.x:5173) instead.
          </p>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold">In the room ({participants.length})</h2>
        <ParticipantList participants={participants} meId={me.id} />
      </Card>

      <ErrorText>{close.isError && errorMessage(close.error)}</ErrorText>
      <Button variant="danger" onClick={onClose} disabled={close.isPending}>
        {close.isPending ? 'Closing…' : 'Close room'}
      </Button>
    </Page>
  )
}
