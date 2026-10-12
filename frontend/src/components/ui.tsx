import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import type { Participant } from '../lib/types'

export function Page({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-8">
      {children}
    </main>
  )
}

export function Card({ children }: { children: ReactNode }) {
  return <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-4">{children}</section>
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }

const variants = {
  primary: 'bg-fuchsia-600 text-white hover:bg-fuchsia-500',
  secondary: 'border border-slate-700 text-slate-100 hover:bg-slate-800',
  danger: 'border border-rose-800 text-rose-300 hover:bg-rose-950',
}

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`w-full rounded-lg px-4 py-3 font-semibold transition disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    />
  )
}

export function TextInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-lg outline-none focus:border-fuchsia-500 ${className}`}
      {...props}
    />
  )
}

export function ErrorText({ children }: { children: ReactNode }) {
  return children ? (
    <p role="alert" className="text-sm text-rose-400">
      {children}
    </p>
  ) : null
}

export function ParticipantList({ participants, meId }: { participants: Participant[]; meId: number }) {
  return (
    <ul className="divide-y divide-slate-800">
      {participants.map((p) => (
        <li key={p.id} className="flex items-center justify-between py-2">
          <span>
            {p.display_name}
            {p.id === meId && <span className="text-slate-500"> (you)</span>}
          </span>
          {p.role !== 'guest' && (
            <span className="rounded bg-slate-800 px-2 py-0.5 text-xs uppercase tracking-wide text-slate-300">
              {p.role}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}
