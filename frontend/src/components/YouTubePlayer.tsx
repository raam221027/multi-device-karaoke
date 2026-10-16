import { useEffect, useLayoutEffect, useRef } from 'react'

// Minimal typings for the YouTube IFrame Player API.
type YTPlayer = {
  loadVideoById(id: string): void
  playVideo(): void
  pauseVideo(): void
  destroy(): void
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
        onStateChange?: (e: { data: number }) => void
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
const ENDED = 0

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
 */
export default function YouTubePlayer({
  itemId,
  videoId,
  paused,
  onStarted,
  onEnded,
}: {
  itemId: number
  videoId: string
  paused: boolean
  onStarted: (itemId: number) => void
  /** On an error, `code` is the player's error and `videoId` the upload that failed. */
  onEnded: (itemId: number, reason: 'ended' | 'error', error?: { code: number; videoId: string }) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  // Set once the player is ready; its methods don't exist before that.
  const player = useRef<YTPlayer | null>(null)

  // Latest props for the player's event callbacks, which are bound once.
  const latest = useRef({ itemId, videoId, paused, onStarted, onEnded })
  useLayoutEffect(() => {
    latest.current = { itemId, videoId, paused, onStarted, onEnded }
  })
  const loadedItem = useRef(itemId)
  // The server can swap in another upload of the same song, so the video can change under one item.
  const loadedVideo = useRef(videoId)
  const reportedStart = useRef<string | null>(null)

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
        playerVars: { autoplay: 1, controls: 0, rel: 0, playsinline: 1, modestbranding: 1, iv_load_policy: 3 },
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
            if (latest.current.paused) e.target.pauseVideo()
            else e.target.playVideo()
          },
          onStateChange: (e) => {
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
  }, [itemId, videoId])

  useEffect(() => {
    const p = player.current
    if (!p) return
    if (paused) p.pauseVideo()
    else p.playVideo()
  }, [paused])

  return <div ref={host} className="size-full [&>iframe]:size-full" />
}
