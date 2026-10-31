import { useEffect, useRef, type KeyboardEvent } from 'react'

// Mirrors RoomCode::ALPHABET on the backend. Room codes never use 0, 1, O, I
// or L (they look too alike), so the keypad has no keys for them.
const KEYS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'.split('')
const LENGTH = 6
const COLUMNS = 8
// The first key of the bottom row, which sits right above Delete and Clear.
const LAST_ROW = Math.floor((KEYS.length - 1) / COLUMNS) * COLUMNS

const KEY =
  'flex h-14 items-center justify-center rounded-xl bg-surface text-[22px] font-bold outline-none focus:bg-accent focus:text-accent-ink focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40'

type Target = HTMLButtonElement | null | undefined

/** Focuses the first target that can take it. False when none could. */
function focusFirst(...targets: Target[]): boolean {
  const target = targets.find((t) => t && !t.disabled)
  target?.focus()
  return !!target
}

/**
 * Room code entry for a TV remote. A TV's own on-screen keyboard often closes
 * as soon as it opens in a web page, so the code is picked from buttons here
 * instead: the D-pad moves between them and OK presses one.
 */
export default function CodeKeypad({ value, onChange, onSubmit, disabled, submitLabel }: {
  value: string
  onChange: (code: string) => void
  onSubmit: () => void
  disabled?: boolean
  submitLabel: string
}) {
  const grid = useRef<HTMLDivElement>(null)
  const del = useRef<HTMLButtonElement>(null)
  const clear = useRef<HTMLButtonElement>(null)
  const submit = useRef<HTMLButtonElement>(null)
  const complete = value.length === LENGTH

  // Start on the first key, or on Connect when the code came prefilled.
  useEffect(() => {
    if (complete) submit.current?.focus()
    else grid.current?.querySelector('button')?.focus()
    // Only on mount: afterwards focus stays where the remote put it.
  }, [])

  // Connect is only focusable once it's enabled, so move there after the render that enables it.
  const wasComplete = useRef(complete)
  useEffect(() => {
    if (complete && !wasComplete.current) submit.current?.focus()
    wasComplete.current = complete
  }, [complete])

  function press(key: string) {
    if (value.length < LENGTH) onChange(value + key)
  }

  // Arrow keys move like the keypad looks, so Down from any key reaches Delete
  // and Clear without going sideways first. Also covers browsers without
  // spatial navigation. Anything not handled here is left to the browser.
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Backspace') {
      e.preventDefault()
      onChange(value.slice(0, -1))
      return
    }

    const keys = Array.from(grid.current?.querySelectorAll('button') ?? [])
    const at = document.activeElement
    const i = keys.indexOf(at as HTMLButtonElement)
    // Delete sits under the left half of the bottom row, Clear under the right.
    const aboveDelete = keys[LAST_ROW + 1]
    const aboveClear = keys[Math.min(LAST_ROW + COLUMNS - 3, keys.length - 1)]
    let moved = false

    if (i >= 0) {
      const leftHalf = i % COLUMNS < COLUMNS / 2
      if (e.key === 'ArrowLeft') moved = focusFirst(keys[i - 1])
      else if (e.key === 'ArrowRight') moved = focusFirst(keys[i + 1])
      else if (e.key === 'ArrowUp') moved = focusFirst(keys[i - COLUMNS])
      else if (e.key === 'ArrowDown')
        moved =
          i + COLUMNS < keys.length
            ? focusFirst(keys[i + COLUMNS])
            : leftHalf
              ? focusFirst(del.current, clear.current, submit.current)
              : focusFirst(clear.current, del.current, submit.current)
    } else if (at === del.current || at === clear.current) {
      const isDelete = at === del.current
      if (e.key === 'ArrowLeft' && !isDelete) moved = focusFirst(del.current)
      else if (e.key === 'ArrowRight' && isDelete) moved = focusFirst(clear.current)
      else if (e.key === 'ArrowUp') moved = focusFirst(isDelete ? aboveDelete : aboveClear)
      else if (e.key === 'ArrowDown') moved = focusFirst(submit.current)
    } else if (at === submit.current && e.key === 'ArrowUp') {
      // A full code jumps here, so a wrong one is fixed with Up, then OK.
      moved = focusFirst(del.current, clear.current, aboveDelete)
    }

    if (moved) e.preventDefault()
  }

  return (
    <div onKeyDown={onKeyDown} className="flex flex-col gap-2.5">
      <div ref={grid} className="grid grid-cols-8 gap-2">
        {KEYS.map((key) => (
          <button key={key} type="button" className={KEY} onClick={() => press(key)} disabled={disabled}>
            {key}
          </button>
        ))}
      </div>
      {/* Full width, so it sits straight below every key. */}
      <div className="grid grid-cols-2 gap-2">
        <button
          ref={del}
          type="button"
          className={`${KEY} text-[18px]`}
          onClick={() => onChange(value.slice(0, -1))}
          disabled={disabled || !value}
        >
          Delete
        </button>
        <button
          ref={clear}
          type="button"
          className={`${KEY} text-[18px]`}
          onClick={() => onChange('')}
          disabled={disabled || !value}
        >
          Clear
        </button>
      </div>
      <button
        ref={submit}
        type="button"
        onClick={onSubmit}
        disabled={disabled || !complete}
        className="h-[54px] w-full rounded-2xl bg-accent text-[17px] font-bold text-accent-ink outline-none focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40"
      >
        {submitLabel}
      </button>
    </div>
  )
}
