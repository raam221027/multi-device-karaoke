import { useMutation, useQuery } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useState, type FormEvent } from 'react'
import * as icons from '../assets/icons'
import YouTubePlayer from '../components/YouTubePlayer'
import { Button, ErrorText, Icon, TextInput } from '../components/ui'
import { ApiError } from '../lib/api'
import {
  connectDisplay,
  disconnectDisplay,
  getDisplaySession,
  getDisplayState,
  reportEnded,
  reportStarted,
  setDisplaySession,
  type DisplaySession,
} from '../lib/display'
import { songName } from '../lib/format'
import { errorMessage, normalizeCode } from '../lib/rooms'
import { joinUrl, publicHost } from '../lib/share'
import type { RoomState } from '../lib/types'

// The TV reacts to pause/skip from phones, so it polls faster than phones do.
const POLL_MS = 2000

function ConnectScreen({ notice, onConnected }: { notice?: string; onConnected: (s: DisplaySession) => void }) {
  const [code, setCode] = useState('')
  const connect = useMutation({ mutationFn: () => connectDisplay(normalizeCode(code)), onSuccess: onConnected })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    connect.mutate()
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-[22px] px-5 py-6">
      <div className="flex items-center gap-2">
        <Icon src={icons.audioLinesBrand} size={26} />
        <span className="text-[25px] font-extrabold">Videokehan</span>
      </div>
      <h1 className="text-[29px] leading-[1.15] font-bold">Connect this screen.</h1>
      <p className="text-[15px] leading-[1.45] text-muted">
        This screen plays the karaoke videos and shows the invite between songs. Enter the room code from the host’s
        phone.
      </p>
      {notice && <p className="rounded-xl bg-surface p-3 text-[13px] text-muted">{notice}</p>}
      <form onSubmit={onSubmit} className="flex flex-col gap-2.5">
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
        <ErrorText>{connect.isError && errorMessage(connect.error)}</ErrorText>
        <Button type="submit" icon={icons.plusOnAccent} disabled={normalizeCode(code).length !== 6 || connect.isPending}>
          {connect.isPending ? 'Connecting…' : 'Connect'}
        </Button>
      </form>
    </main>
  )
}

/**
 * The join QR. Shown big between songs and in a corner while someone sings,
 * so late arrivals can always scan in. A locked room shows why scanning won't work.
 */
function JoinCode({ state, size }: { state: RoomState; size: string }) {
  const { room } = state
  if (room.is_locked) {
    return (
      <div className={`flex shrink-0 flex-col items-center justify-center gap-[0.5vw] rounded-[1.5vw] bg-surface p-[1.5vw] text-center ${size}`}>
        <p className="text-[1.6vw] font-bold">Room locked</p>
        <p className="text-[1vw] text-muted">The host isn’t letting new people in.</p>
      </div>
    )
  }
  return (
    <div className="shrink-0 rounded-[1.5vw] bg-white p-[1vw]">
      <QRCodeSVG
        value={joinUrl(room.code)}
        size={512}
        marginSize={0}
        title={`Scan to join room ${room.code}`}
        className={`h-auto ${size}`}
      />
    </div>
  )
}

function Invitation({ state, onDisconnect }: { state: RoomState; onDisconnect: () => void }) {
  const { room } = state
  return (
    <main className="flex min-h-screen flex-col justify-center bg-screen p-[6vw]">
      <div className="flex items-center gap-[6vw]">
        <div className="flex min-w-0 flex-1 flex-col gap-[2vw]">
          <p className="text-[3vw] font-extrabold text-accent">Videokehan</p>
          <p className="text-[6vw] leading-[1.1]">The mic is for everyone.</p>
          <p className="text-[2vw] text-muted">
            {publicHost()} · <span className="font-bold text-ink">{room.code}</span>
          </p>
          <p className="text-[1.6vw] text-muted">
            {state.queue.upcoming.length > 0 ? 'Starting the next song…' : 'Scan to join, then add a song from your phone.'}
          </p>
        </div>
        <JoinCode state={state} size="w-[28vw] max-w-[60vh]" />
      </div>
      <button type="button" onClick={onDisconnect} className="fixed right-4 bottom-4 text-[12px] text-muted/60 hover:text-muted">
        Disconnect this screen
      </button>
    </main>
  )
}

function NowPlaying({ state, session }: { state: RoomState; session: DisplaySession }) {
  const current = state.queue.current!
  const next = state.queue.upcoming[0]
  const paused = state.room.playback_status === 'paused'

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black">
      <YouTubePlayer
        itemId={current.id}
        videoId={current.youtube_video_id}
        paused={paused}
        onStarted={(id) => void reportStarted(session, id).catch(() => {})}
        onEnded={(id, reason) => void reportEnded(session, id, reason).catch(() => {})}
      />
      <div className="pointer-events-none absolute top-[2vw] right-[2vw] flex flex-col items-center gap-[0.6vw] rounded-[1.8vw] bg-bg/85 p-[1vw]">
        <JoinCode state={state} size="w-[11vw] max-w-[22vh]" />
        {!state.room.is_locked && (
          <p className="text-center text-[1vw] leading-tight text-muted">
            Scan to join
            <br />
            <span className="text-[1.4vw] font-bold tracking-[0.08em] text-ink">{state.room.code}</span>
          </p>
        )}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-6 bg-gradient-to-t from-black/80 to-transparent px-[3vw] pt-[6vw] pb-[2vw]">
        <div className="flex flex-col gap-1">
          <p className="text-[1.4vw] font-semibold text-accent">ON THE MIC</p>
          <p className="text-[2.6vw] font-bold">{current.added_by.display_name}</p>
          <p className="text-[1.4vw] text-muted">{songName(current)}</p>
        </div>
        {next && (
          <div className="flex max-w-[40vw] flex-col items-end gap-1 text-right">
            <p className="text-[1.4vw] font-semibold text-accent">UP NEXT</p>
            <p className="max-w-full truncate text-[1.8vw] font-bold text-ink">{songName(next)}</p>
            <p className="text-[1.4vw] text-muted">{next.added_by.display_name}</p>
          </div>
        )}
      </div>
      {paused && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/50">
          <p className="rounded-full bg-bg/90 px-6 py-3 text-[2vw] font-bold">Paused by the host</p>
        </div>
      )}
    </main>
  )
}

function DisplayRoom({ session, armed, onArm, onEnd }: {
  session: DisplaySession
  armed: boolean
  onArm: () => void
  onEnd: (notice: string) => void
}) {
  const state = useQuery({
    queryKey: ['display', session.roomId],
    queryFn: () => getDisplayState(session),
    refetchInterval: POLL_MS,
    retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 3,
  })

  const gone = state.error instanceof ApiError && [401, 403, 404].includes(state.error.status)
  useEffect(() => {
    if (gone) onEnd('The room closed or this screen was disconnected by the host.')
  }, [gone, onEnd])

  if (gone) return null

  if (!state.data) return <p className="p-6 text-center text-muted">Connecting…</p>

  // Browsers block sound until someone interacts with the page.
  if (!armed) {
    return (
      <button type="button" onClick={onArm} className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-screen">
        <Icon src={icons.playBadge} size={48} />
        <span className="text-[3vw] font-bold">Tap to start the show</span>
        <span className="text-[1.6vw] text-muted">One tap lets this screen play sound.</span>
      </button>
    )
  }

  const disconnect = () => {
    void disconnectDisplay(session).catch(() => {})
    onEnd('Disconnected. Enter a room code to connect again.')
  }

  return state.data.queue.current ? (
    <NowPlaying state={state.data} session={session} />
  ) : (
    <Invitation state={state.data} onDisconnect={disconnect} />
  )
}

/** The TV / laptop screen: plays the room's videos and shows the invite between songs. */
export default function DisplayPage() {
  const [session, setSession] = useState(getDisplaySession)
  // Connecting is a tap, so a fresh connection can play sound right away.
  const [armed, setArmed] = useState(false)
  const [notice, setNotice] = useState<string>()

  if (!session) {
    return (
      <ConnectScreen
        notice={notice}
        onConnected={(s) => {
          setArmed(true)
          setSession(s)
        }}
      />
    )
  }

  return (
    <DisplayRoom
      session={session}
      armed={armed}
      onArm={() => setArmed(true)}
      onEnd={(message) => {
        setDisplaySession(null)
        setSession(null)
        setNotice(message)
      }}
    />
  )
}
