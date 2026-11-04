import { rewrite } from '@vercel/functions'

// Vercel Routing Middleware: proxies the API to Railway, like the Vite dev proxy does locally.
// vercel.json rewrites can't read env vars, so each Vercel environment sets API_ORIGIN
// (develop → Railway staging); without it, requests go to production.
const PRODUCTION_API = 'https://videokehan-production.up.railway.app'

export const config = { matcher: ['/api/:path*', '/broadcasting/:path*'] }

export default function middleware(request: Request) {
  const { pathname, search } = new URL(request.url)
  const origin = (process.env.API_ORIGIN || PRODUCTION_API).replace(/\/+$/, '')
  return rewrite(`${origin}${pathname}${search}`)
}
