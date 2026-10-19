import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PageHeading } from '../components/ui'
import { CONTACT_EMAIL } from '../lib/share'

const UPDATED = 'October 19, 2026'

function External({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent underline">
      {children}
    </a>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[18px] font-bold">{title}</h2>
      <div className="flex flex-col gap-2 text-[15px] leading-[1.55] text-muted">{children}</div>
    </section>
  )
}

function Legal({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-[22px] px-5 py-6">
      <PageHeading back={{ to: '/', label: 'Videokehan' }} title={title} />
      <p className="text-[14px] text-muted">Last updated {UPDATED}</p>
      {children}
      <p className="text-[14px] text-muted">
        Questions? Email <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent">{CONTACT_EMAIL}</a>.
      </p>
    </main>
  )
}

/** /privacy: what Videokehan keeps, for how long, and who else is involved. */
export function PrivacyPage() {
  return (
    <Legal title="Privacy Policy">
      <Section title="The short version">
        <p>
          Videokehan is a free karaoke web app. There are no accounts and we never ask for your email, phone number or
          password. We only keep what a karaoke room needs, and we delete it 30 days after the room ends.
        </p>
      </Section>

      <Section title="What we keep">
        <p>• The name you type when you create or join a room (it can be a nickname).</p>
        <p>• The room: its code, name and settings, such as whether it's locked.</p>
        <p>
          • The songs added to the room: the YouTube video, its title, channel, thumbnail and length, and who added it.
        </p>
        <p>• For a screen that plays the videos: the kind of device (TV, PC, tablet or mobile).</p>
        <p>
          • A sign-in key saved in your browser so your phone stays in the room. It's removed when you leave, the host
          removes you, or the room closes.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          Rooms closed, or unused, for 30 days are deleted together with their guests, songs and sign-in keys. YouTube
          search results are kept for at most 7 days to save repeated searches.
        </p>
      </Section>

      <Section title="YouTube">
        <p>
          Videokehan uses YouTube API Services to search for songs and plays videos in the YouTube player. When you use
          those features, YouTube and Google receive information as described in the{' '}
          <External href="https://policies.google.com/privacy">Google Privacy Policy</External>. Your use of YouTube
          content is subject to the <External href="https://www.youtube.com/t/terms">YouTube Terms of Service</External>.
        </p>
      </Section>

      <Section title="Other services">
        <p>
          • Song suggestions while you type come from Apple's iTunes Search API, which receives the words you type.
        </p>
        <p>• Vercel Web Analytics counts page visits anonymously. It doesn't use cookies or identify you.</p>
        <p>• Our servers (Vercel and Railway) may briefly log your IP address to keep the service running and safe.</p>
      </Section>

      <Section title="What we don't do">
        <p>We don't sell or share your information, show ads, or use cookies for tracking.</p>
      </Section>

      <Section title="Your choices">
        <p>
          Leave a room any time from your phone. To have a room deleted sooner, ask the host to close it or email us
          with the room code.
        </p>
      </Section>
    </Legal>
  )
}

/** /terms: the rules for using Videokehan. */
export function TermsPage() {
  return (
    <Legal title="Terms of Use">
      <Section title="Using Videokehan">
        <p>
          Videokehan is free to use for personal karaoke parties. By using it you agree to these terms and to the{' '}
          <External href="https://www.youtube.com/t/terms">YouTube Terms of Service</External>.
        </p>
      </Section>

      <Section title="Videos">
        <p>
          Songs play from YouTube. The videos belong to their owners, and Videokehan doesn't host, download or change
          them. Some videos can't be played outside YouTube; when that happens Videokehan tries another version.
        </p>
      </Section>

      <Section title="Be kind">
        <p>
          Use a name and song choices that are fine for everyone in the room. The host can remove guests and songs.
        </p>
      </Section>

      <Section title="No guarantees">
        <p>
          Videokehan is provided as is. Song search may pause for the rest of the day when YouTube's daily limit is
          reached, and the service may change or stop at any time.
        </p>
      </Section>

      <Section title="Privacy">
        <p>
          See the <Link to="/privacy" className="text-accent underline">Privacy Policy</Link> for what we keep and for how
          long.
        </p>
      </Section>
    </Legal>
  )
}
