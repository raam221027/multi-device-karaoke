import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import DisplayPage from './pages/DisplayPage.tsx'
import HomePage from './pages/HomePage.tsx'
import HostPage from './pages/HostPage.tsx'
import JoinPage from './pages/JoinPage.tsx'
import RoomPage from './pages/RoomPage.tsx'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/join/:code" element={<JoinPage />} />
          <Route path="/room/:roomId" element={<RoomPage />} />
          <Route path="/host/:roomId" element={<HostPage />} />
          <Route path="/display" element={<DisplayPage />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
