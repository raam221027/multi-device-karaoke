import { releaseAudio, wakeAudio } from './context'
import { arcadePack, type ScoringSoundPack, type Voice } from './pack'

export { unlockAudio } from './context'
export type { ScoringSoundPack } from './pack'

/** The scoring screen's timeline in seconds. The screen and the sounds both follow it. */
export const SCORING = {
  /** The jingle plays, then the count-up starts. */
  countFrom: 1.6,
  /** The score lands, with the fanfare. */
  revealAt: 4,
  /** The screen closes and the next song starts. */
  total: 8.5,
}

const MAX_GAIN = 0.5
// The background music sits well under the jingle and fanfare.
const BED_LEVEL = 0.45
const FADE_S = 0.15

export type ScoringAudio = {
  /** 0 to 100, from the room's settings. */
  setVolume(volume: number): void
  /** Fades out and cleans up. Safe to call more than once. */
  stop(): void
}

const gainFor = (volume: number) => (Math.min(100, Math.max(0, volume)) / 100) ** 2 * MAX_GAIN

// Only one score plays at a time: starting another stops this one first.
let active: ScoringAudio | null = null

/**
 * Plays the scoring sounds from now along SCORING. Silent (and harmless) when
 * the volume is 0 or the browser hasn't allowed sound yet.
 */
export function playScoringAudio(volume: number, pack: ScoringSoundPack = arcadePack): ScoringAudio {
  active?.stop()

  let stopped = false
  let master: GainNode | null = null
  let voices: Voice[] = []

  const handle: ScoringAudio = {
    setVolume(v) {
      if (master) master.gain.setTargetAtTime(gainFor(v), master.context.currentTime, 0.05)
    },
    stop() {
      if (stopped) return
      stopped = true
      if (active === handle) active = null
      const out = master
      if (!out) return releaseAudio()
      const end = out.context.currentTime + FADE_S
      out.gain.cancelScheduledValues(out.context.currentTime)
      out.gain.setTargetAtTime(0, out.context.currentTime, FADE_S / 4)
      for (const v of voices) v.stop(end)
      voices = []
      window.setTimeout(() => {
        out.disconnect()
        // A new score may have started in the meantime; it keeps the audio awake.
        if (!active) releaseAudio()
      }, FADE_S * 1000 + 50)
    },
  }
  active = handle

  if (volume <= 0) return handle

  void wakeAudio().then((ctx) => {
    if (stopped || !ctx) {
      if (!stopped) handle.stop()
      return
    }
    const t0 = ctx.currentTime + 0.05
    master = ctx.createGain()
    master.gain.value = gainFor(volume)
    // Keeps stacked sounds from clipping.
    const limiter = ctx.createDynamicsCompressor()
    master.connect(limiter).connect(ctx.destination)

    const bedOut = ctx.createGain()
    bedOut.gain.setValueAtTime(BED_LEVEL, t0)
    bedOut.gain.setValueAtTime(BED_LEVEL, t0 + SCORING.total - 0.9)
    bedOut.gain.linearRampToValueAtTime(0, t0 + SCORING.total - 0.1)
    bedOut.connect(master)

    voices = [
      pack.intro(ctx, master, t0),
      pack.bed(ctx, bedOut, t0 + SCORING.countFrom),
      pack.drumRoll(ctx, master, t0 + SCORING.countFrom, SCORING.revealAt - SCORING.countFrom),
      pack.fanfare(ctx, master, t0 + SCORING.revealAt),
    ]
  })

  return handle
}
