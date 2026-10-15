import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { avatarColor, initials } from '../lib/format'

/** Centered single column, for pages outside a room (home, join, loading). */
export function Page({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-[22px] px-5 py-6">{children}</main>
  )
}

/** A room screen's scrolling content column. */
export function Screen({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-[22px] px-5 py-6">{children}</div>
}

export function Icon({ src, size, className = '' }: { src: string; size: number; className?: string }) {
  return <img src={src} width={size} height={size} alt="" aria-hidden className={`shrink-0 ${className}`} />
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-bold text-accent uppercase">{children}</p>
}

export function PageHeading({
  eyebrow,
  back,
  title,
  action,
}: {
  eyebrow?: ReactNode
  back?: { to: string; label: string }
  title: ReactNode
  action?: ReactNode
}) {
  return (
    <header className="flex flex-col gap-[9px]">
      {back ? (
        <Link to={back.to} className="w-fit text-[11px] font-bold text-accent uppercase">
          ← {back.label}
        </Link>
      ) : (
        eyebrow && <Eyebrow>{eyebrow}</Eyebrow>
      )}
      <div className="flex items-center justify-between gap-3">
        <h1 className="min-w-0 flex-1 text-[29px] leading-[1.15] font-bold">{title}</h1>
        {action}
      </div>
    </header>
  )
}

/** The lime text link in a heading row ("Invite +", "Full queue →"). */
export function TextLink({ className = '', ...props }: LinkProps) {
  return <Link className={`shrink-0 text-[13px] text-accent ${className}`} {...props} />
}

export function Lead({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`text-[14px] leading-[1.45] text-muted ${className}`}>{children}</p>
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`flex flex-col gap-[14px] rounded-2xl bg-surface p-4 ${className}`}>{children}</section>
}

export function SectionHeading({ title, aside }: { title: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-[17px] font-bold">{title}</h2>
      {aside && <span className="text-[12px] text-accent">{aside}</span>}
    </div>
  )
}

/** Muted info box with a leading icon ("Removing a song asks for confirmation…"). */
export function Note({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-surface p-3.5">
      <Icon src={icon} size={18} />
      <p className="flex-1 text-[12px] leading-[1.45] text-muted">{children}</p>
    </div>
  )
}

export function StatusPill({ tone = 'accent', children }: { tone?: 'accent' | 'danger'; children: ReactNode }) {
  const colors = tone === 'accent' ? 'bg-accent-soft text-accent' : 'bg-danger-soft text-danger'
  return (
    <span className={`inline-flex w-fit shrink-0 rounded-full px-[9px] py-[5px] text-[10px] font-bold uppercase ${colors}`}>
      {children}
    </span>
  )
}

export function Avatar({ id, name, size = 34 }: { id: number; name: string | null; size?: number }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-bold text-bg ${avatarColor(id)}`}
      style={{ width: size, height: size, fontSize: size / 3 }}
      aria-hidden
    >
      {initials(name)}
    </span>
  )
}

type Variant = 'primary' | 'secondary' | 'danger'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:brightness-105',
  secondary: 'bg-surface-2 text-ink hover:bg-line',
  danger: 'bg-danger-soft text-danger hover:brightness-125',
}

const buttonBase =
  'flex h-[52px] w-full items-center justify-center gap-2.5 rounded-2xl px-4 text-[15px] font-bold transition disabled:opacity-50'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; icon?: string }

export function Button({ variant = 'primary', icon, className = '', children, ...props }: ButtonProps) {
  return (
    <button className={`${buttonBase} ${variants[variant]} ${className}`} {...props}>
      {icon && <Icon src={icon} size={20} />}
      {children}
    </button>
  )
}

export function ButtonLink({
  variant = 'primary',
  icon,
  className = '',
  children,
  ...props
}: LinkProps & { variant?: Variant; icon?: string }) {
  return (
    <Link className={`${buttonBase} ${variants[variant]} ${className}`} {...props}>
      {icon && <Icon src={icon} size={20} />}
      {children}
    </Link>
  )
}

/** The design's pill switch, with a 44px tap target. */
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex h-11 w-12 shrink-0 items-center justify-center disabled:opacity-50"
    >
      <span
        className={`flex h-[26px] w-11 rounded-[20px] p-[3px] transition-colors ${
          checked ? 'justify-end bg-accent' : 'justify-start bg-line'
        }`}
      >
        <span className={`size-5 rounded-[10px] ${checked ? 'bg-accent-ink' : 'bg-muted'}`} />
      </span>
    </button>
  )
}

export function TextInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`h-[54px] w-full rounded-2xl border border-line bg-surface px-4 text-[16px] text-ink outline-none placeholder:text-muted focus:border-accent ${className}`}
      {...props}
    />
  )
}

export function ErrorText({ children }: { children: ReactNode }) {
  return children ? (
    <p role="alert" className="text-[13px] text-danger">
      {children}
    </p>
  ) : null
}

export function Loading({ children = 'Loading room…' }: { children?: ReactNode }) {
  return (
    <Page>
      <p className="text-center text-muted">{children}</p>
    </Page>
  )
}
