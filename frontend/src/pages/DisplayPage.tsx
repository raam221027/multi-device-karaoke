import { useMutation, useQuery } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
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

// Safari on iPad (before 16.4) only has the webkit-prefixed fullscreen API.
type WebkitDocument = Document & {
  webkitFullscreenElement?: Element | null
  webkitFullscreenEnabled?: boolean
  webkitExitFullscreen?: () => void
}
const webkitDoc = document as WebkitDocument

const isTouchScreen = () => navigator.maxTouchPoints > 0 || window.matchMedia('(any-pointer: coarse)').matches
const fullscreenElement = () => document.fullscreenElement ?? webkitDoc.webkitFullscreenElement ?? null
/** False on iPhones: their browsers never let a page go fullscreen. */
const fullscreenSupported = () => !!(document.fullscreenEnabled || webkitDoc.webkitFullscreenEnabled)

/**
 * On a phone or tablet used as the screen, go fullscreen and sideways. Must run
 * inside a tap. Desktop browsers are left alone.
 */
function fillTouchScreen() {
  if (!isTouchScreen() || fullscreenElement()) return
  const root = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void }
  const entered = root.requestFullscreen ? root.requestFullscreen() : Promise.resolve(root.webkitRequestFullscreen?.())
  entered
    .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
    .catch(() => {})
}

function exitFullscreen() {
  if (document.exitFullscreen) void document.exitFullscreen().catch(() => {})
  else webkitDoc.webkitExitFullscreen?.()
}

// How long the fullscreen toggle stays up after a tap.
const TOGGLE_MS = 3000

/**
 * A fullscreen toggle for a phone or tablet screen, hidden until someone taps.
 * A call or a trip to the home screen drops fullscreen, so coming back shows it too.
 */
function FullscreenToggle() {
  const [isFull, setIsFull] = useState(() => !!fullscreenElement())
  const [shown, setShown] = useState(false)
  // Where fullscreen isn't possible, the button explains the Home Screen route instead.
  const [tip, setTip] = useState(false)

  useEffect(() => {
    let timer: number | undefined
    const reveal = () => {
      setShown(true)
      clearTimeout(timer)
      timer = window.setTimeout(() => {
        setShown(false)
        setTip(false)
      }, TOGGLE_MS)
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') reveal()
    }
    const onFullscreen = () => setIsFull(!!fullscreenElement())

    // touchstart too: some in-app browsers don't send pointer events.
    for (const type of ['pointerdown', 'touchstart']) document.addEventListener(type, reveal, { passive: true })
    document.addEventListener('visibilitychange', onVisible)
    for (const type of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(type, onFullscreen)
    return () => {
      clearTimeout(timer)
      for (const type of ['pointerdown', 'touchstart']) document.removeEventListener(type, reveal)
      document.removeEventListener('visibilitychange', onVisible)
      for (const type of ['fullscreenchange', 'webkitfullscreenchange']) document.removeEventListener(type, onFullscreen)
    }
  }, [])

  function toggle() {
    if (isFull) exitFullscreen()
    else if (fullscreenSupported()) fillTouchScreen()
    else setTip(true)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={`fixed top-3 left-3 z-50 flex min-h-11 max-w-[calc(100vw-24px)] items-center gap-2 rounded-full bg-bg/90 px-4 py-2 text-left text-[13px] font-semibold transition-opacity duration-300 ${
        shown ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}>
      <Icon src={isFull ? icons.minimize : icons.maximize} size={16} />
      {tip
        ? 'This browser can’t go full screen. Use Share → Add to Home Screen, then open it from there.'
        : isFull
          ? 'Exit full screen'
          : 'Full screen'}
    </button>
  )
}

/** Keeps a phone's screen from sleeping mid-song. Silently does nothing where unsupported. */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let stopped = false

    const acquire = () => {
      if (document.visibilityState !== 'visible') return
      navigator.wakeLock
        .request('screen')
        .then((sentinel) => {
          if (stopped) void sentinel.release()
          else lock = sentinel
        })
        .catch(() => {})
    }

    // The browser drops the lock whenever the tab is hidden, so take it again on return.
    acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => {
      stopped = true
      document.removeEventListener('visibilitychange', acquire)
      void lock?.release().catch(() => {})
    }
  }, [active])
}

function ConnectScreen({ notice, onConnected }: { notice?: string; onConnected: (s: DisplaySession) => void }) {
  // The host's display QR opens /display?code=…, so a phone only has to tap Connect.
  const [params] = useSearchParams()
  const prefilled = normalizeCode(params.get('code') ?? '')
  const [code, setCode] = useState(prefilled)
  const connect = useMutation({ mutationFn: () => connectDisplay(normalizeCode(code)), onSuccess: onConnected })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    fillTouchScreen()
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
        phone or the Invite page.
      </p>
      {notice && <p className="rounded-xl bg-surface p-3 text-[13px] text-muted">{notice}</p>}
      {prefilled && !notice && (
        <p className="rounded-xl bg-surface p-3 text-[13px] text-muted">
          Connecting will replace any screen already in this room.
        </p>
      )}
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
        <p className="text-[length:max(13px,1.6vw)] font-bold">Room locked</p>
        <p className="text-[length:max(11px,1vw)] text-muted">The host isn’t letting new people in.</p>
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
          <p className="text-[length:max(22px,3vw)] font-extrabold text-accent">Videokehan</p>
          <p className="text-[length:max(32px,6vw)] leading-[1.1]">The mic is for everyone.</p>
          <p className="text-[length:max(14px,2vw)] text-muted">
            {publicHost()} · <span className="font-bold text-ink">{room.code}</span>
          </p>
          <p className="text-[length:max(13px,1.6vw)] text-muted">
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
      {/* Taps inside the video iframe never reach this page (and would pause it behind the host's back), so catch them here. */}
      <div className="absolute inset-0" />
      <div className="pointer-events-none absolute top-[2vw] right-[2vw] flex flex-col items-center gap-[0.6vw] rounded-[1.8vw] bg-bg/85 p-[1vw]">
        <JoinCode state={state} size="w-[max(96px,11vw)] max-w-[max(96px,22vh)]" />
        {!state.room.is_locked && (
          <p className="text-center text-[length:max(11px,1vw)] leading-tight text-muted">
            Scan to join
            <br />
            <span className="text-[length:max(13px,1.4vw)] font-bold tracking-[0.08em] text-ink">{state.room.code}</span>
          </p>
        )}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-6 bg-gradient-to-t from-black/80 to-transparent px-[3vw] pt-[6vw] pb-[2vw]">
        <div className="flex flex-col gap-1">
          <p className="text-[length:max(13px,1.4vw)] font-semibold text-accent">ON THE MIC</p>
          <p className="text-[length:max(20px,2.6vw)] font-bold">{current.added_by.display_name}</p>
          <p className="text-[length:max(13px,1.4vw)] text-muted">{songName(current)}</p>
        </div>
        {next && (
          <div className="flex max-w-[40vw] flex-col items-end gap-1 text-right">
            <p className="text-[length:max(13px,1.4vw)] font-semibold text-accent">UP NEXT</p>
            <p className="max-w-full truncate text-[length:max(15px,1.8vw)] font-bold text-ink">{songName(next)}</p>
            <p className="text-[length:max(13px,1.4vw)] text-muted">{next.added_by.display_name}</p>
          </div>
        )}
      </div>
      {paused && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/50">
          <p className="rounded-full bg-bg/90 px-6 py-3 text-[length:max(14px,2vw)] font-bold">Paused by the host</p>
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

  useWakeLock(armed)

  const gone = state.error instanceof ApiError && [401, 403, 404].includes(state.error.status)
  useEffect(() => {
    if (gone) onEnd('The room closed or this screen was disconnected by the host.')
  }, [gone, onEnd])

  if (gone) return null

  if (!state.data) return <p className="p-6 text-center text-muted">Connecting…</p>

  // Browsers block sound until someone interacts with the page.
  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => {
          fillTouchScreen()
          onArm()
        }}
        className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-screen">
        <Icon src={icons.playBadge} size={48} />
        <span className="text-[length:max(22px,3vw)] font-bold">Tap to start the show</span>
        <span className="text-[length:max(13px,1.6vw)] text-muted">One tap lets this screen play sound.</span>
      </button>
    )
  }

  const disconnect = () => {
    void disconnectDisplay(session).catch(() => {})
    onEnd('Disconnected. Enter a room code to connect again.')
  }

  return (
    <>
      {state.data.queue.current ? (
        <NowPlaying state={state.data} session={session} />
      ) : (
        <Invitation state={state.data} onDisconnect={disconnect} />
      )}
      {isTouchScreen() && <FullscreenToggle />}
    </>
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
