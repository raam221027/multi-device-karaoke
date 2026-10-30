// Videoke machines don't really judge the singing, and neither do we: the
// score is for fun, and generous.

/** 72 to 100, leaning high. */
export function randomScore(): number {
  return 72 + Math.round(28 * Math.sqrt(Math.random()))
}

export function scoreMessage(score: number): string {
  if (score >= 98) return 'Perfect! Ang galing!'
  if (score >= 90) return 'Superstar! Encore!'
  if (score >= 82) return 'Great singing!'
  return 'Nice one! Sing again!'
}
