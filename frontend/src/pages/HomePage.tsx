import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import friendsSinging from '../assets/friends-singing.jpg'
import * as icons from '../assets/icons'
import { Button, ButtonLink, ErrorText, Icon, TextInput } from '../components/ui'
import { api, getToken } from '../lib/api'
import { createRoom, errorMessage, getMe, normalizeCode } from '../lib/rooms'
import { CONTACT_EMAIL, useShare } from '../lib/share'

type Health = { status: string; db: boolean; time: string }

/** Only speaks up when the server can't be reached. */
function ServerWarning() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api<Health>('/health'),
    retry: false,
  })

  if (health.isPending || (health.data?.status === 'ok' && health.data.db)) return null
  return <p className="text-center text-[13px] text-danger">Can’t reach the server right now.</p>
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
    <Link to={to} className="flex items-center justify-between gap-3 rounded-2xl bg-accent-soft p-4 text-[14px] text-accent">
      <span>
        Back to <strong>{room.name ?? room.code}</strong> as {participant.display_name}
      </span>
      <span aria-hidden>→</span>
    </Link>
  )
}

// Read once per page load, so rendering stays pure.
const YEAR = new Date().getFullYear()

/** Clicking the email copies it and opens a Gmail draft to it in a new tab. */
function ContactFooter() {
  const { status, copy } = useShare()

  return (
    <p className="text-center text-[12px] leading-[1.45] text-muted">
      © {YEAR} Videokehan · Contact:{' '}
      <a
        href={`https://mail.google.com/mail/?view=cm&to=${CONTACT_EMAIL}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => copy(CONTACT_EMAIL)}
        className="text-accent"
      >
        {status === 'copied' ? 'Email copied!' : CONTACT_EMAIL}
      </a>
      <br />
      <Link to="/privacy" className="inline-block py-2 text-accent">
        Privacy
      </Link>
      {' · '}
      <Link to="/terms" className="inline-block py-2 text-accent">
        Terms
      </Link>
    </p>
  )
}

const DEMO_LABEL =
  'Demo: the host creates a room and shows the QR on a display (a TV, laptop, tablet or phone), a guest joins and queues songs, ' +
  'then the host hides the side panel, changes the scoring sound and turns scoring off'

// Read once per page load, like YEAR.
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** A round "jump 5 seconds" button for the touch controls, with the 5 inside the arrow. */
function SkipButton({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onPress()
      }}
      aria-label={label}
      className="relative flex size-14 items-center justify-center rounded-full bg-black/50"
    >
      <Icon src={icon} size={34} />
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-ink">5</span>
    </button>
  )
}

/**
 * A muted, looping walkthrough of the host's phone, the TV and a guest's phone.
 * It plays only while on screen, and never by itself for people who turned on
 * reduced motion. Tapping it opens a bigger copy: side by side on wide screens,
 * stacked on phones.
 */
function DemoVideo() {
  const inline = useRef<HTMLVideoElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const big = useRef<HTMLVideoElement>(null)
  const visible = useRef(false)
  const hideTimer = useRef<number | undefined>(undefined)
  const [wide, setWide] = useState(false)
  // Phones and tablets get YouTube-style tap controls; mouse users keep the native ones.
  const [touch, setTouch] = useState(false)
  const [chrome, setChrome] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    const video = inline.current
    if (!video || REDUCED_MOTION) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible.current = entry.isIntersecting
        if (!entry.isIntersecting) video.pause()
        else if (!dialog.current?.open) video.play().catch(() => {})
      },
      { threshold: 0.5 },
    )
    observer.observe(video)
    return () => observer.disconnect()
  }, [])

  function open() {
    setWide(window.matchMedia('(min-width: 768px) and (orientation: landscape)').matches)
    setTouch(window.matchMedia('(hover: none) and (pointer: coarse)').matches)
    inline.current?.pause()
    dialog.current?.showModal()
  }

  /** Show the tap controls, then hide them after 3s unless the video is paused. */
  function poke() {
    setChrome(true)
    window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => {
      if (!big.current?.paused) setChrome(false)
    }, 3000)
  }

  function toggleChrome() {
    if (!chrome) return poke()
    window.clearTimeout(hideTimer.current)
    setChrome(false)
  }

  /** Jump back or ahead a few seconds, staying inside the video. */
  function skip(seconds: number) {
    const video = big.current
    if (!video) return
    video.currentTime = Math.min(Math.max(video.currentTime + seconds, 0), video.duration || 0)
  }

  function togglePlay() {
    const video = big.current
    if (!video) return
    if (video.paused) video.play().catch(() => {})
    else video.pause()
  }

  function onClose() {
    window.clearTimeout(hideTimer.current)
    setChrome(false)
    setWide(false)
    if (visible.current && !REDUCED_MOTION) inline.current?.play().catch(() => {})
  }

  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="text-[18px] font-bold">See how it works</h2>
      <button
        type="button"
        onClick={open}
        aria-label="Play the demo full size"
        className="group relative overflow-hidden rounded-3xl bg-surface"
      >
        <video
          ref={inline}
          src="/demo.mp4"
          poster="/demo-poster.jpg"
          muted
          loop
          playsInline
          preload="metadata"
          aria-label={DEMO_LABEL}
          className="w-full"
        />
        <span className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full bg-bg/85 px-3 py-2 text-[13px] font-semibold group-hover:text-accent">
          <Icon src={REDUCED_MOTION ? icons.playBadge : icons.maximize} size={14} />
          {REDUCED_MOTION ? 'Tap to play' : 'Tap to enlarge'}
        </span>
      </button>

      {/* Closes on Esc (built into <dialog>), the ✕, or a click on the backdrop. */}
      <dialog
        ref={dialog}
        onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
        onClose={onClose}
        className="m-auto max-h-none max-w-none bg-transparent p-0 backdrop:bg-black/85"
      >
        <div className="relative">
          {/* On touch screens a tap shows or hides the controls, like YouTube. */}
          <div className="relative" onClick={touch ? toggleChrome : undefined}>
            <video
              ref={big}
              key={wide ? 'wide' : 'tall'}
              src={wide ? '/demo-wide.mp4' : '/demo.mp4'}
              poster={wide ? '/demo-wide-poster.jpg' : '/demo-poster.jpg'}
              controls={!touch}
              autoPlay
              muted
              loop
              playsInline
              aria-label={DEMO_LABEL}
              onPlay={() => {
                setPlaying(true)
                if (touch) poke()
              }}
              onPause={() => {
                setPlaying(false)
                window.clearTimeout(hideTimer.current)
                setChrome(true)
              }}
              onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
              onDurationChange={(e) => setDuration(e.currentTarget.duration)}
              className="block max-h-[90dvh] max-w-[95vw] rounded-2xl"
            />
            {touch && (
              <div
                className={`absolute inset-0 flex flex-col rounded-2xl bg-black/45 transition-opacity duration-300 ${
                  chrome ? 'opacity-100' : 'pointer-events-none opacity-0'
                }`}
              >
                <div className="flex flex-1 items-center justify-center gap-10">
                  <SkipButton icon={icons.rotateCcw} label="Back 5 seconds" onPress={() => { skip(-5); poke() }} />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      togglePlay()
                      poke()
                    }}
                    aria-label={playing ? 'Pause' : 'Play'}
                    className="flex size-16 items-center justify-center rounded-full bg-accent"
                  >
                    <Icon src={playing ? icons.pauseOnAccent : icons.playOnAccent} size={28} />
                  </button>
                  <SkipButton icon={icons.rotateCw} label="Forward 5 seconds" onPress={() => { skip(5); poke() }} />
                </div>
                <input
                  type="range"
                  min={0}
                  max={duration || 0}
                  step={0.1}
                  value={time}
                  aria-label="Seek"
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    if (big.current) big.current.currentTime = Number(e.target.value)
                    poke()
                  }}
                  className="mx-4 mb-3 accent-accent"
                />
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label="Close the demo"
            className="absolute top-2 right-2 flex size-11 items-center justify-center rounded-full bg-bg/85"
          >
            <Icon src={icons.x} size={20} />
          </button>
        </div>
      </dialog>
    </section>
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
      </header>

      {notice && <p className="rounded-xl bg-surface p-3 text-center text-[14px] text-muted">{notice}</p>}

      <div className="relative h-[278px] overflow-hidden rounded-3xl">
        <img src={friendsSinging} alt="Friends singing karaoke together at home" className="absolute inset-0 size-full object-cover" />
        <div className="absolute bottom-4 left-4 flex items-center gap-[7px] rounded-full bg-bg px-3 py-2">
          <Icon src={icons.sparkles} size={14} />
          <span className="text-[13px] font-semibold">Your friends. Your songs. Your Videokehan.</span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h1 className="text-[30px] leading-[1.05] font-extrabold">
          <span className="text-accent">Birit</span> starts here.
          
        </h1>
        <p className="text-[15px] leading-[1.45] text-muted">
         Any Day. Any Song. Anytime.
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

        {/* No TV? A spare phone, tablet or laptop can play the videos instead. */}
        <Link to="/display" state={{ asScreen: true }} className="flex items-center justify-center gap-2 py-2 text-[14px] text-accent">
          <Icon src={icons.monitor} size={16} />
          Use this device as the screen
        </Link>

        <p className="text-center text-[14px] leading-[1.45] text-muted">No downloads. No account needed to join.</p>
      </div>

      <ol className="flex justify-between pt-2 text-[13px]">
        {['Create a room', 'Invite your friends', 'Sing together'].map((step, i) => (
          <li key={step} className="flex flex-col gap-1.5">
            <span className="font-bold text-accent">0{i + 1}</span>
            <span className="text-muted">{step}</span>
          </li>
        ))}
      </ol>

      <DemoVideo />

      <ServerWarning />
      <p className="text-center text-[12px] leading-[1.45] text-muted">Karaoke videos powered by YouTube · Browser-based</p>
      <ContactFooter />
    </main>
  )
}
