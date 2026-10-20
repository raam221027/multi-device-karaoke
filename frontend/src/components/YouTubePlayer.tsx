import { useEffect, useLayoutEffect, useRef } from 'react'

// Minimal typings for the YouTube IFrame Player API.
type YTPlayer = {
  loadVideoById(id: string): void
  playVideo(): void
  pauseVideo(): void
  destroy(): void
  /** Undocumented, but the only way to beat captions the uploader or viewer forces on. */
  unloadModule?(name: string): void
}

type YTNamespace = {
  Player: new (
    el: HTMLElement,
    options: {
      videoId: string
      width?: string
      height?: string
      playerVars?: Record<string, number | string>
      events?: {
        onReady?: (e: { target: YTPlayer }) => void
        onStateChange?: (e: { data: number; target: YTPlayer }) => void
        onError?: (e: { data: number }) => void
      }
    },
  ) => YTPlayer
}

declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

const PLAYING = 1
const PAUSED = 2
const ENDED = 0
const BUFFERING = 3

// How long a play request may go unanswered before we assume the browser blocked it.
const BLOCKED_MS = 2500

/**
 * Karaoke videos have the lyrics burned in, so captions only cover them.
 * `cc_load_policy: 0` alone doesn't override the uploader's or viewer's
 * setting, and the module comes back with each video.
 */
function hideCaptions(p: YTPlayer) {
  for (const name of ['captions', 'cc']) {
    try {
      p.unloadModule?.(name)
    } catch {
      // YouTube changed something; captions just stay as they are.
    }
  }
}

let loading: Promise<YTNamespace> | null = null

function loadYouTube(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  loading ??= new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      resolve(window.YT!)
    }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    document.head.append(script)
  })
  return loading
}

/**
 * Plays one queue item at a time and reports what actually happened. Reports
 * carry the item id, so the server ignores anything about an old song.
 *
 * iPhones only play sound after a tap inside the video itself, and that permission
 * belongs to this one player. So keep it mounted between songs (`idle`) rather
 * than making a new one, and say when a play request goes nowhere (`onBlocked`).
 */
export default function YouTubePlayer({
  itemId,
  videoId,
  paused,
  idle = false,
  onStarted,
  onEnded,
  onBlocked,
}: {
  itemId: number
  videoId: string
  paused: boolean
  /** No song is current: stay paused on the last one, ready for the next. */
  idle?: boolean
  onStarted: (itemId: number) => void
  /** On an error, `code` is the player's error and `videoId` the upload that failed. */
  onEnded: (itemId: number, reason: 'ended' | 'error', error?: { code: number; videoId: string }) => void
  /** True when the browser won't start the video until someone taps it. */
  onBlocked?: (blocked: boolean) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  // Set once the player is ready; its methods don't exist before that.
  const player = useRef<YTPlayer | null>(null)

  // Latest props for the player's event callbacks, which are bound once.
  const latest = useRef({ itemId, videoId, paused, idle, onStarted, onEnded, onBlocked })
  useLayoutEffect(() => {
    latest.current = { itemId, videoId, paused, idle, onStarted, onEnded, onBlocked }
  })
  const loadedItem = useRef(itemId)
  // The server can swap in another upload of the same song, so the video can change under one item.
  const loadedVideo = useRef(videoId)
  const reportedStart = useRef<string | null>(null)
  const playerState = useRef<number | null>(null)
  const blockedTimer = useRef<number | undefined>(undefined)

  /** Play or pause to match the props, and watch whether a play actually starts. */
  function sync(p: YTPlayer) {
    clearTimeout(blockedTimer.current)
    if (latest.current.paused || latest.current.idle) {
      p.pauseVideo()
      latest.current.onBlocked?.(false)
      return
    }
    p.playVideo()
    blockedTimer.current = window.setTimeout(() => {
      const { paused, idle } = latest.current
      if (!paused && !idle && playerState.current !== PLAYING && playerState.current !== BUFFERING) {
        latest.current.onBlocked?.(true)
      }
    }, BLOCKED_MS)
  }

  useEffect(() => {
    let cancelled = false
    // YouTube replaces its element with an iframe, so give it one React doesn't own.
    const el = document.createElement('div')
    host.current?.append(el)

    loadYouTube().then((YT) => {
      if (cancelled) return
      new YT.Player(el, {
        videoId: latest.current.videoId,
        width: '100%',
        height: '100%',
        playerVars: { autoplay: 1, controls: 0, rel: 0, playsinline: 1, modestbranding: 1, iv_load_policy: 3, cc_load_policy: 0 },
        events: {
          onReady: (e) => {
            if (cancelled) return
            player.current = e.target
            // The song may have changed while the player was loading.
            if (loadedItem.current !== latest.current.itemId || loadedVideo.current !== latest.current.videoId) {
              loadedItem.current = latest.current.itemId
              loadedVideo.current = latest.current.videoId
              e.target.loadVideoById(latest.current.videoId)
            }
            sync(e.target)
          },
          onStateChange: (e) => {
            playerState.current = e.data
            if (e.data === PLAYING) {
              hideCaptions(e.target)
              clearTimeout(blockedTimer.current)
              latest.current.onBlocked?.(false)
            }
            // Nothing covers the video, so a tap on the screen can pause or play it.
            // The host's pause button is in charge: undo anything else.
            const shouldPlay = !latest.current.paused && !latest.current.idle
            if (e.data === PAUSED && shouldPlay) e.target.playVideo()
            if (e.data === PLAYING && !shouldPlay) e.target.pauseVideo()
            const id = loadedItem.current
            const key = `${id}:${loadedVideo.current}`
            if (e.data === PLAYING && reportedStart.current !== key) {
              reportedStart.current = key
              latest.current.onStarted(id)
            }
            if (e.data === ENDED) latest.current.onEnded(id, 'ended')
          },
          // Embedding disabled, removed video, etc.: the server tries another upload or moves on.
          onError: (e) => latest.current.onEnded(loadedItem.current, 'error', { code: e.data, videoId: loadedVideo.current }),
        },
      })
    })

    return () => {
      cancelled = true
      clearTimeout(blockedTimer.current)
      player.current?.destroy()
      player.current = null
      el.remove()
    }
  }, [])

  useEffect(() => {
    if ((loadedItem.current === itemId && loadedVideo.current === videoId) || !player.current) return
    loadedItem.current = itemId
    loadedVideo.current = videoId
    player.current.loadVideoById(videoId)
    sync(player.current)
  }, [itemId, videoId])

  useEffect(() => {
    if (player.current) sync(player.current)
  }, [paused, idle])

  return <div ref={host} className="size-full [&>iframe]:size-full" />
}
