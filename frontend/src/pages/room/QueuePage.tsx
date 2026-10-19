import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Link } from 'react-router-dom'
import * as icons from '../../assets/icons'
import { useRoom, useRoomMutation } from '../../lib/roomContext'
import { QueueRow } from '../../components/songs'
import { Avatar, ButtonLink, ErrorText, Icon, Note, PageHeading, Screen, SectionHeading, StatusPill } from '../../components/ui'
import { formatWait, plural, songArtist, songName } from '../../lib/format'
import { errorMessage, reorderQueue } from '../../lib/rooms'
import type { QueueItem } from '../../lib/types'

function move<T>(list: T[], from: number, to: number): T[] {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/**
 * Host-only drag reordering. While dragging (and until the server confirms)
 * the local order wins over polled state.
 */
function useReorder(items: QueueItem[]) {
  const { roomId } = useRoom()
  const [draft, setDraft] = useState<number[] | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const rows = useRef(new Map<number, HTMLElement>())

  const save = useRoomMutation((ids: number[]) => reorderQueue(roomId, ids))

  const serverIds = items.map((item) => item.id)
  // Drop a stale draft if songs were added or removed meanwhile.
  const order =
    draft && draft.length === serverIds.length && draft.every((id) => serverIds.includes(id)) ? draft : serverIds
  const byId = new Map(items.map((item) => [item.id, item]))
  const ordered = order.map((id) => byId.get(id)!)

  function commit(ids: number[]) {
    if (ids.join() === serverIds.join()) {
      setDraft(null)
      return
    }
    setDraft(ids)
    save.mutate(ids, { onSettled: () => setDraft(null) })
  }

  function onPointerDown(e: PointerEvent, id: number) {
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(id)
    setDraft(order)
  }

  function onPointerMove(e: PointerEvent) {
    if (dragging === null || !draft) return
    const from = draft.indexOf(dragging)
    // Find the row under the pointer by comparing against row midpoints.
    let to = draft.length - 1
    for (let i = 0; i < draft.length; i++) {
      const rect = rows.current.get(draft[i])?.getBoundingClientRect()
      if (rect && e.clientY < rect.top + rect.height / 2) {
        to = i
        break
      }
    }
    if (to !== from) setDraft(move(draft, from, to))
  }

  function onPointerUp() {
    if (dragging === null) return
    setDragging(null)
    commit(draft ?? order)
  }

  function onKeyDown(e: KeyboardEvent, id: number) {
    const from = order.indexOf(id)
    const to = e.key === 'ArrowUp' ? from - 1 : e.key === 'ArrowDown' ? from + 1 : from
    if (to === from || to < 0 || to >= order.length) return
    e.preventDefault()
    commit(move(order, from, to))
  }

  return { ordered, dragging, rows, save, handlers: { onPointerDown, onPointerMove, onPointerUp, onKeyDown } }
}

export default function QueuePage() {
  const { state, base, isHost } = useRoom()
  const { room, queue, me } = state
  const reorder = useReorder(queue.upcoming)
  const wait = formatWait(queue.upcoming)

  return (
    <Screen>
      <PageHeading eyebrow={`Shared queue · ${room.code}`} title="Make room for a hit." />

      {queue.current && (
        <section className="flex items-center gap-3 rounded-2xl bg-surface p-4">
          <Avatar id={queue.current.added_by.id} name={queue.current.added_by.display_name} size={38} />
          <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
            <p className="truncate text-[15px] font-bold">{songName(queue.current)}</p>
            <p className="truncate text-[14px] text-muted">
              {[
                songArtist(queue.current),
                queue.current.video_swaps > 0 && 'another version',
                queue.current.added_by.id === me.id ? 'You' : queue.current.added_by.display_name]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <StatusPill>{room.playback_status === 'paused' ? 'Paused' : 'Singing'}</StatusPill>
        </section>
      )}

      <section className="flex flex-col gap-0.5">
        <SectionHeading title={`${plural(queue.upcoming.length, 'song')} waiting`} aside={wait} />
        <p className="text-[14px] leading-[1.45] text-muted">
          {isHost
            ? 'Drag a handle to reorder. Changes are shared with everyone in the room.'
            : 'Songs play in this order. You can remove your own.'}
        </p>

        {queue.upcoming.length === 0 && (
          <p className="py-[13px] text-[14px] text-muted">The queue is empty. Be the first to add a song.</p>
        )}

        <ul onPointerMove={reorder.handlers.onPointerMove} onPointerUp={reorder.handlers.onPointerUp}>
          {reorder.ordered.map((item) => {
            const canRemove = isHost || item.added_by.id === me.id
            return (
              <li
                key={item.id}
                ref={(el) => {
                  if (el) reorder.rows.current.set(item.id, el)
                  else reorder.rows.current.delete(item.id)
                }}
                className={reorder.dragging === item.id ? 'opacity-60' : undefined}
              >
                <QueueRow
                  item={item}
                  meId={me.id}
                  leading={
                    isHost && (
                      <button
                        type="button"
                        aria-label={`Move ${songName(item)}. Use the arrow keys.`}
                        className="flex h-11 w-8 shrink-0 cursor-grab touch-none items-center justify-center"
                        onPointerDown={(e) => reorder.handlers.onPointerDown(e, item.id)}
                        onKeyDown={(e) => reorder.handlers.onKeyDown(e, item.id)}
                      >
                        <Icon src={icons.gripVertical} size={20} />
                      </button>
                    )
                  }
                  trailing={
                    canRemove && (
                      <Link
                        to={`${base}/queue/${item.id}/remove`}
                        aria-label={`Remove ${songName(item)}`}
                        className="flex size-11 shrink-0 items-center justify-center"
                      >
                        <Icon src={icons.circleMinus} size={19} />
                      </Link>
                    )
                  }
                />
              </li>
            )
          })}
        </ul>
        <ErrorText>{reorder.save.isError && errorMessage(reorder.save.error)}</ErrorText>
      </section>

      <Note icon={icons.info}>Removing a song asks for confirmation. The current song won’t be interrupted.</Note>

      <ButtonLink to={`${base}/search`} icon={icons.searchOnAccent}>
        Find another song
      </ButtonLink>

      <p className="text-center text-[13px] leading-[1.45] text-muted">
        {isHost ? 'Host controls · Guests can only remove their own songs.' : 'Only the host can reorder the queue.'}
      </p>
    </Screen>
  )
}
