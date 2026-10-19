import { useMutation, useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Button, Card, ErrorText, Page, TextInput } from '../components/ui'
import { ApiError, getToken } from '../lib/api'
import { clearDisplayEnded, connectDisplay, displayEnded } from '../lib/display'
import { errorMessage, getMe, joinRoom, lookupCode, normalizeCode } from '../lib/rooms'

function Problem({ title, detail }: { title: string; detail: string }) {
  return (
    <Page>
      <Card>
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="text-muted">{detail}</p>
      </Card>
      <Link to="/" className="text-center text-accent">
        Back to start
      </Link>
    </Page>
  )
}

export default function JoinPage() {
  const code = normalizeCode(useParams().code ?? '')
  const navigate = useNavigate()
  const [name, setName] = useState('')

  const room = useQuery({
    queryKey: ['code', code],
    queryFn: () => lookupCode(code),
    retry: false,
  })

  // Someone who closed the browser and scans again is already in: send them back
  // in as themselves rather than adding them a second time. Keyed by token, so a
  // session they've since left can't answer from the cache.
  const token = getToken()
  const me = useQuery({ queryKey: ['me', token], queryFn: getMe, enabled: token !== null, retry: false })

  const join = useMutation({
    mutationFn: () => joinRoom(code, name.trim()),
    onSuccess: (session) => {
      clearDisplayEnded()
      navigate(`/room/${session.room.id}`, { replace: true })
    },
  })

  // A device that was the screen until it got replaced can take the screen back instead.
  const wasScreen = displayEnded()
  const screen = useMutation({
    mutationFn: () => connectDisplay(code),
    onSuccess: () => navigate('/display', { replace: true }),
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    join.mutate()
  }

  if (me.data) {
    const { room: joined, participant } = me.data
    const active =
      joined.code === code &&
      joined.status === 'open' &&
      (participant.role === 'host' || participant.role === 'guest') &&
      (participant.status === 'approved' || participant.status === 'pending')
    if (active) return <Navigate to={`/${participant.role === 'host' ? 'host' : 'room'}/${joined.id}`} replace />
  }

  if (room.isPending || me.isLoading) {
    return (
      <Page>
        <p className="text-center text-muted">Finding room {code}…</p>
      </Page>
    )
  }

  if (room.isError) {
    return room.error instanceof ApiError && room.error.status === 404 ? (
      <Problem title="Room not found" detail={`No open room uses the code ${code}. Check it with the host.`} />
    ) : (
      <Problem title="Can't look up that room" detail={errorMessage(room.error)} />
    )
  }

  if (!room.data.joinable) {
    return <Problem title="Room is locked" detail="The host isn't letting new people in right now." />
  }

  return (
    <Page>
      <header className="space-y-1 text-center">
        <p className="text-muted">Joining room</p>
        <h1 className="text-[38px] font-bold tracking-[0.08em]">{room.data.code}</h1>
      </header>

      <Card>
        <form onSubmit={onSubmit} className="space-y-3">
          <label htmlFor="name" className="text-[15px] font-semibold">
            What should we call you?
          </label>
          <TextInput
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            maxLength={30}
            autoComplete="nickname"
            autoFocus
          />
          <ErrorText>{join.isError && errorMessage(join.error)}</ErrorText>
          <Button type="submit" disabled={!name.trim() || join.isPending}>
            {join.isPending ? 'Joining…' : 'Join room'}
          </Button>
        </form>
      </Card>

      {wasScreen && (
        <div className="flex flex-col gap-2">
          <Button variant="secondary" onClick={() => screen.mutate()} disabled={screen.isPending || join.isPending}>
            {screen.isPending ? 'Connecting…' : 'Use this device as the display instead'}
          </Button>
          <p className="text-center text-[14px] text-muted">This replaces the screen that’s playing now.</p>
          <ErrorText>{screen.isError && errorMessage(screen.error)}</ErrorText>
        </div>
      )}
    </Page>
  )
}
