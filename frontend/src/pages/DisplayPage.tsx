import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import * as icons from '../assets/icons'
import YouTubePlayer from '../components/YouTubePlayer'
import { Button, ButtonLink, ErrorText, Icon, TextInput } from '../components/ui'
import { ApiError, getToken } from '../lib/api'
import {
  clearDisplayEnded,
  connectDisplay,
  currentPhone,
  displayBecomesPhone,
  disconnectDisplay,
  displayEnded,
  getDisplaySession,
  getDisplayState,
  markDisplayEnded,
  reportEnded,
  reportStarted,
  setDisplaySession,
  type DisplaySession,
} from '../lib/display'
import { songName } from '../lib/format'
import { errorMessage, getMe, normalizeCode } from '../lib/rooms'
import { joinUrl, publicHost } from '../lib/share'
import type { QueueItem, RoomState } from '../lib/types'

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
/** Opened from a Home Screen icon: already full screen, with no browser bars. */
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
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
// The Home Screen tip is longer, so it stays up long enough to read.
const TIP_MS = 8000

/**
 * A fullscreen toggle for a phone or tablet screen, hidden until someone taps.
 * A call or a trip to the home screen drops fullscreen, so coming back shows it too.
 */
function FullscreenToggle() {
  const [isFull, setIsFull] = useState(() => !!fullscreenElement())
  const [shown, setShown] = useState(false)
  // Where fullscreen isn't possible, the button explains the Home Screen route instead.
  const [tip, setTip] = useState(false)
  const hideTimer = useRef<number | undefined>(undefined)

  function hideAfter(ms: number) {
    clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => {
      setShown(false)
      setTip(false)
    }, ms)
  }

  useEffect(() => {
    const reveal = () => {
      setShown(true)
      hideAfter(TOGGLE_MS)
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
      clearTimeout(hideTimer.current)
      for (const type of ['pointerdown', 'touchstart']) document.removeEventListener(type, reveal)
      document.removeEventListener('visibilitychange', onVisible)
      for (const type of ['fullscreenchange', 'webkitfullscreenchange']) document.removeEventListener(type, onFullscreen)
    }
  }, [])

  function toggle() {
    if (isFull) exitFullscreen()
    else if (fullscreenSupported()) fillTouchScreen()
    else {
      setTip(true)
      hideAfter(TIP_MS)
    }
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
        ? 'iPhone browsers can’t go full screen. Tap Share → Add to Home Screen, then open Videokehan from there.'
        : isFull
          ? 'Exit full screen'
          : fullscreenSupported()
            ? 'Full screen'
            : 'How to go full screen'}
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

function ConnectScreen({ notice: endNotice, onConnected }: { notice?: string; onConnected: (s: DisplaySession) => void }) {
  // This device was the screen until recently (maybe before a reload).
  const ended = displayEnded()
  const notice =
    endNotice ?? (ended ? 'This screen was disconnected. Enter the room code to join again.' : undefined)
  // The host's display QR opens /display?code=…, so a phone only has to tap Connect.
  const [params] = useSearchParams()
  const prefilled = normalizeCode(params.get('code') ?? '')
  const [code, setCode] = useState(prefilled)
  const connect = useMutation({ mutationFn: () => connectDisplay(normalizeCode(code)), onSuccess: onConnected })
  const navigate = useNavigate()
  // A screen that was replaced may only want back in as a singer, so ask
  // before taking the screen back. Fresh setups connect directly.
  const [choosing, setChoosing] = useState(false)

  // A phone that's hosting can't also be the screen, or the room would lose
  // its remote. It hands off hosting first, from its own screen page.
  // Keyed by token so an answer cached for an earlier session never applies to this one.
  const phoneToken = getToken()
  const phone = useQuery({ queryKey: ['me', phoneToken], queryFn: getMe, enabled: phoneToken !== null, retry: false })
  const hosting = phoneToken && phone.data?.participant.role === 'host' ? phone.data.room : null

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (ended) return setChoosing(true)
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
      {hosting ? (
        <>
          <p className="rounded-xl bg-surface p-3 text-[13px] leading-[1.45] text-muted">
            This phone is hosting {hosting.name ?? 'a room'}. Hand off hosting to a guest before using it as the
            screen, so the room always has a host.
          </p>
          <ButtonLink to={`/host/${hosting.id}/invite/tv/this-device`}>Hand off hosting</ButtonLink>
          <ButtonLink to={`/host/${hosting.id}`} variant="secondary">
            Back to my room
          </ButtonLink>
        </>
      ) : choosing ? (
        <div className="flex flex-col gap-2.5">
          <p className="text-[15px] font-semibold">
            How do you want to join room <span className="tracking-[0.08em]">{normalizeCode(code)}</span>?
          </p>
          <Button onClick={() => navigate(`/join/${normalizeCode(code)}`)} disabled={connect.isPending}>
            Join as a singer
          </Button>
          <Button
            variant="secondary"
            icon={icons.monitor}
            onClick={() => {
              fillTouchScreen()
              connect.mutate()
            }}
            disabled={connect.isPending}
          >
            {connect.isPending ? 'Connecting…' : 'Use as the display'}
          </Button>
          <p className="text-center text-[12px] text-muted">Using it as the display replaces the screen that’s playing now.</p>
          <ErrorText>{connect.isError && errorMessage(connect.error)}</ErrorText>
          <button type="button" onClick={() => setChoosing(false)} className="py-1 text-[13px] text-accent">
            Change code
          </button>
        </div>
      ) : (
        <>
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
        </>
      )}
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

/** True for a few seconds after the server swaps in another upload of the current song. */
function useSwapNotice(current: QueueItem): boolean {
  const [shownFor, setShownFor] = useState<string | null>(null)
  const key = current.video_swaps > 0 ? `${current.id}:${current.youtube_video_id}` : null

  useEffect(() => {
    if (!key) return
    setShownFor(key)
    const timer = setTimeout(() => setShownFor(null), 8000)
    return () => clearTimeout(timer)
  }, [key])

  return key !== null && shownFor === key
}

/** The video, one player for the whole session (see YouTubePlayer). Hidden between songs. */
function VideoLayer({ song, playing, paused, blocked, session, onBlocked }: {
  song: QueueItem
  playing: boolean
  paused: boolean
  blocked: boolean
  session: DisplaySession
  onBlocked: (blocked: boolean) => void
}) {
  return (
    <div className={`fixed inset-0 bg-black ${playing ? '' : 'invisible'}`}>
      <YouTubePlayer
        itemId={song.id}
        videoId={song.youtube_video_id}
        paused={paused}
        idle={!playing}
        onStarted={(id) => void reportStarted(session, id).catch(() => {})}
        onEnded={(id, reason, error) => void reportEnded(session, id, reason, error).catch(() => {})}
        onBlocked={onBlocked}
      />
      {/* Taps inside the video iframe never reach this page (and would pause it behind the host's back), so catch them here.
          Unless the browser is waiting for a tap on the video before it will play. */}
      <div className={`absolute inset-0 ${blocked ? 'pointer-events-none' : ''}`} />
    </div>
  )
}

/** Everything drawn over the video. Lets taps through to it. */
function NowPlaying({ state, blocked }: { state: RoomState; blocked: boolean }) {
  const current = state.queue.current!
  const next = state.queue.upcoming[0]
  const paused = state.room.playback_status === 'paused'
  const swapNotice = useSwapNotice(current)

  return (
    <main className="pointer-events-none fixed inset-0 overflow-hidden">
      {blocked && !paused && (
        <div className="absolute inset-x-0 top-[35%] flex justify-center px-4">
          <p className="rounded-full bg-bg/90 px-6 py-3 text-center text-[length:max(14px,2vw)] font-bold">
            Tap the video to start the song
          </p>
        </div>
      )}
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
          {swapNotice && (
            <p className="mt-1 w-fit rounded-full bg-bg/85 px-3 py-1 text-[length:max(12px,1.1vw)] text-muted">
              The chosen video can’t play here, so this is another version.
            </p>
          )}
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
    // Keyed by token: a screen replaced earlier in this room leaves a cached
    // 401 behind, which would otherwise end the new connection straight away.
    queryKey: ['display', session.roomId, session.token],
    queryFn: () => getDisplayState(session),
    refetchInterval: POLL_MS,
    retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 3,
    // A device keeps its token through role changes, so an answer cached from
    // an earlier stint as the screen ("you're a guest now") must never be reused.
    gcTime: 0,
  })

  useWakeLock(armed)

  // Only a fresh answer may end or redirect the screen, never a cached one.
  const fresh = state.isFetchedAfterMount
  const gone = fresh && state.error instanceof ApiError && [401, 403, 404].includes(state.error.status)
  useEffect(() => {
    if (gone) onEnd('Another screen took over, the host disconnected this one, or the room closed.')
  }, [gone, onEnd])

  // The host handed this screen the host role (a swap): same token, now a phone.
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const role = state.data?.me.role
  const becamePhone = fresh && role !== undefined && role !== 'display'
  useEffect(() => {
    if (!becamePhone) return
    displayBecomesPhone(session)
    // If this browser was a phone in this room before, its cached state still
    // says "display" and would bounce it straight back here.
    queryClient.removeQueries({ queryKey: ['room', String(session.roomId)] })
    if (fullscreenElement()) exitFullscreen()
    navigate(`/${role === 'host' ? 'host' : 'room'}/${session.roomId}`, { replace: true })
  }, [becamePhone, role, session, navigate, queryClient])

  // The song the player holds: the current one, or the last one while waiting for the next.
  const current = state.data?.queue.current ?? null
  const [song, setSong] = useState<QueueItem | null>(null)
  if (current && (current.id !== song?.id || current.youtube_video_id !== song.youtube_video_id)) setSong(current)
  const [blocked, setBlocked] = useState(false)

  if (gone || becamePhone || !fresh || !state.data) return <p className="p-6 text-center text-muted">Connecting…</p>

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
      {song && (
        <VideoLayer
          song={song}
          playing={current !== null}
          paused={state.data.room.playback_status === 'paused'}
          blocked={blocked}
          session={session}
          onBlocked={setBlocked}
        />
      )}
      {current ? (
        <NowPlaying state={state.data} blocked={blocked} />
      ) : (
        <Invitation state={state.data} onDisconnect={disconnect} />
      )}
      {isTouchScreen() && !isStandalone() && <FullscreenToggle />}
    </>
  )
}

/** The TV / laptop screen: plays the room's videos and shows the invite between songs. */
export default function DisplayPage() {
  const [session, setSession] = useState(getDisplaySession)
  const [, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
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
        // Show the connect screen straight away; never leave a blank page.
        const ended = session
        setDisplaySession(null)
        markDisplayEnded()
        // The QR's ?code= would otherwise come back prefilled and invite reconnecting.
        setSearchParams({}, { replace: true })
        setSession(null)
        setNotice(message)

        // Still a phone in this same room (it was a guest and the screen at
        // once)? Go back to that instead. A session from another room is ignored.
        void currentPhone().then((phone) => {
          if (!phone || phone.room.id !== ended.roomId || phone.room.status !== 'open') return
          if (phone.participant.role === 'display') return
          clearDisplayEnded()
          navigate(`/${phone.participant.role === 'host' ? 'host' : 'room'}/${phone.room.id}`, { replace: true })
        })
      }}
    />
  )
}
