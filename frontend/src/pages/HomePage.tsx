import { useMutation, useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import friendsSinging from '../assets/friends-singing.jpg'
import * as icons from '../assets/icons'
import { Button, ButtonLink, ErrorText, Icon, TextInput } from '../components/ui'
import { api, getToken } from '../lib/api'
import { createRoom, errorMessage, getMe, normalizeCode } from '../lib/rooms'

type Health = { status: string; db: boolean; time: string }

/** Only speaks up when the server can't be reached. */
function ServerWarning() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api<Health>('/health'),
    retry: false,
  })

  if (health.isPending || (health.data?.status === 'ok' && health.data.db)) return null
  return <p className="text-center text-[11px] text-danger">Can’t reach the server right now.</p>
}

function ResumeSession() {
  const me = useQuery({
    queryKey: ['me'],
    queryFn: getMe,
    enabled: getToken() !== null,
    retry: false,
  })

  if (!me.data || me.data.room.status !== 'open' || me.data.participant.role === 'display') return null

  const { room, participant } = me.data
  const to = participant.role === 'host' ? `/host/${room.id}` : `/room/${room.id}`

  return (
    <Link to={to} className="flex items-center justify-between gap-3 rounded-2xl bg-accent-soft p-4 text-[13px] text-accent">
      <span>
        Back to <strong>{room.name ?? room.code}</strong> as {participant.display_name}
      </span>
      <span aria-hidden>→</span>
    </Link>
  )
}

/** "Website entry": create a room (become the host) or join one by code. */
export default function HomePage() {
  const navigate = useNavigate()
  const state = useLocation().state as { notice?: string; join?: boolean } | null
  const notice = state?.notice

  // The scan page's "Enter code instead" lands here with the code field open.
  const [mode, setMode] = useState<'idle' | 'create' | 'join'>(state?.join ? 'join' : 'idle')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')

  const create = useMutation({
    mutationFn: () => createRoom(name.trim()),
    onSuccess: (session) => navigate(`/host/${session.room.id}/invite`),
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
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-[22px] px-5 py-6">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon src={icons.audioLinesBrand} size={26} />
          <span className="text-[25px] font-extrabold">Videokehan</span>
        </div>
        <span className="text-[11px] text-muted">Good company. Great songs.</span>
      </header>

      {notice && <p className="rounded-xl bg-surface p-3 text-center text-[13px] text-muted">{notice}</p>}

      <div className="relative h-[278px] overflow-hidden rounded-3xl">
        <img src={friendsSinging} alt="Friends singing karaoke together at home" className="absolute inset-0 size-full object-cover" />
        <div className="absolute bottom-4 left-4 flex items-center gap-[7px] rounded-full bg-bg px-3 py-2">
          <Icon src={icons.sparkles} size={14} />
          <span className="text-[11px] font-semibold">Your living room. Your main stage.</span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h1 className="text-[40px] leading-[1.05] font-extrabold">
          Big choruses.
          <br />
          <span className="text-accent">Little setup.</span>
        </h1>
        <p className="text-[15px] leading-[1.45] text-muted">
          Bring everyone into the song. Host from your phone, share a QR, and let the queue fill up.
        </p>
      </div>

      <ResumeSession />

      <div className="flex flex-col gap-2.5">
        {mode === 'create' ? (
          <form onSubmit={onCreate} className="flex flex-col gap-2.5">
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              aria-label="Your name"
              maxLength={30}
              autoComplete="nickname"
              autoFocus
            />
            <ErrorText>{create.isError && errorMessage(create.error)}</ErrorText>
            <Button type="submit" icon={icons.plusOnAccent} disabled={!name.trim() || create.isPending}>
              {create.isPending ? 'Creating…' : 'Create room'}
            </Button>
          </form>
        ) : (
          <Button icon={icons.plusOnAccent} onClick={() => setMode('create')}>
            Create room
          </Button>
        )}

        {mode === 'join' ? (
          <form onSubmit={onJoin} className="flex flex-col gap-2.5">
            <TextInput
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Room code"
              aria-label="Room code"
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={8}
              autoFocus
              className="text-center font-bold tracking-[0.3em] uppercase"
            />
            <Button type="submit" variant="secondary" disabled={normalizeCode(code).length !== 6}>
              Join room
            </Button>
          </form>
        ) : (
          <Button variant="secondary" onClick={() => setMode('join')}>
            Join with a room code
          </Button>
        )}

        <ButtonLink to="/scan" variant="secondary" icon={icons.scanQr}>
          Scan QR to join
        </ButtonLink>

        <p className="text-center text-[12px] leading-[1.45] text-muted">No downloads. No accounts. No emails.</p>
      </div>

      <ol className="flex justify-between pt-2 text-[11px]">
        {['Create a room', 'Invite your people', 'Sing together'].map((step, i) => (
          <li key={step} className="flex flex-col gap-1.5">
            <span className="font-bold text-accent">0{i + 1}</span>
            <span className="text-muted">{step}</span>
          </li>
        ))}
      </ol>

      <ServerWarning />
      <p className="text-center text-[10px] leading-[1.45] text-muted">Karaoke videos powered by YouTube · Browser-based</p>
    </main>
  )
}
