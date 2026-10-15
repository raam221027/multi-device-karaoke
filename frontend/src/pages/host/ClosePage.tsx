import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import * as icons from '../../assets/icons'
import { useRoom } from '../../lib/roomContext'
import { ConfirmCard, DangerTile } from '../../components/songs'
import { Button, ErrorText, Icon, PageHeading, Screen } from '../../components/ui'
import { listNames, plural, songName } from '../../lib/format'
import { setToken } from '../../lib/api'
import { closeRoom, errorMessage } from '../../lib/rooms'

function Consequence({ icon, title, detail }: { icon: string; title: string; detail: string }) {
  return (
    <li className="flex items-start gap-3">
      <Icon src={icon} size={20} />
      <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
        <p className="text-[13px]">{title}</p>
        <p className="text-[12px] leading-[1.45] text-muted">{detail}</p>
      </div>
    </li>
  )
}

/** "Close room · Confirmation". */
export default function ClosePage() {
  const { state, roomId, base } = useRoom()
  const navigate = useNavigate()
  const { room, queue, me } = state

  const close = useMutation({
    mutationFn: () => closeRoom(roomId),
    onSuccess: () => {
      navigate('/', { replace: true, state: { notice: 'Room closed. Thanks for singing!' } })
      setToken(null)
    },
  })

  const who = (p: { id: number; display_name: string | null }) => (p.id === me.id ? 'you' : (p.display_name ?? 'someone'))
  const singers = [...new Set(queue.upcoming.map((item) => who(item.added_by)))]

  return (
    <Screen>
      <PageHeading back={{ to: `${base}/settings`, label: 'Back to room settings' }} title="One last check." />

      <ConfirmCard
        tile={<DangerTile icon={icons.powerTile} />}
        title="Close the room for everyone?"
        actions={
          <>
            <ErrorText>{close.isError && errorMessage(close.error)}</ErrorText>
            <Button variant="danger" onClick={() => close.mutate()} disabled={close.isPending}>
              {close.isPending ? 'Closing…' : 'Yes, close room'}
            </Button>
            <Button onClick={() => navigate(base)}>Keep the night going</Button>
          </>
        }
      >
        <p className="-mt-3 text-[14px] leading-[1.45] text-muted">
          You’re ending {room.name ?? 'this room'}, not just leaving the page.
        </p>

        <ul className="flex flex-col gap-5">
          <Consequence
            icon={icons.square}
            title="The music stops"
            detail={
              queue.current
                ? `${queue.current.added_by.id === me.id ? 'Your' : `${queue.current.added_by.display_name}’s`} ${songName(queue.current)} will end immediately.`
                : 'Nothing is playing right now.'
            }
          />
          <Consequence
            icon={icons.listX}
            title={`${plural(queue.upcoming.length, 'waiting song')} ${queue.upcoming.length === 1 ? 'is' : 'are'} cleared`}
            detail={singers.length ? `Songs from ${listNames(singers)} lose their spots.` : 'The queue is already empty.'}
          />
          <Consequence
            icon={icons.usersDanger}
            title="Everyone is disconnected"
            detail={`The ${room.code} code and invite will no longer work.`}
          />
        </ul>

        <p className="text-[12px] leading-[1.45] text-muted">
          This can’t be undone. You can always create a new room for the next round.
        </p>
      </ConfirmCard>
    </Screen>
  )
}
