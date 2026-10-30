// One AudioContext for the screen's own sounds. YouTube plays in its iframe
// and never goes through this.

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext }

let ctx: AudioContext | null = null
let inUse = false

/**
 * Browsers only let a page start sound after a tap. Call this inside one
 * (the Connect or "Tap to start" tap) so later scores can play on their own.
 */
export function unlockAudio(): void {
  try {
    const Context = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext
    if (!Context) return
    ctx ??= new Context()
    // iPhones also want something played during the tap itself.
    const silence = ctx.createBufferSource()
    silence.buffer = ctx.createBuffer(1, 1, 22050)
    silence.connect(ctx.destination)
    silence.start()
    void ctx
      .resume()
      .then(() => rest())
      .catch(() => {})
  } catch {
    // No Web Audio here; scores just show without sound.
  }
}

/** The context, running, or null when the browser won't play sound yet. */
export async function wakeAudio(): Promise<AudioContext | null> {
  if (!ctx) return null
  inUse = true
  try {
    if (ctx.state !== 'running') await ctx.resume()
  } catch {
    // Still blocked.
  }
  return ctx.state === 'running' ? ctx : null
}

/** Done for now. A sleeping context leaves the phone's audio to YouTube. */
export function releaseAudio(): void {
  inUse = false
  rest()
}

function rest() {
  if (ctx && !inUse && ctx.state === 'running') void ctx.suspend().catch(() => {})
}
