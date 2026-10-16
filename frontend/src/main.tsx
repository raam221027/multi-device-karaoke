import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import RoomLayout from './components/RoomLayout.tsx'
import './index.css'
import DisplayPage from './pages/DisplayPage.tsx'
import HomePage from './pages/HomePage.tsx'
import JoinPage from './pages/JoinPage.tsx'
import ScanPage from './pages/ScanPage.tsx'
import ClosePage from './pages/host/ClosePage.tsx'
import GuestsPage from './pages/host/GuestsPage.tsx'
import BecomeScreenPage from './pages/host/BecomeScreenPage.tsx'
import InvitePage from './pages/host/InvitePage.tsx'
import MakeHostPage from './pages/host/MakeHostPage.tsx'
import RemoveGuestPage from './pages/host/RemoveGuestPage.tsx'
import SettingsPage from './pages/host/SettingsPage.tsx'
import TvInvitePage from './pages/host/TvInvitePage.tsx'
import GuestRoomPage from './pages/room/GuestRoomPage.tsx'
import LivePage from './pages/room/LivePage.tsx'
import QueuePage from './pages/room/QueuePage.tsx'
import RemoveSongPage from './pages/room/RemoveSongPage.tsx'
import SearchPage from './pages/room/SearchPage.tsx'
import SkipPage from './pages/room/SkipPage.tsx'

const queryClient = new QueryClient()

// Screens every phone shares. The host sings like any guest, so Live, Queue
// and Search are the same pages; host-only controls check the role inside.
const songRoutes = (
  <>
    <Route index element={<LivePage />} />
    <Route path="skip" element={<SkipPage />} />
    <Route path="queue" element={<QueuePage />} />
    <Route path="queue/:itemId/remove" element={<RemoveSongPage />} />
    <Route path="search" element={<SearchPage />} />
  </>
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/scan" element={<ScanPage />} />
          <Route path="/join/:code" element={<JoinPage />} />
          <Route path="/host/:roomId" element={<RoomLayout role="host" />}>
            {songRoutes}
            <Route path="invite" element={<InvitePage />} />
            <Route path="invite/tv" element={<TvInvitePage />} />
            <Route path="invite/tv/this-device" element={<BecomeScreenPage />} />
            <Route path="guests" element={<GuestsPage />} />
            <Route path="guests/:participantId/remove" element={<RemoveGuestPage />} />
            <Route path="guests/:participantId/make-host" element={<MakeHostPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="close" element={<ClosePage />} />
          </Route>
          <Route path="/room/:roomId" element={<RoomLayout role="guest" />}>
            {songRoutes}
            <Route path="room" element={<GuestRoomPage />} />
          </Route>
          <Route path="/display" element={<DisplayPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
