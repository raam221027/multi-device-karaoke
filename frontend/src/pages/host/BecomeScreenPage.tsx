import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as icons from '../../assets/icons'
import { useRoom } from '../../lib/roomContext'
import { Avatar, Button, ButtonLink, ErrorText, Icon, Lead, Note, PageHeading, Screen } from '../../components/ui'
import { setToken } from '../../lib/api'
import { becomeDisplay, phoneBecomesDisplay } from '../../lib/display'
import { displayLabel, singerStatus } from '../../lib/format'
import { errorMessage } from '../../lib/rooms'

/**
 * "Use this device as the screen". The room always needs a host, so the host
 * picks who takes over: a guest phone, or the current screen (a swap). Nobody
 * reconnects; each device switches to its new role within a few seconds.
 */
export default function BecomeScreenPage() {
  const { state, roomId, base } = useRoom()
  const navigate = useNavigate()
  const screen = state.participants.find((p) => p.role === 'display')
  const guests = state.participants.filter((p) => p.role === 'guest')
  const candidates = screen ? [screen, ...guests] : guests
  const [picked, setPicked] = useState<number | null>(null)
  const next = candidates.find((p) => p.id === picked) ?? null
  const nextName = (p: { role: string; display_name: string | null }) =>
    p.role === 'display' ? 'the current display' : (p.display_name ?? 'them')

  const handOff = useMutation({
    mutationFn: (participantId: number) => becomeDisplay(roomId, participantId),
    onSuccess: () => {
      // Same token, now with the display role.
      phoneBecomesDisplay(roomId)
      navigate('/display', { replace: true })
      setToken(null)
    },
  })

  return (
    <Screen>
      <PageHeading back={{ to: `${base}/invite/tv`, label: 'Back to display setup' }} title="Use this phone as the display" />
      <Lead>
        This phone will play the videos. Someone else takes over as host first, so the room is never without one. Their
        device stays connected and switches to the host controls within a few seconds.
      </Lead>

      <section className="flex flex-col">
        <p className="pb-2 text-[10px] text-muted">WHO HOSTS NEXT?</p>
        {candidates.map((p) => {
          const selected = p.id === picked
          const isScreen = p.role === 'display'
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={selected}
              onClick={() => setPicked(p.id)}
              className={`flex items-center gap-2.5 border-b border-line py-3.5 text-left ${selected ? 'text-accent' : ''}`}
            >
              {isScreen ? (
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2">
                  <Icon src={icons.monitor} size={18} />
                </span>
              ) : (
                <Avatar id={p.id} name={p.display_name} size={36} />
              )}
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="truncate text-[14px]">{isScreen ? displayLabel(p) : p.display_name}</span>
                <span className="text-[10px] text-muted">
                  {isScreen ? 'Swap: it becomes the host, this phone the display' : (singerStatus(state, p.id) ?? 'Joined')}
                </span>
              </span>
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full border ${
                  selected ? 'border-accent bg-accent' : 'border-line'
                }`}
              >
                {selected && <Icon src={icons.check} size={14} />}
              </span>
            </button>
          )
        })}
        {candidates.length === 0 && (
          <p className="py-3.5 text-[13px] leading-[1.45] text-muted">
            No one to hand over to yet. Invite a guest or connect a display, then come back here.
          </p>
        )}
      </section>

      <Note icon={icons.shieldCheck}>
        {screen && next && next.role !== 'display'
          ? 'This phone replaces the current display. Your waiting songs stay in the queue.'
          : 'Your waiting songs stay in the queue.'}
      </Note>

      <ErrorText>{handOff.isError && errorMessage(handOff.error)}</ErrorText>
      {candidates.length === 0 ? (
        <ButtonLink to={`${base}/invite`} icon={icons.shareOnAccent}>
          Invite someone
        </ButtonLink>
      ) : (
        <Button
          onClick={() => next && handOff.mutate(next.id)}
          disabled={!next || handOff.isPending || handOff.isSuccess}
        >
          {handOff.isPending || handOff.isSuccess
            ? 'Switching…'
            : next
              ? `Make ${nextName(next)} host & use this phone as display`
              : 'Pick the next host'}
        </Button>
      )}
    </Screen>
  )
}
