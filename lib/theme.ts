export type Theme = {
  bg: string
  deep: string
  cream: string
  text: string
}

export const BASE_BACKGROUND = '#191916'
export const BASE_DEEP = '#121210'
export const BASE_CREAM = '#F8F5E6'

export const TEXT_COLORS: readonly string[] = [
  '#0FC55D',
  '#D90845',
  '#E5972B',
  '#FF978F',
  '#3D42CC',
  '#AF3BF2',
] as const

export const THEMES: readonly Theme[] = TEXT_COLORS.map((text) => ({
  bg: BASE_BACKGROUND,
  deep: BASE_DEEP,
  cream: BASE_CREAM,
  text,
}))

export const DEFAULT_THEME = THEMES[0]

export function getRandomTheme(excludeIndex?: number): { theme: Theme; index: number } {
  if (!THEMES.length) {
    return { theme: { bg: BASE_BACKGROUND, deep: BASE_DEEP, cream: BASE_CREAM, text: '#0FC55D' }, index: 0 }
  }

  if (typeof excludeIndex === 'number' && excludeIndex >= 0 && excludeIndex < THEMES.length - 1) {
    const pool = THEMES.map((theme, idx) => ({ theme, idx })).filter(({ idx }) => idx !== excludeIndex)
    const pick = pool[Math.floor(Math.random() * pool.length)]
    return { theme: pick.theme, index: pick.idx }
  }

  const index = Math.floor(Math.random() * THEMES.length)
  return { theme: THEMES[index], index }
}

export type GlitchInkVars = {
  '--glitch-ink': string
  '--glitch-ink-light': string
  '--glitch-ink-deep': string
  '--glitch-cream': string
}

function hexToRgb(hex: string): [number, number, number] | null {
  const raw = hex.trim().replace(/^#/, '')
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw
  if (!/^[0-9a-f]{6}$/i.test(full)) return null
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number]
}

const mixRgb = (a: [number, number, number], b: [number, number, number], towardB: number) =>
  a.map((value, i) => Math.round(value + (b[i] - value) * towardB)) as [number, number, number]

/**
 * The glitch's colours, taken from the theme of the random on screen rather than pure cyan, magenta
 * and yellow: its colour, a lighter and a deeper shade of it, and the cream. Each is an "r, g, b"
 * triplet so the CSS writes rgba(var(--glitch-ink), 0.4), which every browser reads, where a
 * color-mix() would make an older Safari drop the whole background.
 */
export function glitchInkVars(text: string): GlitchInkVars {
  const cream = hexToRgb(BASE_CREAM) as [number, number, number]
  const ink = hexToRgb(text) ?? cream
  const triplet = (rgb: [number, number, number]) => rgb.join(', ')
  return {
    '--glitch-ink': triplet(ink),
    '--glitch-ink-light': triplet(mixRgb(ink, cream, 0.45)),
    '--glitch-ink-deep': triplet(mixRgb(ink, [0, 0, 0], 0.42)),
    '--glitch-cream': triplet(cream),
  }
}
