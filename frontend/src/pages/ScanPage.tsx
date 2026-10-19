import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import * as icons from '../assets/icons'
import { ButtonLink, Card, Icon } from '../components/ui'
import { codeFromQr, displayCodeFromQr } from '../lib/rooms'

type CameraState = 'starting' | 'scanning' | { problem: string }

// Missing outside secure contexts (plain http on a LAN address), despite the DOM types.
const canOpenCamera = typeof navigator.mediaDevices?.getUserMedia === 'function'

function cameraProblem(error: unknown): string {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera access was blocked.'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found on this device.'
  if (name === 'NotReadableError') return 'The camera is in use by another app.'
  return 'The camera couldn’t be started.'
}

/** Reads a room QR with the phone's camera, then hands off to the join page. */
export default function ScanPage() {
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [camera, setCamera] = useState<CameraState>(() =>
    canOpenCamera ? 'starting' : { problem: 'This browser can’t open the camera on this page.' },
  )
  const [wrongQr, setWrongQr] = useState(false)

  useEffect(() => {
    if (!canOpenCamera) return

    let stream: MediaStream | null = null
    let frame = 0
    let lastScan = 0
    let stopped = false
    let decode: typeof import('jsqr').default | null = null
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d', { willReadFrequently: true })

    function stop() {
      stopped = true
      cancelAnimationFrame(frame)
      stream?.getTracks().forEach((track) => track.stop())
    }

    function scan(time: number) {
      if (stopped) return
      frame = requestAnimationFrame(scan)

      const video = videoRef.current
      if (!video || !context || !decode || video.readyState < video.HAVE_ENOUGH_DATA || time - lastScan < 150) return
      lastScan = time

      // Decode a downscaled frame: plenty for a QR filling the viewfinder, and much faster.
      const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight))
      canvas.width = Math.round(video.videoWidth * scale)
      canvas.height = Math.round(video.videoHeight * scale)
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      const image = context.getImageData(0, 0, canvas.width, canvas.height)
      const qr = decode(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })
      if (!qr) return

      const code = codeFromQr(qr.data)
      const displayCode = displayCodeFromQr(qr.data)
      if (code) {
        stop()
        navigate(`/join/${code}`, { replace: true })
      } else if (displayCode) {
        // The host's "use a phone as the screen" QR: connect this device as the display.
        stop()
        navigate(`/display?code=${displayCode}`, { replace: true })
      } else {
        setWrongQr(true)
      }
    }

    // The decoder loads alongside the camera, so it stays out of the main bundle.
    import('jsqr').then((module) => (decode = module.default))

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(async (media) => {
        stream = media
        if (stopped) return stop()
        const video = videoRef.current
        if (!video) return
        video.srcObject = media
        await video.play()
        setCamera('scanning')
        frame = requestAnimationFrame(scan)
      })
      .catch((error: unknown) => {
        if (!stopped) setCamera({ problem: cameraProblem(error) })
      })

    return stop
  }, [navigate])

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-[22px] px-5 py-6">
      <header className="flex items-center gap-3">
        <Link to="/" aria-label="Back" className="-ml-2 flex size-11 items-center justify-center rounded-full hover:bg-surface">
          <span aria-hidden className="text-[22px] leading-none">←</span>
        </Link>
        <div className="flex flex-col">
          <h1 className="text-[20px] font-bold">Scan the QR on the TV</h1>
          <p className="text-[14px] text-muted">or on the host’s phone</p>
        </div>
      </header>

      {typeof camera === 'object' ? (
        <Card>
          <div className="flex items-center gap-2">
            <Icon src={icons.info} size={18} />
            <h2 className="text-[15px] font-bold">{camera.problem}</h2>
          </div>
          <p className="text-[14px] leading-[1.45] text-muted">
            Point your phone’s camera app at the QR instead, or type the room code shown under it.
          </p>
        </Card>
      ) : (
        <>
          <div className="relative aspect-square overflow-hidden rounded-3xl bg-surface">
            <video ref={videoRef} playsInline muted className="absolute inset-0 size-full object-cover" />
            {camera === 'starting' && (
              <p className="absolute inset-0 flex items-center justify-center text-[14px] text-muted">Opening camera…</p>
            )}
            <div aria-hidden className="pointer-events-none absolute inset-[18%]">
              <span className="absolute top-0 left-0 size-8 rounded-tl-xl border-t-4 border-l-4 border-accent" />
              <span className="absolute top-0 right-0 size-8 rounded-tr-xl border-t-4 border-r-4 border-accent" />
              <span className="absolute bottom-0 left-0 size-8 rounded-bl-xl border-b-4 border-l-4 border-accent" />
              <span className="absolute right-0 bottom-0 size-8 rounded-br-xl border-r-4 border-b-4 border-accent" />
            </div>
          </div>
          <p aria-live="polite" className={`text-center text-[14px] ${wrongQr ? 'text-danger' : 'text-muted'}`}>
            {wrongQr ? 'That QR isn’t a Videokehan room. Try the one on the TV.' : 'Hold the QR inside the frame.'}
          </p>
        </>
      )}

      <ButtonLink to="/" state={{ join: true }} variant="secondary">
        Enter code instead
      </ButtonLink>
    </main>
  )
}
