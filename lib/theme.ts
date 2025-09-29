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
