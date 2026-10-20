import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import * as icons from '../assets/icons'
import Padlock from '../components/Padlock'
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
import { shortSongName } from '../lib/format'
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
/** iPhone or iPad (iPadOS reports itself as a Mac; only the touch screen gives it away). */
const isAppleTouch = () =>
  /iPhone|iPod|iPad/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
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

const SIDEWAYS_KEY = 'karaoke.displaySideways'

function readSideways(): boolean {
  try {
    return localStorage.getItem(SIDEWAYS_KEY) === '1'
  } catch {
    return false
  }
}

function saveSideways(on: boolean) {
  try {
    if (on) localStorage.setItem(SIDEWAYS_KEY, '1')
    else localStorage.removeItem(SIDEWAYS_KEY)
  } catch {
    // Storage unavailable; the choice just won't survive a reload.
  }
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const list = window.matchMedia(query)
    const onChange = () => setMatches(list.matches)
    onChange()
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [query])
  return matches
}

/**
 * Holds the whole screen. An iPhone can't go fullscreen or rotate for a web page,
 * so in Home Screen mode "full screen" turns the stage itself sideways: hold the
 * phone sideways and it fills the screen. Skipped when the phone is already in
 * landscape. Children size with cqw/cqh, never vw/vh, so they fit either way.
 */
function Stage({ sideways, children }: { sideways: boolean; children: ReactNode }) {
  const portrait = useMediaQuery('(orientation: portrait)')
  const rotated = sideways && portrait
  return (
    <div
      className={rotated ? 'fixed top-0 left-0 overflow-hidden' : 'fixed inset-0 overflow-hidden'}
      style={{
        containerType: 'size',
        ...(rotated && {
          width: '100dvh',
          height: '100dvw',
          transformOrigin: 'top left',
          transform: 'translateX(100dvw) rotate(90deg)',
        }),
      }}>
      {children}
    </div>
  )
}

type Sideways = { on: boolean; toggle: () => void }

type Fullscreen = {
  /** False when there's nothing to do (already sideways for real). */
  available: boolean
  isFull: boolean
  /** The Home Screen tip, shown for a while where a page can't go full screen. */
  tip: string | null
  label: string
  toggle: () => void
}

const HOME_SCREEN_TIP =
  'iPhone browsers can’t go full screen. Tap Share → Add to Home Screen, then open Videokehan from there.'

/**
 * Full screen for a phone or tablet screen. With `sideways`, it turns the
 * stage instead (iPhone Home Screen mode); where neither works it explains
 * the Home Screen route.
 */
function useFullscreen(sideways?: Sideways): Fullscreen {
  const [realFull, setRealFull] = useState(() => !!fullscreenElement())
  const landscape = useMediaQuery('(orientation: landscape)')
  const [tip, setTip] = useState(false)
  const tipTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    const onFullscreen = () => setRealFull(!!fullscreenElement())
    for (const type of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(type, onFullscreen)
    return () => {
      clearTimeout(tipTimer.current)
      for (const type of ['fullscreenchange', 'webkitfullscreenchange'])
        document.removeEventListener(type, onFullscreen)
    }
  }, [])

  const isFull = sideways ? sideways.on : realFull

  function toggle() {
    if (sideways) sideways.toggle()
    else if (isFull) exitFullscreen()
    else if (fullscreenSupported()) fillTouchScreen()
    else {
      setTip(true)
      clearTimeout(tipTimer.current)
      tipTimer.current = window.setTimeout(() => setTip(false), TIP_MS)
    }
  }

  return {
    // Already sideways for real: there's nothing to turn.
    available: !(sideways && landscape),
    isFull,
    tip: tip ? HOME_SCREEN_TIP : null,
    label: isFull ? 'Exit full screen' : sideways || fullscreenSupported() ? 'Full screen' : 'How to go full screen',
    toggle,
  }
}

/** The always-there button in the info area beside or under the video. */
function FullscreenButton({ fullscreen, compact }: { fullscreen: Fullscreen; compact?: boolean }) {
  if (!fullscreen.available) return null
  return (
    <div className={`flex w-full flex-col gap-1.5 ${compact ? 'mt-auto' : ''}`}>
      <button
        type="button"
        onClick={fullscreen.toggle}
        className={`flex w-full items-center justify-center gap-2 rounded-xl bg-surface font-semibold ${
          compact ? 'min-h-10 px-2 text-[length:max(12px,1cqw)]' : 'min-h-12 px-4 text-[15px]'
        }`}>
        <Icon src={fullscreen.isFull ? icons.minimize : icons.maximize} size={16} />
        {fullscreen.label}
      </button>
      {fullscreen.tip && <p className="text-center text-[13px] leading-snug text-muted">{fullscreen.tip}</p>}
    </div>
  )
}

/**
 * Between songs: a floating toggle, hidden until someone taps. A call or a
 * trip to the home screen drops fullscreen, so coming back shows it too.
 * Never shown while a video plays: nothing may sit on top of the player.
 */
function FullscreenToggle({ fullscreen }: { fullscreen: Fullscreen }) {
  const [shown, setShown] = useState(false)
  const hideTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    const reveal = () => {
      setShown(true)
      clearTimeout(hideTimer.current)
      hideTimer.current = window.setTimeout(() => setShown(false), TOGGLE_MS)
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') reveal()
    }

    // touchstart too: some in-app browsers don't send pointer events.
    for (const type of ['pointerdown', 'touchstart']) document.addEventListener(type, reveal, { passive: true })
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(hideTimer.current)
      for (const type of ['pointerdown', 'touchstart']) document.removeEventListener(type, reveal)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  if (!fullscreen.available) return null

  return (
    <button
      type="button"
      onClick={fullscreen.toggle}
      className={`fixed top-3 left-3 z-50 flex min-h-11 max-w-[calc(100cqw-24px)] items-center gap-2 rounded-full bg-bg/90 px-4 py-2 text-left text-[14px] font-semibold transition-opacity duration-300 ${
        shown || fullscreen.tip ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}>
      <Icon src={fullscreen.isFull ? icons.minimize : icons.maximize} size={16} />
      {fullscreen.tip ?? fullscreen.label}
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
  // Picked "Use this device as the screen" on the home page: no need to ask again.
  const asScreen = (useLocation().state as { asScreen?: boolean } | null)?.asScreen === true
  const notice =
    endNotice ??
    (ended && !asScreen ? 'This screen was disconnected. Enter the room code to join again.' : undefined)
  // The host's display QR opens /display?code=…, so a phone only has to tap Connect.
  const [params] = useSearchParams()
  const prefilled = normalizeCode(params.get('code') ?? '')
  const [code, setCode] = useState(prefilled)
  const connect = useMutation({ mutationFn: () => connectDisplay(normalizeCode(code)), onSuccess: onConnected })
  const navigate = useNavigate()
  // A screen that was replaced may only want back in as a singer, so ask
  // before taking the screen back. Fresh setups, and anyone who chose
  // "Use this device as the screen", connect directly.
  const [choosing, setChoosing] = useState(false)

  // A phone that's hosting can't also be the screen, or the room would lose
  // its remote. It hands off hosting first, from its own screen page.
  // Keyed by token so an answer cached for an earlier session never applies to this one.
  const phoneToken = getToken()
  const phone = useQuery({ queryKey: ['me', phoneToken], queryFn: getMe, enabled: phoneToken !== null, retry: false })
  const hosting = phoneToken && phone.data?.participant.role === 'host' ? phone.data.room : null

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (ended && !asScreen) return setChoosing(true)
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
      {notice && <p className="rounded-xl bg-surface p-3 text-[14px] text-muted">{notice}</p>}
      {hosting ? (
        <>
          <p className="rounded-xl bg-surface p-3 text-[14px] leading-[1.45] text-muted">
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
          <p className="text-center text-[14px] text-muted">Using it as the display replaces the screen that’s playing now.</p>
          <ErrorText>{connect.isError && errorMessage(connect.error)}</ErrorText>
          <button type="button" onClick={() => setChoosing(false)} className="py-2 text-[14px] text-accent">
            Change code
          </button>
        </div>
      ) : (
        <>
          {prefilled && !notice && (
            <p className="rounded-xl bg-surface p-3 text-[14px] text-muted">
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
    // As wide as the QR code's whole box, white border included, so swapping one for the other keeps the size.
    return (
      <div className="shrink-0 p-[1cqw]">
        <div className={size}>
          <Padlock className="-mx-[1cqw]" />
        </div>
      </div>
    )
  }
  return (
    <div className="shrink-0 rounded-[1.5cqw] bg-white p-[1cqw]">
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
    <main className="flex h-full flex-col justify-center overflow-y-auto bg-screen p-[6cqw]">
      <div className="flex items-center gap-[6cqw]">
        <div className="flex min-w-0 flex-1 flex-col gap-[2cqw]">
          <p className="text-[length:max(22px,3cqw)] font-extrabold text-accent">Videokehan</p>
          <p className="text-[length:max(32px,6cqw)] leading-[1.1]">The mic is for everyone.</p>
          <p className="text-[length:max(14px,2cqw)] text-muted">
            {publicHost()} · <span className="font-bold text-ink">{room.code}</span>
          </p>
          <p className="text-[length:max(13px,1.6cqw)] text-muted">
            {state.queue.upcoming.length > 0 ? 'Starting the next song…' : 'Scan to join, then add a song from your phone.'}
          </p>
        </div>
        <JoinCode state={state} size="w-[28cqw] max-w-[60cqh]" />
      </div>
      <button type="button" onClick={onDisconnect} className="fixed right-4 bottom-4 text-[14px] text-muted/60 hover:text-muted">
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

// The strip beside the video while a song plays (a panel below it on a phone
// held upright). YouTube's policies don't allow drawing over the player, so
// the video and the strip never overlap.
const STRIP = 'w-[max(120px,12cqw)]'
const BESIDE_STRIP = 'right-[max(120px,12cqw)]'

/** The video, one player for the whole session (see YouTubePlayer). Hidden between songs. */
function VideoLayer({ song, playing, paused, portrait, full, session, onBlocked }: {
  song: QueueItem
  playing: boolean
  paused: boolean
  portrait: boolean
  /** The host hid the strip: the video takes the whole screen. */
  full: boolean
  session: DisplaySession
  onBlocked: (blocked: boolean) => void
}) {
  const area = full ? 'inset-0' : portrait ? 'inset-x-0 top-0 aspect-video' : `inset-y-0 left-0 ${BESIDE_STRIP}`
  return (
    <div className={`absolute ${area} bg-black ${playing ? '' : 'invisible'}`}>
      {/* iPhones only play sound in the player someone tapped, so they keep one for the whole
          session. Elsewhere each song gets a fresh player: a reused one on Android keeps
          YouTube's buttons over the next video until someone touches the screen. */}
      <YouTubePlayer
        key={isAppleTouch() ? 'session' : `${song.id}:${song.youtube_video_id}`}
        itemId={song.id}
        videoId={song.youtube_video_id}
        paused={paused}
        idle={!playing}
        onStarted={(id) => void reportStarted(session, id).catch(() => {})}
        onEnded={(id, reason, error) => void reportEnded(session, id, reason, error).catch(() => {})}
        onBlocked={onBlocked}
      />
    </div>
  )
}

/** The strip beside the video: how to join, who's singing, who's next. */
function NowPlaying({ state, blocked, portrait, fullscreen }: {
  state: RoomState
  blocked: boolean
  portrait: boolean
  /** Phones and tablets only. */
  fullscreen: Fullscreen | null
}) {
  const current = state.queue.current!
  const next = state.queue.upcoming[0]
  const paused = state.room.playback_status === 'paused'
  const swapNotice = useSwapNotice(current)

  // A phone held upright: the video keeps the full width and this sits below it.
  if (portrait) {
    return (
      <aside className="absolute inset-x-0 top-[56.25cqw] bottom-0 flex flex-col gap-[5cqw] overflow-y-auto bg-screen p-[5cqw]">
        <div className="flex items-start gap-[5cqw]">
          <div className="flex shrink-0 flex-col items-center gap-[2cqw] text-center">
            <JoinCode state={state} size="w-[max(96px,28cqw)]" />
            {!state.room.is_locked && (
              <p className="text-[length:max(12px,3.2cqw)] leading-tight text-muted">
                Scan to join
                <br />
                <span className="text-[length:max(14px,4cqw)] font-bold tracking-[0.08em] text-ink">
                  {state.room.code}
                </span>
              </p>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-[3cqw]">
            {(paused || blocked) && (
              <p className="rounded-xl bg-surface px-3 py-2 text-[length:max(13px,3.6cqw)] font-bold">
                {paused ? 'Paused by the host' : 'Tap the video to start the song'}
              </p>
            )}
            <div className="flex min-w-0 flex-col gap-[1cqw]">
              <p className="text-[length:max(12px,3.2cqw)] font-semibold text-accent">ON THE MIC</p>
              <p className="text-[length:max(18px,5.5cqw)] leading-tight font-bold break-words">
                {current.added_by.display_name}
              </p>
              <p className="truncate text-[length:max(13px,3.6cqw)] text-muted">{shortSongName(current)}</p>
              {swapNotice && (
                <p className="text-[length:max(12px,3.2cqw)] text-muted">
                  The chosen video can’t play here, so this is another version.
                </p>
              )}
            </div>
            {next && (
              <div className="flex min-w-0 flex-col gap-[1cqw] border-t border-line pt-[3cqw]">
                <p className="text-[length:max(12px,3.2cqw)] font-semibold text-accent">UP NEXT</p>
                <p className="text-[length:max(16px,4.6cqw)] leading-tight font-bold break-words">
                  {next.added_by.display_name}
                </p>
                <p className="truncate text-[length:max(13px,3.6cqw)] text-muted">{shortSongName(next)}</p>
              </div>
            )}
          </div>
        </div>
        {fullscreen && <FullscreenButton fullscreen={fullscreen} />}
      </aside>
    )
  }

  return (
    <aside
      className={`absolute inset-y-0 right-0 ${STRIP} flex flex-col items-center gap-[2cqh] overflow-hidden bg-screen p-[1cqw] text-center`}>
      <div className="flex flex-col items-center gap-[0.8cqh]">
        <JoinCode
          state={state}
          size="w-[max(84px,8cqw)] max-w-[20cqh]"
        />
        {!state.room.is_locked && (
          <p className="text-[length:max(11px,0.9cqw)] leading-tight text-muted">
            Scan to join
            <br />
            <span className="text-[length:max(13px,1.2cqw)] font-bold tracking-[0.08em] text-ink">
              {state.room.code}
            </span>
          </p>
        )}
      </div>

      {(paused || blocked) && (
        <p className="w-full rounded-xl bg-surface px-2 py-1.5 text-[length:max(12px,1cqw)] font-bold">
          {paused ? 'Paused by the host' : 'Tap the video to start the song'}
        </p>
      )}

      <div className="flex w-full min-w-0 flex-col gap-[0.5cqh]">
        <p className="text-[length:max(11px,0.9cqw)] font-semibold text-accent">ON THE MIC</p>
        <p className="truncate text-[length:max(16px,1.6cqw)] leading-tight font-bold">
          {current.added_by.display_name}
        </p>
        <p className="truncate text-[length:max(11px,1cqw)] text-muted">{shortSongName(current)}</p>
        {swapNotice && (
          <p className="text-[length:max(11px,0.9cqw)] text-muted">
            The chosen video can’t play here, so this is another version.
          </p>
        )}
      </div>

      {next && (
        <div className="flex w-full min-w-0 flex-col gap-[0.5cqh] border-t border-line pt-[2cqh]">
          <p className="text-[length:max(11px,0.9cqw)] font-semibold text-accent">UP NEXT</p>
          <p className="truncate text-[length:max(14px,1.3cqw)] leading-tight font-bold text-ink">
            {next.added_by.display_name}
          </p>
          <p className="truncate text-[length:max(11px,1cqw)] text-muted">{shortSongName(next)}</p>
        </div>
      )}

      {fullscreen && <FullscreenButton fullscreen={fullscreen} compact />}
    </aside>
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
    // A PC screen often sits behind other tabs; the next song must still start.
    refetchIntervalInBackground: true,
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

  // iPhone Home Screen mode can't go fullscreen for real, so the toggle turns the stage instead.
  const [sideways, setSideways] = useState(readSideways)
  const canTurn = isStandalone() && !fullscreenSupported()
  // A phone held upright (and not turned by sideways mode) stacks the info under the video.
  const portrait = useMediaQuery('(orientation: portrait)') && !(canTurn && sideways)
  const toggleSideways = () => {
    saveSideways(!sideways)
    setSideways(!sideways)
  }
  const fullscreen = useFullscreen(canTurn ? { on: sideways, toggle: toggleSideways } : undefined)
  const touch = isTouchScreen()

  if (gone || becamePhone || !fresh || !state.data) return <p className="p-6 text-center text-muted">Connecting…</p>

  // Browsers block sound until someone interacts with the page.
  if (!armed) {
    return (
      <Stage sideways={canTurn && sideways}>
        <button
          type="button"
          onClick={() => {
            fillTouchScreen()
            onArm()
          }}
          className="flex h-full w-full flex-col items-center justify-center gap-4 bg-screen">
          <Icon src={icons.playBadge} size={48} />
          <span className="text-[length:max(22px,3cqw)] font-bold">Tap to start the show</span>
          <span className="text-[length:max(13px,1.6cqw)] text-muted">One tap lets this screen play sound.</span>
        </button>
      </Stage>
    )
  }

  const disconnect = () => {
    void disconnectDisplay(session).catch(() => {})
    onEnd('Disconnected. Enter a room code to connect again.')
  }

  // With the strip hidden, nothing shows during a song: not even the full
  // screen button, which may not sit on the video. It's back between songs.
  const strip = state.data.room.show_side_strip

  return (
    <Stage sideways={canTurn && sideways}>
      {song && (
        <VideoLayer
          song={song}
          playing={current !== null}
          paused={state.data.room.playback_status === 'paused'}
          portrait={portrait}
          full={!strip}
          session={session}
          onBlocked={setBlocked}
        />
      )}
      {current ? (
        strip && (
          <NowPlaying state={state.data} blocked={blocked} portrait={portrait} fullscreen={touch ? fullscreen : null} />
        )
      ) : (
        <Invitation state={state.data} onDisconnect={disconnect} />
      )}
      {/* While a song plays the button lives in the info area: nothing may sit on the video. */}
      {touch && !current && <FullscreenToggle fullscreen={fullscreen} />}
    </Stage>
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
