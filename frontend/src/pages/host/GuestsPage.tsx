import { useState } from 'react'
import { Link } from 'react-router-dom'
import * as icons from '../../assets/icons'
import { useRoom, useRoomMutation } from '../../lib/roomContext'
import { Avatar, Button, ErrorText, Icon, Lead, Note, PageHeading, Screen, StatusPill, TextLink, Toggle } from '../../components/ui'
import { displayLabel, phones, plural, singerStatus } from '../../lib/format'
import { errorMessage, setCanAddSongs } from '../../lib/rooms'
import { joinUrl, useShare } from '../../lib/share'
import type { Participant } from '../../lib/types'

/** "Guest management · Song permissions". */
export default function GuestsPage() {
  const { state, roomId, base } = useRoom()
  const { room, me, participants } = state
  const { status, share } = useShare()

  // Show the switch's new position immediately; the server confirms on refetch.
  const [pending, setPending] = useState<Record<number, boolean>>({})
  const toggle = useRoomMutation(({ id, value }: { id: number; value: boolean }) => setCanAddSongs(roomId, id, value))

  function onToggle(p: Participant, value: boolean) {
    setPending((prev) => ({ ...prev, [p.id]: value }))
    toggle.mutate(
      { id: p.id, value },
      {
        onSettled: () =>
          setPending((prev) => {
            const { [p.id]: _, ...rest } = prev
            return rest
          }),
      },
    )
  }

  const people = phones(participants)
  const host = people.find((p) => p.role === 'host')
  const guests = people.filter((p) => p.role === 'guest')
  const display = participants.find((p) => p.role === 'display')

  return (
    <Screen>
      <PageHeading
        eyebrow={`${plural(people.length, 'person', 'people')} · Room ${room.code}`}
        title="Your kind of crowd."
        action={<TextLink to={`${base}/invite`}>Invite +</TextLink>}
      />
      <Lead>Keep the good times flowing. Decide who can add songs, remove a guest, or make someone else the host.</Lead>

      <section>
        <div className="flex gap-3 pb-2 text-[12px] text-muted">
          <span className="flex-1">IN THE ROOM</span>
          <span className="w-12 text-center">Can add</span>
          <span className="w-11 text-center">Remove</span>
        </div>

        {host && (
          <div className="flex items-center gap-2.5 border-b border-line py-3.5">
            <Avatar id={host.id} name={host.display_name} size={36} />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <p className="truncate text-[15px]">{host.id === me.id ? `${host.display_name} · You` : host.display_name}</p>
              <p className="text-[12px] text-muted">{singerStatus(state, host.id) ?? 'Host'}</p>
            </div>
            <div className="flex w-[102px] justify-end">
              <StatusPill>Host</StatusPill>
            </div>
          </div>
        )}

        {guests.map((guest) => {
          const canAdd = pending[guest.id] ?? guest.can_add_songs
          return (
            <div key={guest.id} className="flex items-center gap-2.5 border-b border-line py-3.5">
              <Avatar id={guest.id} name={guest.display_name} size={36} />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <p className="truncate text-[15px]">{guest.display_name}</p>
                <p className="truncate text-[12px]">
                  <span className={canAdd ? 'text-muted' : 'text-danger'}>
                    {canAdd ? (singerStatus(state, guest.id) ?? 'Joined') : 'Song additions blocked'}
                  </span>
                  <span className="text-muted"> · </span>
                  <Link to={`${base}/guests/${guest.id}/make-host`} className="font-semibold text-accent">
                    Make host
                  </Link>
                </p>
              </div>
              <Toggle
                checked={canAdd}
                onChange={(value) => onToggle(guest, value)}
                label={`${guest.display_name} can add songs`}
              />
              <Link
                to={`${base}/guests/${guest.id}/remove`}
                aria-label={`Remove ${guest.display_name}`}
                className="flex size-11 shrink-0 items-center justify-center"
              >
                <Icon src={icons.userMinus} size={19} />
              </Link>
            </div>
          )
        })}

        {display && (
          <div className="flex items-center gap-2.5 border-b border-line py-3.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2">
              <Icon src={icons.monitor} size={18} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <p className="truncate text-[15px]">{displayLabel(display)}</p>
              <p className="text-[12px]">
                <span className="text-muted">Plays the videos · </span>
                <Link to={`${base}/invite/tv`} className="font-semibold text-accent">
                  Switch display
                </Link>
              </p>
            </div>
            <Link
              to={`${base}/guests/${display.id}/remove`}
              aria-label="Disconnect the display"
              className="flex size-11 shrink-0 items-center justify-center"
            >
              <Icon src={icons.userMinus} size={19} />
            </Link>
          </div>
        )}

        {guests.length === 0 && (
          <p className="py-3.5 text-[14px] text-muted">No guests yet. Share the invite and they’ll show up here.</p>
        )}
        <ErrorText>{toggle.isError && errorMessage(toggle.error)}</ErrorText>
      </section>

      <Note icon={icons.shieldCheck}>
        Turning off “Can add” blocks new additions only. Songs already queued stay in place. Guests can still follow
        along.
      </Note>

      <Button
        variant="secondary"
        icon={icons.share}
        onClick={() =>
          share({ title: room.name ?? 'Karaoke', text: `Join ${room.name ?? 'my karaoke room'} with code ${room.code}`, url: joinUrl(room.code) })
        }
      >
        {status === 'copied' ? 'Link copied' : 'Share room invitation'}
      </Button>
    </Screen>
  )
}
