import { QRCodeSVG } from 'qrcode.react'
import type { ReactNode } from 'react'
import * as icons from '../../assets/icons'
import { useRoom } from '../../lib/roomContext'
import { Button, ButtonLink, Lead, PageHeading, Screen, StatusPill } from '../../components/ui'
import { joinUrl, publicHost, publicOrigin, useShare } from '../../lib/share'

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

/** "TV invitation · Browser handoff": connect a TV/laptop that plays the videos. */
export default function TvInvitePage() {
  const { state, base } = useRoom()
  const { room, display_connected } = state
  const { status, copy } = useShare()
  const displayAddress = `${publicHost()}/display`

  return (
    <Screen>
      <PageHeading eyebrow="Invite on a bigger screen" title="Give the QR a stage." />
      <Lead>Use a TV, tablet or laptop with a web browser. It plays the videos. Your phone stays in charge.</Lead>

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
        <p className="text-center text-[10px] leading-[1.45] text-muted">What the TV shows between songs</p>
      </section>

      <ol className="flex flex-col gap-5">
        <Step n={1} title="Open the display page">
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
          The TV plays each karaoke video and shows this invite between songs. Pause and skip from your phone.
        </p>
      </section>

      <Button variant="secondary" icon={icons.copy} onClick={() => copy(`${publicOrigin()}/display`)}>
        {status === 'copied' ? 'Address copied' : status === 'failed' ? 'Couldn’t copy' : 'Copy display address'}
      </Button>
      <ButtonLink to={base} icon={icons.arrowLeftOnAccent}>
        Back to my room
      </ButtonLink>
    </Screen>
  )
}
