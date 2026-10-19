import { QRCodeSVG } from 'qrcode.react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import * as icons from '../../assets/icons'
import { useRoom, useRoomMutation } from '../../lib/roomContext'
import { Avatar, Button, ButtonLink, ErrorText, Icon, Lead, PageHeading, Screen, StatusPill } from '../../components/ui'
import { errorMessage, makeDisplay } from '../../lib/rooms'
import { displayLabel } from '../../lib/format'
import { displayUrl, joinUrl, publicHost, useShare } from '../../lib/share'

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[14px] font-bold text-accent">
        {n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-[7px]">
        <p className="text-[15px]">{title}</p>
        {children}
      </div>
    </li>
  )
}

/**
 * "TV invitation · Browser handoff": connect the screen that plays the videos,
 * or switch to another one. Any browser works, and connecting a new screen
 * replaces the current one, so switching is just connecting.
 */
export default function TvInvitePage() {
  const { state, base } = useRoom()
  const { room } = state
  const { status, copy } = useShare()
  const displayAddress = `${publicHost()}/display`
  const screen = state.participants.find((p) => p.role === 'display')
  const screenName = screen ? displayLabel(screen) : ''
  const me = state.me
  const guests = state.participants.filter((p) => p.role === 'guest')
  const pick = useRoomMutation((participantId: number) => makeDisplay(room.id, participantId))

  return (
    <Screen>
      <PageHeading
        eyebrow={screen ? 'Switch screens' : 'Invite on a bigger screen'}
        title={screen ? 'Move the show.' : 'Give the QR a stage.'}
      />
      <Lead>
        Use a TV, tablet, laptop or a spare phone with a web browser. It plays the videos. Your phone stays in charge.
      </Lead>

      <section className="flex flex-col gap-[14px] rounded-2xl bg-surface p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2">
            <Icon src={icons.monitor} size={18} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="truncate text-[15px]">{screen ? screenName : 'No display yet'}</p>
            <p className="text-[13px] text-muted">{screen ? 'Plays the videos now' : 'Videos wait until one connects'}</p>
          </div>
          <StatusPill tone={screen ? 'accent' : 'danger'}>{screen ? 'Connected' : 'Not connected'}</StatusPill>
        </div>
        <p className="text-[14px] leading-[1.45] text-muted">
          {screen
            ? 'To switch, pick a phone in the room or connect another device below. Playback moves there and the song keeps its place.'
            : 'The screen plays each karaoke video and shows the invite between songs. Pause and skip from your phone.'}
          {room.is_locked && ' The room is locked, so unlock it before connecting a screen.'}
        </p>
        {screen && (
          <Link to={`${base}/guests/${screen.id}/remove`} className="py-2 text-[14px] text-danger">
            Disconnect {screenName}
          </Link>
        )}
      </section>

      {/* Phones already in the room switch roles in place: no code, no reconnecting. */}
      <section className="flex flex-col">
        <p className="pb-2 text-[12px] text-muted">PLAY ON A DEVICE IN THE ROOM</p>
        <div className="flex items-center gap-2.5 border-b border-line py-3.5">
          <Avatar id={me.id} name={me.display_name} size={36} />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <p className="truncate text-[15px]">{me.display_name} · You</p>
            <p className="text-[12px] text-muted">You’ll hand off hosting first</p>
          </div>
          <ButtonLink to={`${base}/invite/tv/this-device`} variant="secondary" className="h-10! w-auto! shrink-0 px-5 text-[14px]!">
            Use
          </ButtonLink>
        </div>
        {guests.map((guest) => (
          <div key={guest.id} className="flex items-center gap-2.5 border-b border-line py-3.5">
            <Avatar id={guest.id} name={guest.display_name} size={36} />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <p className="truncate text-[15px]">{guest.display_name}</p>
              <p className="text-[12px] text-muted">Guest phone</p>
            </div>
            <Button
              variant="secondary"
              className="h-10! w-auto! shrink-0 px-5 text-[14px]!"
              onClick={() => pick.mutate(guest.id)}
              disabled={pick.isPending}
            >
              {pick.isPending && pick.variables === guest.id ? 'Switching…' : 'Use'}
            </Button>
          </div>
        ))}
        {guests.length === 0 && (
          <p className="py-3.5 text-[14px] leading-[1.45] text-muted">Guests’ phones show up here once they join.</p>
        )}
        <ErrorText>{pick.isError && errorMessage(pick.error)}</ErrorText>
        <p className="pt-3 text-[14px] leading-[1.45] text-muted">
          The phone switches to the display within a few seconds; tap it once to start sound.
          {screen && ' The current display goes back to being a guest phone, or disconnects if it joined by code.'}
        </p>
      </section>

      {/* Not the join QR: scanning this makes the device the room's screen, not a singer. */}
      <section className="flex items-center gap-4 rounded-2xl bg-surface p-4">
        <div className="shrink-0 rounded-md bg-white p-2">
          <QRCodeSVG value={displayUrl(room.code)} size={96} marginSize={0} title="Scan to use this device as the screen" />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="text-[15px] font-bold">{screen ? 'Switching to a phone or tablet?' : 'Using a phone or tablet?'}</p>
          <p className="text-[14px] leading-[1.45] text-muted">
            Scan this with its camera, then tap “Connect”. Guests should scan the invite QR instead.
          </p>
        </div>
      </section>

      <ol className="flex flex-col gap-5">
        <Step n={1} title={screen ? 'Switching to a TV or computer? Open the display page' : 'Or open the display page'}>
          <p className="text-[14px] leading-[1.45] text-muted">In the other screen’s browser, go to:</p>
          <p className="text-[19px] break-all text-accent">{displayAddress}</p>
        </Step>
        <Step n={2} title="Connect it to this room">
          <p className="text-[14px] leading-[1.45] text-muted">Enter {room.code} and choose “Connect”.</p>
        </Step>
      </ol>

      <section className="flex flex-col gap-[9px] rounded-2xl bg-surface p-3">
        <div className="flex h-[180px] items-center gap-[18px] rounded-lg bg-screen p-[18px]">
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            <p className="text-[16px] font-extrabold text-accent">Videokehan</p>
            <p className="text-[24px] leading-[1.1]">The mic is for everyone.</p>
            <p className="truncate text-[12px] text-muted">
              {publicHost()} · {room.code}
            </p>
          </div>
          <div className="shrink-0 rounded-md bg-white p-2">
            <QRCodeSVG value={joinUrl(room.code)} size={102} marginSize={0} />
          </div>
        </div>
        <p className="text-center text-[12px] leading-[1.45] text-muted">What the screen shows between songs</p>
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
