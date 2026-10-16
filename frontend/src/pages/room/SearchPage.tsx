import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import * as icons from '../../assets/icons'
import { useRoom, useRoomMutation } from '../../lib/roomContext'
import { Button, ErrorText, Icon, Note, PageHeading, Screen, SectionHeading } from '../../components/ui'
import { formatDuration, parseSongTitle, plural } from '../../lib/format'
import { addSong, errorMessage, getAutocomplete, getSuggestions, searchSongs } from '../../lib/rooms'
import type { QueueItem, Video } from '../../lib/types'

// One-tap searches for people who'd rather browse than type: genres, eras, moods and artists.
const IDEAS = [
  'OPM', 'K-pop', 'Rock', 'Pop', 'R&B', 'Country', 'Reggae', 'Hip-hop', 'Broadway', 'Disney', 'Worship songs',
  'Christmas songs', 'Anime songs', '60s hits', '70s hits', '80s hits', '90s hits', '2000s hits', 'Love songs',
  'Breakup songs', 'Party songs', 'Ballads', 'Duets', 'Birthday songs', 'Eraserheads', 'Ben&Ben', 'Rivermaya',
  'Moira Dela Torre', 'Parokya ni Edgar', 'Sarah Geronimo', 'Regine Velasquez', 'Gary Valenciano', 'December Avenue',
  'TJ Monterde', 'Juan Karlos', 'Zack Tabudlo', 'Morissette', 'Apo Hiking Society', 'Queen', 'Bon Jovi', 'ABBA',
  'Whitney Houston', 'Celine Dion', 'Mariah Carey', 'Taylor Swift', 'Bruno Mars', 'Ed Sheeran', 'Adele',
  'Backstreet Boys', 'Westlife', 'Michael Jackson', 'The Beatles', 'Air Supply', 'BTS', 'Olivia Rodrigo',
  'Lady Gaga', 'Journey', 'Elvis Presley',
]
const IDEAS_SHOWN = 9

/** A fresh shuffle order for the popular songs. */
function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 31)
}

/** A random handful of ideas, avoiding the ones on screen so "More" always shows something new. */
function pickIdeas(current: string[]): string[] {
  const fresh = IDEAS.filter((idea) => !current.includes(idea))
  for (let i = fresh.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[fresh[i], fresh[j]] = [fresh[j], fresh[i]]
  }
  return fresh.slice(0, IDEAS_SHOWN)
}

function MoreButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="font-semibold text-accent disabled:opacity-40">
      More
    </button>
  )
}

// The design cycles the placeholder artwork through the avatar palette.
const ARTWORK = [
  { icon: icons.audioLinesLime, text: 'text-accent' },
  { icon: icons.audioLinesLilac, text: 'text-lilac' },
  { icon: icons.audioLinesPeach, text: 'text-peach' },
]

function ResultRow({
  video,
  index,
  inRoom,
  inRoomNote,
  canAdd,
  adding,
  onAdd,
}: {
  video: Video
  index: number
  inRoom: boolean
  inRoomNote: string | null
  canAdd: boolean
  adding: boolean
  onAdd: () => void
}) {
  const parsed = parseSongTitle(video.title)
  const { isKaraoke } = parsed
  // The server says which half of the title is the song; the title parse is the fallback.
  const song = video.song_title ?? parsed.song
  const artist = video.song_title ? (video.artist ?? null) : parsed.artist
  const art = ARTWORK[index % ARTWORK.length]

  return (
    <li className="flex flex-col gap-[11px] border-b border-line py-3.5">
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-[72px] shrink-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-[10px] bg-surface-2 p-2">
          <Icon src={art.icon} size={25} />
          <span className={`max-w-full truncate text-[10px] ${art.text}`}>{artist ?? video.channel_title}</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
          <p className="line-clamp-2 text-[15px] font-bold">{song}</p>
          <p className="truncate text-[11px] text-muted">
            {[artist, isKaraoke && 'Karaoke', formatDuration(video.duration_seconds)].filter(Boolean).join(' · ')}
          </p>
          <p className="truncate text-[10px] text-muted">{video.channel_title} · YouTube</p>
        </div>
        {inRoom ? (
          <span
            className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-surface-2"
            aria-label="Already in this room"
          >
            <Icon src={icons.check} size={20} />
          </span>
        ) : (
          <button
            type="button"
            onClick={onAdd}
            disabled={!canAdd || adding}
            aria-label={`Add ${song} to the queue`}
            className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-accent disabled:opacity-40"
          >
            <Icon src={icons.plusAdd} size={20} />
          </button>
        )}
      </div>
      {inRoomNote && <p className="text-[11px] font-semibold text-accent">{inRoomNote}</p>}
    </li>
  )
}

export default function SearchPage() {
  const { state, roomId, isHost } = useRoom()
  const { room, me, queue } = state

  const [text, setText] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [karaoke, setKaraoke] = useState(true)

  // search.list costs YouTube quota, so search on submit rather than per
  // keystroke, and fetch further pages only when someone taps More.
  const results = useInfiniteQuery({
    queryKey: ['search', roomId, submitted, karaoke],
    queryFn: ({ pageParam }) => searchSongs(roomId, submitted, karaoke, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_page,
    enabled: submitted.length >= 2,
    staleTime: 10 * 60_000,
    retry: false,
  })
  // YouTube pages can overlap, so keep each video once.
  const found = results.data?.pages
    .flatMap((page) => page.results)
    .filter((video, i, all) => all.findIndex((v) => v.id === video.id) === i)

  // Suggestions while typing, once the typing pauses. They come from iTunes, so
  // they cost no YouTube quota; tapping one runs the real search.
  const [focused, setFocused] = useState(false)
  const [typed, setTyped] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setTyped(text.trim()), 250)
    return () => clearTimeout(timer)
  }, [text])
  const showSuggestions = focused && typed.length >= 2 && typed !== submitted
  const autocomplete = useQuery({
    queryKey: ['autocomplete', roomId, typed],
    queryFn: () => getAutocomplete(roomId, typed),
    enabled: showSuggestions,
    staleTime: 10 * 60_000,
    retry: false,
    placeholderData: keepPreviousData,
  })
  const typedSuggestions = showSuggestions ? (autocomplete.data ?? []) : []

  const [ideas, setIdeas] = useState(() => pickIdeas([]))

  // Shown before anyone types. The server caches the popular pool and shuffles
  // it by this visit's seed, so each visit opens on different songs; "More"
  // pages through that order, and a new seed reshuffles once it runs out.
  const [popularSeed, setPopularSeed] = useState(newSeed)
  const [popularPage, setPopularPage] = useState(0)
  const popularRef = useRef<HTMLElement>(null)
  const suggestions = useQuery({
    queryKey: ['suggestions', roomId, popularSeed, popularPage],
    queryFn: () => getSuggestions(roomId, popularPage, popularSeed),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  })

  function morePopular() {
    if (!suggestions.data) return
    const { page, pages } = suggestions.data
    if (page + 1 >= pages) {
      setPopularSeed(newSeed())
      setPopularPage(0)
    } else {
      setPopularPage(page + 1)
    }
    popularRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const add = useRoomMutation((videoId: string) => addSong(roomId, videoId))

  // The host always sings; guests sing unless the host turned additions off.
  const canAdd = isHost || (room.allow_song_additions && me.can_add_songs)

  const inRoom = new Map<string, QueueItem>()
  for (const item of [queue.current, ...queue.upcoming]) if (item) inRoom.set(item.youtube_video_id, item)

  function noteFor(video: Video): string | null {
    const item = inRoom.get(video.id)
    if (!item) return null
    const who = item.added_by.id === me.id ? 'You' : item.added_by.display_name
    return item.id === queue.current?.id
      ? `In this room · ${who} ${item.added_by.id === me.id ? 'are' : 'is'} singing now`
      : `In this room · queued by ${who}`
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(text.trim())
    setFocused(false)
  }

  function searchFor(query: string) {
    setText(query)
    setSubmitted(query)
    setFocused(false)
  }

  function songRows(videos: Video[]) {
    return (
      <ul>
        {videos.map((video, i) => (
          <ResultRow
            key={video.id}
            video={video}
            index={i}
            inRoom={inRoom.has(video.id)}
            inRoomNote={noteFor(video)}
            canAdd={canAdd}
            adding={add.isPending && add.variables === video.id}
            onAdd={() => add.mutate(video.id)}
          />
        ))}
      </ul>
    )
  }

  return (
    <Screen>
      <PageHeading eyebrow="Song search" title="Find your next song." />

      <form onSubmit={onSubmit} role="search">
        <label className="flex h-[54px] items-center gap-3 rounded-2xl border border-line bg-surface px-4 focus-within:border-accent">
          <Icon src={icons.searchField} size={20} />
          <input
            type="search"
            enterKeyHint="search"
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setFocused(true)
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            autoComplete="off"
            placeholder="Song or artist"
            aria-label="Search for a song or artist"
            maxLength={80}
            className="min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
          />
          {text && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setText('')
                setSubmitted('')
              }}
            >
              <Icon src={icons.x} size={18} />
            </button>
          )}
        </label>
        {typedSuggestions.length > 0 && (
          <ul aria-label="Suggestions" className="mt-2 overflow-hidden rounded-2xl border border-line bg-surface">
            {typedSuggestions.map((s) => (
              <li key={`${s.type}:${s.query}`} className="border-b border-line last:border-b-0">
                <button
                  type="button"
                  // Keep the input focused until the tap lands, or the list closes first.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => searchFor(s.query)}
                  className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-2"
                >
                  <Icon src={s.type === 'artist' ? icons.micVocal : icons.music2} size={18} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[14px] font-semibold">{s.label}</span>
                    <span className="truncate text-[11px] text-muted">{s.type === 'artist' ? 'Artist' : s.artist}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>

      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-pressed={karaoke}
          onClick={() => setKaraoke(!karaoke)}
          className={`rounded-full px-[9px] py-[5px] text-[10px] font-bold uppercase ${
            karaoke ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-muted'
          }`}
        >
          Karaoke videos
        </button>
        <span className="text-[12px] text-muted">Results from YouTube</span>
      </div>

      {!canAdd && (
        <Note icon={icons.shieldCheck}>
          {room.allow_song_additions
            ? 'The host has paused song adding for you. You can still browse and follow along.'
            : 'The host has paused new songs for the room. You can still browse and follow along.'}
        </Note>
      )}

      {submitted.length >= 2 && (
        <section className="flex flex-col">
          <SectionHeading
            title="Top matches"
            aside={found ? plural(found.length, 'result') : results.isFetching ? 'Searching…' : null}
          />
          <ErrorText>{results.isError && errorMessage(results.error)}</ErrorText>
          {found?.length === 0 && (
            <p className="py-3.5 text-[13px] text-muted">No embeddable videos found. Try another spelling.</p>
          )}
          {found && songRows(found)}
          {results.hasNextPage && (
            <Button
              variant="secondary"
              className="mt-4"
              onClick={() => results.fetchNextPage()}
              disabled={results.isFetchingNextPage}
            >
              {results.isFetchingNextPage ? 'Loading…' : 'More'}
            </Button>
          )}
          <ErrorText>{add.isError && errorMessage(add.error)}</ErrorText>
        </section>
      )}

      {submitted.length < 2 && (
        <>
          <section className="flex flex-col gap-3">
            <SectionHeading title="Need ideas?" aside={<MoreButton onClick={() => setIdeas(pickIdeas(ideas))} />} />
            <div className="flex flex-wrap gap-2">
              {ideas.map((idea) => (
                <button
                  key={idea}
                  type="button"
                  onClick={() => searchFor(idea)}
                  className="rounded-full border border-line bg-surface px-3.5 py-2 text-[13px] font-semibold hover:border-accent"
                >
                  {idea}
                </button>
              ))}
            </div>
          </section>

          <section ref={popularRef} className="flex scroll-mt-4 flex-col">
            <SectionHeading title="Popular karaoke" aside={suggestions.isFetching ? 'Loading…' : null} />
            {suggestions.data?.popular.length === 0 && (
              <p className="py-3.5 text-[13px] text-muted">Popular picks aren’t available right now. Try a search instead.</p>
            )}
            {suggestions.isError && <p className="py-3.5 text-[13px] text-muted">Couldn’t load suggestions.</p>}
            {suggestions.data && songRows(suggestions.data.popular)}
            {suggestions.data && suggestions.data.pages > 1 && (
              <Button variant="secondary" className="mt-4" onClick={morePopular} disabled={suggestions.isFetching}>
                {suggestions.isFetching ? 'Loading…' : 'More'}
              </Button>
            )}
          </section>
          <ErrorText>{add.isError && errorMessage(add.error)}</ErrorText>
        </>
      )}

      <section className="flex flex-col gap-2 rounded-2xl bg-surface p-4">
        <p className="text-[13px]">Adding as {me.display_name} · You</p>
        <p className="text-[12px] leading-[1.45] text-muted">
          Tap + to add a video to the end of the shared queue.{' '}
          {isHost ? 'Guests add from their own phones.' : 'Your name shows on the TV when it’s your turn.'}
        </p>
      </section>

      <p className="text-[11px] leading-[1.45] text-muted">
        Videos play on the TV display in the YouTube player. Availability may vary.
      </p>
    </Screen>
  )
}
