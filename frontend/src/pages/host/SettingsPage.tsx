import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import * as icons from '../../assets/icons'
import { useRoom, useRoomMutation } from '../../lib/roomContext'
import { ButtonLink, ErrorText, Icon, PageHeading, Screen, SectionHeading, Toggle } from '../../components/ui'
import { phones, plural, screenKind } from '../../lib/format'
import { errorMessage, updateRoom } from '../../lib/rooms'
import type { RoomSettings } from '../../lib/types'

function Permission({
  title,
  detail,
  checked,
  onChange,
}: {
  title: string
  detail: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-center gap-4 border-b border-line py-[15px]">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-[15px]">{title}</p>
        <p className="text-[14px] leading-[1.45] text-muted">{detail}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} label={title} />
    </div>
  )
}

/** "Room settings · Permissions". Every change saves immediately. */
export default function SettingsPage() {
  const { state, roomId, base } = useRoom()
  const { room } = state

  // Show the new value immediately; the server confirms on refetch.
  const [pending, setPending] = useState<RoomSettings>({})
  const save = useRoomMutation((settings: RoomSettings) => updateRoom(roomId, settings))
  const value = { ...room, ...pending }

  function change(settings: RoomSettings) {
    setPending((prev) => ({ ...prev, ...settings }))
    save.mutate(settings, { onSettled: () => setPending({}) })
  }

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')

  function onRename(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (trimmed && trimmed !== room.name) change({ name: trimmed })
    setEditing(false)
  }

  return (
    <Screen>
      <PageHeading eyebrow="Host settings" title="Your room, your rules." />

      <section className="flex flex-col gap-[14px] rounded-2xl bg-surface p-4">
        {editing ? (
          <form onSubmit={onRename} className="flex flex-col gap-2">
            <label htmlFor="room-name" className="text-[14px] text-muted">
              Room name
            </label>
            <input
              id="room-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={onRename}
              maxLength={40}
              autoFocus
              className="h-11 rounded-xl border border-accent bg-bg px-3 text-[17px] font-bold outline-none"
            />
          </form>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-[7px]">
              <p className="truncate text-[17px] font-bold">{value.name ?? 'Your room'}</p>
              <p className="text-[14px] text-muted">
                {room.code} · {plural(phones(state.participants).length, 'person', 'people')}
              </p>
            </div>
            <button
              type="button"
              aria-label="Rename the room"
              onClick={() => {
                setName(value.name ?? '')
                setEditing(true)
              }}
            >
              <Icon src={icons.pencil} size={18} />
            </button>
          </div>
        )}
        <Link to={`${base}/invite`} className="py-2 text-[14px] text-accent">
          View QR &amp; share invitation →
        </Link>
      </section>

      <section className="flex flex-col">
        <SectionHeading title="Guest permissions" aside={save.isPending ? 'Saving…' : 'Saved automatically'} />
        <Permission
          title="Lock room & hide QR code"
          detail={
            value.is_locked
              ? 'Locked. The QR code is hidden and nobody new can join.'
              : `New people can join by scanning the QR code on the ${screenKind(state)}.`
          }
          checked={value.is_locked}
          onChange={(locked) => change({ is_locked: locked })}
        />
        <Permission
          title="Allow song additions"
          detail={
            value.allow_song_additions
              ? 'Guests can add songs. Individual blocks still apply.'
              : 'Paused for guests. You can still add songs.'
          }
          checked={value.allow_song_additions}
          onChange={(allow) => change({ allow_song_additions: allow })}
        />
        <Permission
          title="Let guests skip songs"
          detail={
            value.guests_can_skip
              ? 'On. Guests can skip the current song.'
              : 'Off. Only you and the singer can skip their song.'
          }
          checked={value.guests_can_skip}
          onChange={(allow) => change({ guests_can_skip: allow })}
        />
        <ErrorText>{save.isError && errorMessage(save.error)}</ErrorText>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading title="Playback" />
        <p className="text-[14px] leading-[1.45] text-muted">
          Videos play on one screen: a TV, laptop, tablet or spare phone. Keep that browser tab open and the screen
          awake; it may need one tap to start the sound. Connecting another screen moves playback there.
        </p>
        <ButtonLink to={`${base}/invite/tv`} variant="secondary" icon={icons.monitorSettings}>
          {state.display_connected
            ? 'Switch display'
            : 'Set up a display'}
        </ButtonLink>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-danger-soft p-4">
        <h2 className="text-[16px] font-bold">Calling it a night?</h2>
        <p className="text-[14px] leading-[1.45] text-muted">
          Closing stops playback, clears the queue and ends the room for everyone.
        </p>
        <ButtonLink to={`${base}/close`} variant="danger" icon={icons.power}>
          Close room…
        </ButtonLink>
      </section>
    </Screen>
  )
}
