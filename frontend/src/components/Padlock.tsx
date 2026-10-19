import padlock from '../assets/padlock.png'

/**
 * "Room locked", drawn as a padlock with the words in its body. Shown where the
 * join QR would be, at the QR's size, so locking the room swaps one for the other.
 * The PNG is a black padlock, so it's used as a mask and painted in the ink color
 * to show on the dark screens. The words are sized against the padlock's own width.
 */
export default function Padlock({ className = '' }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="Room locked. The host isn’t letting new people in."
      className={`@container relative aspect-square shrink-0 ${className}`}>
      {/* The lock covers 9%–91% of the image's width and 0%–91% of its height. Stretch
          the image so the lock is exactly as tall as the QR it stands in for (a lock is
          taller than wide, so it ends up a little narrower than the QR). */}
      <div className="absolute -inset-x-[4.95%] top-0 -bottom-[9.9%]">
        <div
          className="absolute inset-0 bg-ink"
          style={{ mask: `url(${padlock}) center / contain no-repeat`, WebkitMask: `url(${padlock}) center / contain no-repeat` }}
        />
        <p className="absolute inset-x-[9%] top-[45%] bottom-[10%] flex flex-col items-center justify-center text-center text-[14.5cqw] leading-[1.05] font-extrabold text-bg">
          <span>Room</span>
          <span>locked</span>
        </p>
      </div>
    </div>
  )
}
