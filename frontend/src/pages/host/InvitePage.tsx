import { QRCodeSVG } from 'qrcode.react'
import * as icons from '../../assets/icons'
import { useRoom } from '../../lib/roomContext'
import { Button, ButtonLink, Icon, Lead, PageHeading, Screen, StatusPill } from '../../components/ui'
import { isLocalhost, joinUrl, publicHost, useShare } from '../../lib/share'

/** "Room created · Invitation": the host's QR, code and share actions. */
export default function InvitePage() {
  const { state, base } = useRoom()
  const { room } = state
  const { status, share } = useShare()
  const url = joinUrl(room.code)

  return (
    <Screen>
      <PageHeading eyebrow="Room created" title="You’re the host." />
      <Lead className="text-[15px]">One room. Everyone’s phone. Invite your people and make the first song happen.</Lead>

      <section className="flex flex-col items-center gap-[14px] rounded-[20px] bg-surface p-5 text-center">
        <StatusPill>{room.name ?? 'Your room'}</StatusPill>
        <div className="rounded-xl bg-white p-3">
          <QRCodeSVG value={url} size={164} marginSize={0} title={`Join link for room ${room.code}`} />
        </div>
        <p className="font-bold tracking-[0.08em] text-[38px]">{room.code}</p>
        <p className="text-[14px] leading-[1.45] text-muted">
          Scan to join, or enter {room.code} at {publicHost()}
        </p>
        {isLocalhost && (
          <p className="text-[12px] leading-[1.45] text-danger">
            This QR points to localhost, which phones can’t reach. Open the app with your PC’s LAN IP instead.
          </p>
        )}
      </section>

      <div className="flex flex-col gap-2.5">
        <Button
          icon={icons.shareOnAccent}
          onClick={() =>
            share({ title: room.name ?? 'Karaoke', text: `Join ${room.name ?? 'my karaoke room'} with code ${room.code}`, url })
          }
        >
          {status === 'copied' ? 'Link copied' : status === 'failed' ? 'Couldn’t copy. Long-press the QR' : 'Share invite link'}
        </Button>
        <ButtonLink to={`${base}/invite/tv`} variant="secondary" icon={icons.monitor}>
          Show QR on TV / another screen
        </ButtonLink>
      </div>

      <div className="flex items-center gap-2.5">
        <Icon src={icons.smartphone} size={20} />
        <p className="flex-1 text-[14px] leading-[1.45] text-muted">
          Guests choose a name and join. No download or sign-up needed.
        </p>
      </div>

      <ButtonLink to={base} variant="secondary" icon={icons.arrowRight}>
        Go to live room
      </ButtonLink>
    </Screen>
  )
}
