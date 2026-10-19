import { useEffect } from 'react'
import { Link, Navigate, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import * as icons from '../assets/icons'
import { setToken } from '../lib/api'
import { phoneBecomesDisplay } from '../lib/display'
import { RoomContext } from '../lib/roomContext'
import { useRoomState } from '../lib/useRoomState'
import { Loading } from './ui'

type Tab = { key: string; label: string; to: string; icon: string; activeIcon: string }

const TABS: Record<string, Tab> = {
  live: { key: 'live', label: 'Live', to: '', icon: icons.navRadio, activeIcon: icons.navRadioActive },
  queue: { key: 'queue', label: 'Queue', to: 'queue', icon: icons.navListMusic, activeIcon: icons.navListMusicActive },
  search: { key: 'search', label: 'Search', to: 'search', icon: icons.navSearch, activeIcon: icons.navSearchActive },
  guests: { key: 'guests', label: 'Guests', to: 'guests', icon: icons.navUsers, activeIcon: icons.navUsersActive },
  room: { key: 'room', label: 'Room', to: 'settings', icon: icons.navSliders, activeIcon: icons.navSlidersActive },
}

const HOST_TABS = [TABS.live, TABS.queue, TABS.search, TABS.guests, TABS.room]
const GUEST_TABS = [TABS.live, TABS.queue, TABS.search, { ...TABS.room, to: 'room' }]

/** Which tab a screen belongs to, e.g. the skip confirmation lives under Live. */
const SECTION: Record<string, string> = {
  '': 'live',
  skip: 'live',
  queue: 'queue',
  search: 'search',
  guests: 'guests',
  settings: 'room',
  close: 'room',
  invite: 'room',
  room: 'room',
}

function BottomNav({ base, tabs }: { base: string; tabs: Tab[] }) {
  const segment = useLocation().pathname.slice(base.length).split('/')[1] ?? ''
  const active = SECTION[segment] ?? 'live'

  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface">
      <ul className="mx-auto flex max-w-md items-start justify-between px-3 pt-2.5 pb-[max(18px,env(safe-area-inset-bottom))]">
        {tabs.map((tab) => {
          const isActive = tab.key === active
          return (
            <li key={tab.key} className="w-[66px]">
              <Link
                to={tab.to ? `${base}/${tab.to}` : base}
                aria-current={isActive ? 'page' : undefined}
                className="flex flex-col items-center justify-center gap-[5px]"
              >
                <img src={isActive ? tab.activeIcon : tab.icon} width={21} height={21} alt="" aria-hidden />
                <span className={`text-[12px] ${isActive ? 'font-bold text-accent' : 'text-muted'}`}>{tab.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/** Same token, new role: move it to the display session and open the display. */
function BecomeDisplay({ roomId }: { roomId: number }) {
  const navigate = useNavigate()

  useEffect(() => {
    phoneBecomesDisplay(roomId)
    navigate('/display', { replace: true })
    setToken(null)
  }, [roomId, navigate])

  return <Loading />
}

/**
 * Shell for every in-room screen. The host and guests share screens (Live,
 * Queue, Search), so the host can sing like anyone else; host-only controls
 * check `isHost`.
 */
export default function RoomLayout({ role }: { role: 'host' | 'guest' }) {
  const { roomId } = useParams()
  const query = useRoomState(roomId)

  if (!query.data) return <Loading />

  const state = query.data
  const isHost = state.me.role === 'host'

  // Roles change in place, so a cached role can be from an earlier stint (say,
  // as the screen). Only a fresh answer may move this device to another page.
  const roleMismatch = state.me.role === 'display' || (role === 'host') !== isHost
  if (roleMismatch && !query.isFetchedAfterMount) return <Loading />

  // The host handed off and turned this phone into the screen.
  if (state.me.role === 'display') return <BecomeDisplay roomId={state.room.id} />

  // Each role has its own URL space; send a device to the right one.
  if (role === 'host' && !isHost) return <Navigate to={`/room/${state.room.id}`} replace />
  if (role === 'guest' && isHost) return <Navigate to={`/host/${state.room.id}`} replace />

  const base = `/${role === 'host' ? 'host' : 'room'}/${state.room.id}`

  return (
    <RoomContext.Provider value={{ state, roomId: state.room.id, base, isHost }}>
      <div className="mx-auto min-h-screen max-w-md pb-[96px]">
        <Outlet />
      </div>
      <BottomNav base={base} tabs={isHost ? HOST_TABS : GUEST_TABS} />
    </RoomContext.Provider>
  )
}
