import { useMutation, useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Button, Card, ErrorText, Page, TextInput } from '../components/ui'
import { api, getToken } from '../lib/api'
import { createRoom, errorMessage, getMe, normalizeCode } from '../lib/rooms'

type Health = { status: string; db: boolean; time: string }

function HealthFooter() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api<Health>('/health'),
    retry: false,
  })

  const ok = health.data?.status === 'ok' && health.data.db
  const text = health.isPending ? 'checking server…' : ok ? 'server ok' : 'server unreachable'
  const color = health.isPending ? 'bg-slate-500' : ok ? 'bg-emerald-500' : 'bg-rose-500'

  return (
    <footer className="flex items-center justify-center gap-2 text-xs text-slate-500">
      <span className={`size-2 rounded-full ${color}`} />
      {text}
    </footer>
  )
}

function ResumeSession() {
  const me = useQuery({
    queryKey: ['me'],
    queryFn: getMe,
    enabled: getToken() !== null,
    retry: false,
  })

  if (!me.data || me.data.room.status !== 'open') return null

  const { room, participant } = me.data
  const to = participant.role === 'host' ? `/host/${room.id}` : `/room/${room.id}`

  return (
    <Link
      to={to}
      className="block rounded-xl border border-fuchsia-800 bg-fuchsia-950/40 p-4 text-center hover:bg-fuchsia-950"
    >
      Rejoin room <span className="font-mono font-bold tracking-widest">{room.code}</span> as{' '}
      {participant.display_name}
    </Link>
  )
}

export default function HomePage() {
  const navigate = useNavigate()
  const notice = (useLocation().state as { notice?: string } | null)?.notice

  const [name, setName] = useState('')
  const [code, setCode] = useState('')

  const create = useMutation({
    mutationFn: () => createRoom(name.trim()),
    onSuccess: (session) => navigate(`/host/${session.room.id}`),
  })

  function onCreate(e: FormEvent) {
    e.preventDefault()
    create.mutate()
  }

  function onJoin(e: FormEvent) {
    e.preventDefault()
    const normalized = normalizeCode(code)
    if (normalized) navigate(`/join/${normalized}`)
  }

  return (
    <Page>
      <header className="space-y-1 text-center">
        <h1 className="text-3xl font-bold">Multi-Phone Karaoke</h1>
        <p className="text-slate-400">Everyone queues songs from their own phone.</p>
      </header>

      {notice && <p className="rounded-lg bg-slate-800 p-3 text-center text-sm text-slate-300">{notice}</p>}

      <ResumeSession />

      <Card>
        <form onSubmit={onJoin} className="space-y-3">
          <h2 className="font-semibold">Join a room</h2>
          <TextInput
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Room code"
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={8}
            className="text-center font-mono tracking-[0.3em] uppercase"
          />
          <Button type="submit" disabled={normalizeCode(code).length !== 6}>
            Join
          </Button>
        </form>
      </Card>

      <Card>
        <form onSubmit={onCreate} className="space-y-3">
          <h2 className="font-semibold">Host a new room</h2>
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            maxLength={30}
            autoComplete="nickname"
          />
          <ErrorText>{create.isError && errorMessage(create.error)}</ErrorText>
          <Button type="submit" variant="secondary" disabled={!name.trim() || create.isPending}>
            {create.isPending ? 'Creating…' : 'Create room'}
          </Button>
        </form>
      </Card>

      <HealthFooter />
    </Page>
  )
}
