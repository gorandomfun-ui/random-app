/**
 * The site's identity, read from its own files for the render: the six accents
 * on the dark base, the two typefaces, the logo composed from its letters, the
 * icons. Nothing invented here; the colours are lib/theme.ts's.
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { BASE_BACKGROUND, BASE_CREAM, BASE_DEEP, TEXT_COLORS } from '@/lib/theme'
import type { ColorToken } from './templates'

export type Palette = { index: number; bg: string; deep: string; cream: string; accent: string }

export const PALETTE_COUNT = TEXT_COLORS.length

export function paletteOf(index: number): Palette {
  const safe = Number.isInteger(index) && index >= 0 && index < TEXT_COLORS.length ? index : 0
  return { index: safe, bg: BASE_BACKGROUND, deep: BASE_DEEP, cream: BASE_CREAM, accent: TEXT_COLORS[safe] }
}

/** The site's white is its cream, its black is its deep base; 'auto' is cream on the dark base. */
export function resolveColor(token: ColorToken, palette: Palette): string {
  switch (token) {
    case 'palette.bg': return palette.bg
    case 'palette.deep': return palette.deep
    case 'palette.cream': return palette.cream
    case 'palette.accent': return palette.accent
    case 'black': return palette.deep
    case 'white': return palette.cream
    case 'auto': return palette.cream
    case 'transparent': return 'transparent'
  }
}

const PUBLIC = path.join(process.cwd(), 'public')
const cache = new Map<string, Promise<string | Buffer | null>>()

function cached<T extends string | Buffer>(key: string, load: () => Promise<T>): Promise<T | null> {
  let pending = cache.get(key) as Promise<T | null> | undefined
  if (!pending) { pending = load().catch(() => null); cache.set(key, pending) }
  return pending
}

export type FontFile = { name: string; data: ArrayBuffer; weight: 400 | 700 | 900; style: 'normal' }

const FONT_FILES: Array<{ file: string; name: string; weight: 400 | 700 | 900 }> = [
  { file: 'Tomorrow-Bold.ttf', name: 'Tomorrow', weight: 700 },
  { file: 'Tomorrow-Black.ttf', name: 'Tomorrow', weight: 900 },
  { file: 'InterTight-Regular.woff', name: 'InterTight', weight: 400 },
  { file: 'InterTight-Bold.woff', name: 'InterTight', weight: 700 },
]

/** The typefaces from public/fonts, read once; a missing file is skipped, Satori then falls back. */
export async function loadFonts(): Promise<FontFile[]> {
  const out: FontFile[] = []
  for (const font of FONT_FILES) {
    const data = await cached(`font:${font.file}`, () => readFile(path.join(PUBLIC, 'fonts', font.file)))
    if (data) out.push({ name: font.name, data: (data as Buffer).buffer.slice((data as Buffer).byteOffset, (data as Buffer).byteOffset + (data as Buffer).byteLength) as ArrayBuffer, weight: font.weight, style: 'normal' })
  }
  return out
}

/** The letters' shapes: 89 × 135 each, from public/logo/<letter>1.svg. */
export const LETTER_WIDTH = 89, LETTER_HEIGHT = 135, LETTER_GAP = 10
const LETTERS = ['R', 'A', 'N', 'D', 'O', 'M'] as const

async function letterPath(letter: string): Promise<string | null> {
  const svg = await cached(`letter:${letter}`, () => readFile(path.join(PUBLIC, 'logo', `${letter}1.svg`), 'utf8'))
  if (typeof svg !== 'string') return null
  const match = /<path[^>]*\sd="([^"]+)"/.exec(svg)
  return match ? match[1] : null
}

export const LOGO_SIZES = {
  horizontal: { width: LETTERS.length * LETTER_WIDTH + (LETTERS.length - 1) * LETTER_GAP, height: LETTER_HEIGHT },
  vertical: { width: 3 * LETTER_WIDTH + 2 * LETTER_GAP, height: 2 * LETTER_HEIGHT + 2 * LETTER_GAP },
} as const

/** "RANDOM" on one line, or "ran" over "dom", composed from the letters in the colour asked; as a data URI. */
export async function logoDataUri(variant: 'horizontal' | 'vertical', color: string): Promise<string | null> {
  const paths = await Promise.all(LETTERS.map(letterPath))
  if (paths.some((p) => !p)) return null
  const size = LOGO_SIZES[variant]
  const groups = LETTERS.map((_, i) => {
    const column = variant === 'horizontal' ? i : i % 3
    const row = variant === 'horizontal' ? 0 : Math.floor(i / 3)
    const x = column * (LETTER_WIDTH + LETTER_GAP), y = row * (LETTER_HEIGHT + 2 * LETTER_GAP)
    return `<g transform="translate(${x} ${y})"><path fill="${color}" d="${paths[i]}"/></g>`
  })
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size.width} ${size.height}" width="${size.width}" height="${size.height}">${groups.join('')}</svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

const ICON_FILES: Record<string, string> = { heart: 'Heart.svg', shuffle: 'Shuffle.svg', video: 'Video.svg', image: 'image.svg', web: 'web.svg', wave: 'wave.svg', quote: 'quote.svg', joke: 'joke.svg', fact: 'fact.svg', share: 'share.svg', social: 'social.svg', plus: 'plus.svg', info: 'info.svg' }

/** One of public/icons, recoloured; its viewBox is 24 × 22. */
export async function iconDataUri(name: string, color: string): Promise<string | null> {
  const file = ICON_FILES[name]
  if (!file) return null
  const svg = await cached(`icon:${file}`, () => readFile(path.join(PUBLIC, 'icons', file), 'utf8'))
  if (typeof svg !== 'string') return null
  const recoloured = svg
    .replace(/<\?xml[^>]*>\s*/, '').replace(/<!--[\s\S]*?-->/g, '')
    .replace(/fill:\s*#[0-9a-fA-F]{3,8}/g, `fill: ${color}`).replace(/fill="#[0-9a-fA-F]{3,8}"/g, `fill="${color}"`)
    .replace(/<svg\b/, `<svg fill="${color}"`)
  return `data:image/svg+xml;base64,${Buffer.from(recoloured).toString('base64')}`
}

export const ICON_RATIO = 22 / 24
