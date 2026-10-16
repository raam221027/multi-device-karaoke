import { QRCodeSVG } from 'qrcode.react'
import type { ReactNode } from 'react'
import * as icons from '../../assets/icons'
import { useRoom } from '../../lib/roomContext'
import { Button, ButtonLink, Lead, PageHeading, Screen, StatusPill } from '../../components/ui'
import { displayUrl, joinUrl, publicHost, useShare } from '../../lib/share'

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-bold text-accent">
        {n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-[7px]">
        <p className="text-[15px]">{title}</p>
        {children}
      </div>
    </li>
  )
}

/** "TV invitation · Browser handoff": connect a TV, laptop or spare phone that plays the videos. */
export default function TvInvitePage() {
  const { state, base } = useRoom()
  const { room, display_connected } = state
  const { status, copy } = useShare()
  const displayAddress = `${publicHost()}/display`

  return (
    <Screen>
      <PageHeading eyebrow="Invite on a bigger screen" title="Give the QR a stage." />
      <Lead>
        Use a TV, tablet, laptop or a spare phone with a web browser. It plays the videos. Your phone stays in charge.
      </Lead>

      <section className="flex flex-col gap-[9px] rounded-2xl bg-surface p-3">
        <div className="flex h-[180px] items-center gap-[18px] rounded-lg bg-screen p-[18px]">
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            <p className="text-[16px] font-extrabold text-accent">Videokehan</p>
            <p className="text-[24px] leading-[1.1]">The mic is for everyone.</p>
            <p className="truncate text-[9px] text-muted">
              {publicHost()} · {room.code}
            </p>
          </div>
          <div className="shrink-0 rounded-md bg-white p-2">
            <QRCodeSVG value={joinUrl(room.code)} size={102} marginSize={0} />
          </div>
        </div>
        <p className="text-center text-[10px] leading-[1.45] text-muted">What the screen shows between songs</p>
      </section>

      {/* Not the join QR: scanning this makes the device the room's screen, not a singer. */}
      <section className="flex items-center gap-4 rounded-2xl bg-surface p-4">
        <div className="shrink-0 rounded-md bg-white p-2">
          <QRCodeSVG value={displayUrl(room.code)} size={96} marginSize={0} title="Scan to use this device as the screen" />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="text-[15px] font-bold">Using a phone or tablet?</p>
          <p className="text-[12px] leading-[1.45] text-muted">
            Scan this with its camera, then tap “Connect”. Guests should scan the invite QR instead.
          </p>
        </div>
      </section>

      <ol className="flex flex-col gap-5">
        <Step n={1} title="Or open the display page">
          <p className="text-[13px] leading-[1.45] text-muted">In the other screen’s browser, go to:</p>
          <p className="text-[19px] break-all text-accent">{displayAddress}</p>
        </Step>
        <Step n={2} title="Connect it to this room">
          <p className="text-[13px] leading-[1.45] text-muted">Enter {room.code} and choose “Connect”.</p>
        </Step>
      </ol>

      <section className="flex flex-col gap-[14px] rounded-2xl bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px]">TV display</p>
          <StatusPill tone={display_connected ? 'accent' : 'danger'}>
            {display_connected ? 'Connected' : 'Not connected'}
          </StatusPill>
        </div>
        <p className="text-[12px] leading-[1.45] text-muted">
          The screen plays each karaoke video and shows the invite between songs. Pause and skip from your phone.
          {display_connected && ' Connecting another screen replaces the current one.'}
          {room.is_locked && ' The room is locked, so unlock it before connecting a screen.'}
        </p>
      </section>

      <Button variant="secondary" icon={icons.copy} onClick={() => copy(displayUrl(room.code))}>
        {status === 'copied' ? 'Link copied' : status === 'failed' ? 'Couldn’t copy' : 'Copy display link'}
      </Button>
      <ButtonLink to={base} icon={icons.arrowLeftOnAccent}>
        Back to my room
      </ButtonLink>
    </Screen>
  )
}
