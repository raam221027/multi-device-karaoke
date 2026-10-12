import { useMutation, useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, Card, ErrorText, Page, TextInput } from '../components/ui'
import { ApiError } from '../lib/api'
import { errorMessage, joinRoom, lookupCode, normalizeCode } from '../lib/rooms'

function Problem({ title, detail }: { title: string; detail: string }) {
  return (
    <Page>
      <Card>
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="text-slate-400">{detail}</p>
      </Card>
      <Link to="/" className="text-center text-fuchsia-400 underline">
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

  const join = useMutation({
    mutationFn: () => joinRoom(code, name.trim()),
    onSuccess: (session) => navigate(`/room/${session.room.id}`, { replace: true }),
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    join.mutate()
  }

  if (room.isPending) {
    return (
      <Page>
        <p className="text-center text-slate-400">Finding room {code}…</p>
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
        <p className="text-slate-400">Joining room</p>
        <h1 className="font-mono text-4xl font-bold tracking-[0.3em]">{room.data.code}</h1>
      </header>

      <Card>
        <form onSubmit={onSubmit} className="space-y-3">
          <label htmlFor="name" className="font-semibold">
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
    </Page>
  )
}
