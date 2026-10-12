import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

type Health = { status: string; db: boolean; time: string }

function StatusRow({ label, ok, pending }: { label: string; ok: boolean; pending: boolean }) {
  const text = pending ? 'checking…' : ok ? 'ok' : 'down'
  const color = pending ? 'text-slate-400' : ok ? 'text-emerald-400' : 'text-rose-400'
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className={color}>{text}</span>
    </div>
  )
}

export default function HomePage() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api<Health>('/health'),
    retry: false,
  })

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4">
      <h1 className="text-3xl font-bold">Multi-Phone Karaoke</h1>
      <p className="text-slate-400">Phase 0 scaffold. Room creation arrives in Phase 1.</p>

      <section className="space-y-2 rounded-xl border border-slate-800 bg-slate-900 p-4">
        <StatusRow label="API" ok={health.data?.status === 'ok'} pending={health.isPending} />
        <StatusRow label="Database" ok={health.data?.db === true} pending={health.isPending} />
      </section>
    </main>
  )
}
