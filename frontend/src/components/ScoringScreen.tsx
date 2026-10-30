import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { shortSongName } from '../lib/format'
import { scoreMessage } from '../lib/score'
import { playScoringAudio, SCORING, type ScoringAudio } from '../lib/scoringAudio'
import type { QueueItem } from '../lib/types'

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * The videoke moment after a song plays to the end: a jingle, the score
 * counting up, a fanfare when it lands. Lasts SCORING.total, then `onDone`.
 * Display only: phones never render this, so they never play its sounds.
 */
export default function ScoringScreen({ item, score, volume, onDone }: {
  item: QueueItem
  score: number
  /** 0 to 100, the room's scoring volume. */
  volume: number
  onDone: () => void
}) {
  const [shown, setShown] = useState<number | null>(null)
  const [revealed, setRevealed] = useState(false)
  const audio = useRef<ScoringAudio | null>(null)

  const latest = useRef({ volume, onDone })
  useLayoutEffect(() => {
    latest.current = { volume, onDone }
  })

  useEffect(() => {
    const sound = playScoringAudio(latest.current.volume)
    audio.current = sound
    const timers: number[] = []
    let frame = 0
    const at = (seconds: number, fn: () => void) => timers.push(window.setTimeout(fn, seconds * 1000))

    if (!reducedMotion()) {
      at(SCORING.countFrom, () => {
        const start = performance.now()
        const length = (SCORING.revealAt - SCORING.countFrom) * 1000
        const tick = (now: number) => {
          const p = Math.min(1, (now - start) / length)
          // Fast at first, slowing as it nears the score.
          setShown(Math.round(score * (1 - (1 - p) ** 3)))
          if (p < 1) frame = requestAnimationFrame(tick)
        }
        frame = requestAnimationFrame(tick)
      })
    }
    at(SCORING.revealAt, () => {
      cancelAnimationFrame(frame)
      setShown(score)
      setRevealed(true)
    })
    at(SCORING.total, () => latest.current.onDone())

    return () => {
      for (const id of timers) clearTimeout(id)
      cancelAnimationFrame(frame)
      sound.stop()
      audio.current = null
    }
  }, [score])

  useEffect(() => {
    audio.current?.setVolume(volume)
  }, [volume])

  return (
    <main className="flex h-full flex-col items-center justify-center gap-[3cqh] overflow-hidden bg-screen p-[5cqw] text-center">
      <div className="flex max-w-full animate-score-in flex-col items-center gap-[1cqh]">
        <p className="text-[length:max(13px,min(2cqw,3.5cqh))] font-semibold tracking-[0.2em] text-accent">YOUR SCORE</p>
        <p className="max-w-full truncate text-[length:max(20px,min(4cqw,7cqh))] leading-tight font-bold">
          {item.added_by.display_name}
        </p>
        <p className="max-w-full truncate text-[length:max(13px,min(2cqw,3.5cqh))] text-muted">{shortSongName(item)}</p>
      </div>

      <div className="relative flex items-center justify-center">
        {revealed && (
          <div
            aria-hidden
            className="absolute inset-[-20%] animate-score-glow rounded-full bg-[radial-gradient(closest-side,var(--color-accent-soft),transparent)] motion-reduce:animate-none"
          />
        )}
        <p
          key={revealed ? 'landed' : 'counting'}
          className={`relative text-[length:max(80px,min(22cqw,36cqh))] leading-none font-extrabold tabular-nums ${
            revealed ? 'animate-score-pop text-accent motion-reduce:animate-none' : 'text-ink'
          }`}>
          {shown ?? '··'}
        </p>
      </div>

      <p
        className={`text-[length:max(18px,min(3.5cqw,6cqh))] font-bold ${revealed ? 'animate-score-in' : 'invisible'}`}
        aria-live="polite">
        {scoreMessage(score)}
      </p>
    </main>
  )
}
