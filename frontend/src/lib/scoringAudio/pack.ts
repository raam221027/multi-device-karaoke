// The scoring sounds, all synthesized: original tunes, no recordings. Swap
// in another pack (samples, a different tune) through ScoringSoundPack.

/** Something playing that can be cut off. */
export type Voice = { stop(at?: number): void }

export type ScoringSoundPack = {
  /** The opening jingle, about 1.5 seconds from `when`. */
  intro(ctx: AudioContext, out: AudioNode, when: number): Voice
  /** Soft background music that loops until stopped. */
  bed(ctx: AudioContext, out: AudioNode, when: number): Voice
  /** Builds up while the score counts, for `duration` seconds. */
  drumRoll(ctx: AudioContext, out: AudioNode, when: number, duration: number): Voice
  /** The cheer when the score lands. */
  fanfare(ctx: AudioContext, out: AudioNode, when: number): Voice
}

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

/** Collects what a sound scheduled, so stopping it is one call. */
class Voices implements Voice {
  private sources: AudioScheduledSourceNode[] = []
  private timers: number[] = []

  add(source: AudioScheduledSourceNode) {
    this.sources.push(source)
    source.onended = () => {
      this.sources = this.sources.filter((s) => s !== source)
    }
  }

  every(ms: number, fn: () => void) {
    this.timers.push(window.setInterval(fn, ms))
  }

  stop(at?: number) {
    for (const id of this.timers) clearInterval(id)
    this.timers = []
    for (const source of this.sources) {
      try {
        source.stop(at)
      } catch {
        // Already stopped.
      }
    }
  }
}

type Note = {
  midi: number
  start: number
  length: number
  type?: OscillatorType
  gain?: number
  /** Cents of wobble, for held notes. */
  vibrato?: number
}

function note(ctx: AudioContext, out: AudioNode, voices: Voices, n: Note) {
  const osc = ctx.createOscillator()
  const env = ctx.createGain()
  const peak = n.gain ?? 0.2
  const end = n.start + n.length
  osc.type = n.type ?? 'square'
  osc.frequency.value = hz(n.midi)
  env.gain.setValueAtTime(0, n.start)
  env.gain.linearRampToValueAtTime(peak, n.start + 0.01)
  env.gain.setTargetAtTime(peak * 0.6, n.start + 0.02, n.length / 3)
  env.gain.setTargetAtTime(0, end - 0.03, 0.02)
  if (n.vibrato) {
    const lfo = ctx.createOscillator()
    const depth = ctx.createGain()
    lfo.frequency.value = 6
    depth.gain.value = n.vibrato
    lfo.connect(depth).connect(osc.detune)
    lfo.start(n.start)
    lfo.stop(end + 0.1)
    voices.add(lfo)
  }
  osc.connect(env).connect(out)
  osc.start(n.start)
  osc.stop(end + 0.1)
  voices.add(osc)
}

const noiseBuffers = new WeakMap<AudioContext, AudioBuffer>()

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  let buffer = noiseBuffers.get(ctx)
  if (!buffer) {
    buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    noiseBuffers.set(ctx, buffer)
  }
  return buffer
}

/** A burst of filtered noise: snare, hi-hat or cymbal depending on the filter. */
function hit(
  ctx: AudioContext,
  out: AudioNode,
  voices: Voices,
  { start, decay, gain, filter, freq }: { start: number; decay: number; gain: number; filter: BiquadFilterType; freq: number },
) {
  const src = ctx.createBufferSource()
  const bandpass = ctx.createBiquadFilter()
  const env = ctx.createGain()
  src.buffer = noiseBuffer(ctx)
  bandpass.type = filter
  bandpass.frequency.value = freq
  env.gain.setValueAtTime(gain, start)
  env.gain.exponentialRampToValueAtTime(0.001, start + decay)
  src.connect(bandpass).connect(env).connect(out)
  src.start(start)
  src.stop(start + decay + 0.05)
  voices.add(src)
}

/** A short pitch drop: the kick drum. */
function kick(ctx: AudioContext, out: AudioNode, voices: Voices, start: number, gain = 0.5) {
  const osc = ctx.createOscillator()
  const env = ctx.createGain()
  osc.frequency.setValueAtTime(150, start)
  osc.frequency.exponentialRampToValueAtTime(45, start + 0.12)
  env.gain.setValueAtTime(gain, start)
  env.gain.exponentialRampToValueAtTime(0.001, start + 0.18)
  osc.connect(env).connect(out)
  osc.start(start)
  osc.stop(start + 0.2)
  voices.add(osc)
}

const snare = (ctx: AudioContext, out: AudioNode, v: Voices, start: number, gain = 0.25) =>
  hit(ctx, out, v, { start, decay: 0.12, gain, filter: 'bandpass', freq: 1800 })

// --- The arcade pack -------------------------------------------------------

const STEP = 0.1 // A sixteenth note in the intro (150 bpm).

function intro(ctx: AudioContext, out: AudioNode, when: number): Voice {
  const v = new Voices()
  // A rising run up to a held high note, C major.
  const lead = [72, 76, 79, 84, 79, 84, 88]
  lead.forEach((midi, i) => note(ctx, out, v, { midi, start: when + i * STEP, length: STEP * 0.9, gain: 0.16 }))
  const top = when + lead.length * STEP
  note(ctx, out, v, { midi: 91, start: top, length: 0.75, gain: 0.16, vibrato: 18 })
  note(ctx, out, v, { midi: 88, start: top, length: 0.75, gain: 0.08, type: 'triangle' })
  // Bass under it.
  for (const [midi, at, length] of [
    [48, 0, 0.35],
    [55, 0.4, 0.3],
    [60, top - when, 0.75],
  ] as const) {
    note(ctx, out, v, { midi, start: when + at, length, gain: 0.3, type: 'triangle' })
  }
  kick(ctx, out, v, when)
  kick(ctx, out, v, when + 0.4)
  snare(ctx, out, v, when + 0.6)
  kick(ctx, out, v, top)
  hit(ctx, out, v, { start: top, decay: 0.8, gain: 0.12, filter: 'highpass', freq: 7000 })
  return v
}

const BEAT = 60 / 128
// C, A minor, F, G: two beats each, then round again.
const CHORDS = [
  [60, 64, 67],
  [57, 60, 64],
  [53, 57, 60],
  [55, 59, 62],
]
const BAR = CHORDS.length * 2 * BEAT

function bedBar(ctx: AudioContext, out: AudioNode, v: Voices, start: number) {
  CHORDS.forEach((chord, i) => {
    const at = start + i * 2 * BEAT
    const root = chord[0] - 24
    // A bouncy octave bass on eighths.
    for (let e = 0; e < 4; e++) {
      note(ctx, out, v, { midi: root + (e % 2) * 12, start: at + e * (BEAT / 2), length: BEAT / 2.4, type: 'triangle', gain: 0.32 })
    }
    // Chord stabs on the off-beats.
    for (const off of [BEAT / 2, BEAT * 1.5]) {
      for (const midi of chord) note(ctx, out, v, { midi: midi + 12, start: at + off, length: 0.09, gain: 0.035 })
    }
    kick(ctx, out, v, at, 0.3)
    hit(ctx, out, v, { start: at + BEAT, decay: 0.05, gain: 0.06, filter: 'highpass', freq: 8000 })
  })
}

function bed(ctx: AudioContext, out: AudioNode, when: number): Voice {
  const v = new Voices()
  // Schedule a bar ahead. Background tabs only run timers once a second, so look well ahead.
  let next = when
  const fill = () => {
    while (next < ctx.currentTime + 2) {
      bedBar(ctx, out, v, next)
      next += BAR
    }
  }
  fill()
  v.every(250, fill)
  return v
}

function drumRoll(ctx: AudioContext, out: AudioNode, when: number, duration: number): Voice {
  const v = new Voices()
  // Hits get closer and louder as the score climbs.
  let t = 0
  while (t < duration) {
    const p = t / duration
    snare(ctx, out, v, when + t, 0.06 + 0.2 * p)
    t += 0.12 - 0.08 * p
  }
  return v
}

function fanfare(ctx: AudioContext, out: AudioNode, when: number): Voice {
  const v = new Voices()
  kick(ctx, out, v, when, 0.6)
  hit(ctx, out, v, { start: when, decay: 1.6, gain: 0.22, filter: 'highpass', freq: 6000 })
  // A quick run, then a big held chord.
  const run = [72, 76, 79, 84]
  run.forEach((midi, i) => note(ctx, out, v, { midi, start: when + i * 0.07, length: 0.08, gain: 0.16, type: 'sawtooth' }))
  const held = when + run.length * 0.07
  for (const midi of [84, 88, 91]) note(ctx, out, v, { midi, start: held, length: 1.3, gain: 0.08, type: 'sawtooth', vibrato: 14 })
  note(ctx, out, v, { midi: 48, start: held, length: 1.3, gain: 0.3, type: 'triangle' })
  // Sparkles over the top.
  ;[0.25, 0.4, 0.5, 0.7, 0.85, 1.05].forEach((at, i) =>
    note(ctx, out, v, { midi: [96, 100, 103, 108, 103, 105][i], start: held + at, length: 0.12, gain: 0.05, type: 'sine' }),
  )
  return v
}

export const arcadePack: ScoringSoundPack = {
  intro,
  bed,
  drumRoll,
  fanfare,
}
