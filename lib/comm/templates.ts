/**
 * Slide templates, as data. A template is a list of layers over a canvas of
 * one family of dimensions; positions and sizes are fractions of the canvas,
 * text sizes are pixels on a 1080-wide canvas and scale with it. Every
 * template carries a credit and a source layer, or it is refused.
 */

export type ColorToken = 'palette.bg' | 'palette.deep' | 'palette.cream' | 'palette.accent' | 'black' | 'white' | 'auto' | 'transparent'
export type FontName = 'Tomorrow' | 'InterTight'
export type Family = '9:16' | '4:5' | '1:1' | '16:9'

export const FAMILY_SIZES: Record<Family, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '4:5': { width: 1080, height: 1350 },
  '1:1': { width: 1080, height: 1080 },
  '16:9': { width: 1920, height: 1080 },
}

export type Layer =
  | { type: 'media'; fit: 'cover' | 'contain'; opacity?: number; top?: number; height?: number }
  | { type: 'band'; position: 'top' | 'bottom'; height: number; color: ColorToken }
  | { type: 'gradient'; from: ColorToken; to: ColorToken; direction: 'to bottom' | 'to top'; top?: number; height?: number }
  | { type: 'logo'; variant: 'horizontal' | 'vertical'; color: ColorToken; x: number; y: number; width: number }
  | { type: 'icon'; name: string; color: ColorToken; x: number; y: number; width: number }
  | { type: 'text'; font: FontName; size: number; weight: 400 | 700 | 900; color: ColorToken; x: number; y: number; maxWidth: number; lines: number; align?: 'left' | 'center' | 'right'; uppercase?: boolean }
  | { type: 'credit'; font: FontName; size: number; color: ColorToken; x: number; y: number; maxWidth: number; align?: 'left' | 'center' | 'right' }
  | { type: 'source'; font: FontName; size: number; color: ColorToken; x: number; y: number; maxWidth: number; align?: 'left' | 'center' | 'right' }
  | { type: 'glitch'; intensity: number }

export type Template = {
  key: string
  name: string
  family: Family
  /** 'framed' keeps the whole media between two bands; 'full' lets it fill the canvas. */
  mode: 'framed' | 'full'
  layers: Layer[]
}

export const LAYER_TYPES = ['media', 'band', 'gradient', 'logo', 'icon', 'text', 'credit', 'source', 'glitch'] as const
export const COLOR_TOKENS: ColorToken[] = ['palette.bg', 'palette.deep', 'palette.cream', 'palette.accent', 'black', 'white', 'auto', 'transparent']
export const ICON_NAMES = ['heart', 'shuffle', 'video', 'image', 'web', 'wave', 'quote', 'joke', 'fact', 'share', 'social', 'plus', 'info'] as const

const unit = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
const px = (value: unknown, max = 400) => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= max
const color = (value: unknown) => COLOR_TOKENS.includes(value as ColorToken)
const font = (value: unknown) => value === 'Tomorrow' || value === 'InterTight'
const align = (value: unknown) => value === undefined || value === 'left' || value === 'center' || value === 'right'

/** Every reason a template is not acceptable; an empty list means it is. */
export function validateTemplate(input: unknown): string[] {
  const errors: string[] = []
  const t = input as Partial<Template> | null
  if (!t || typeof t !== 'object') return ['pas un objet']
  if (typeof t.key !== 'string' || !/^[a-z0-9-]{2,40}$/.test(t.key)) errors.push('clé : lettres minuscules, chiffres et tirets, 2 à 40 caractères')
  if (typeof t.name !== 'string' || !t.name.trim() || t.name.length > 60) errors.push('nom manquant ou trop long')
  if (!t.family || !(t.family in FAMILY_SIZES)) errors.push('famille inconnue (9:16, 4:5, 1:1, 16:9)')
  if (t.mode !== 'framed' && t.mode !== 'full') errors.push('mode : framed ou full')
  if (!Array.isArray(t.layers) || !t.layers.length) return [...errors, 'aucune couche']
  if (t.layers.length > 40) errors.push('trop de couches (40 au plus)')
  let credit = false, source = false
  t.layers.forEach((layer, index) => {
    const at = `couche ${index + 1}`
    if (!layer || typeof layer !== 'object' || !LAYER_TYPES.includes((layer as Layer).type)) { errors.push(`${at} : type inconnu`); return }
    const l = layer as Layer
    switch (l.type) {
      case 'media':
        if (l.fit !== 'cover' && l.fit !== 'contain') errors.push(`${at} (media) : fit cover ou contain`)
        if (l.opacity !== undefined && !unit(l.opacity)) errors.push(`${at} (media) : opacité entre 0 et 1`)
        if ((l.top !== undefined && !unit(l.top)) || (l.height !== undefined && !unit(l.height))) errors.push(`${at} (media) : top et height entre 0 et 1`)
        break
      case 'band':
        if (l.position !== 'top' && l.position !== 'bottom') errors.push(`${at} (band) : position top ou bottom`)
        if (!unit(l.height) || l.height === 0) errors.push(`${at} (band) : hauteur entre 0 et 1`)
        if (!color(l.color)) errors.push(`${at} (band) : couleur hors palette`)
        break
      case 'gradient':
        if (!color(l.from) || !color(l.to)) errors.push(`${at} (gradient) : couleur hors palette`)
        if (l.direction !== 'to bottom' && l.direction !== 'to top') errors.push(`${at} (gradient) : direction`)
        if ((l.top !== undefined && !unit(l.top)) || (l.height !== undefined && !unit(l.height))) errors.push(`${at} (gradient) : top et height entre 0 et 1`)
        break
      case 'logo':
        if (l.variant !== 'horizontal' && l.variant !== 'vertical') errors.push(`${at} (logo) : variant horizontal ou vertical`)
        if (!color(l.color)) errors.push(`${at} (logo) : couleur`)
        if (!unit(l.x) || !unit(l.y) || !unit(l.width) || l.width === 0) errors.push(`${at} (logo) : x, y, width entre 0 et 1`)
        break
      case 'icon':
        if (!ICON_NAMES.includes(l.name as typeof ICON_NAMES[number])) errors.push(`${at} (icon) : icône inconnue`)
        if (!color(l.color)) errors.push(`${at} (icon) : couleur`)
        if (!unit(l.x) || !unit(l.y) || !unit(l.width) || l.width === 0) errors.push(`${at} (icon) : x, y, width entre 0 et 1`)
        break
      case 'text':
        if (!font(l.font)) errors.push(`${at} (text) : police Tomorrow ou InterTight`)
        if (!px(l.size)) errors.push(`${at} (text) : taille en px (1 à 400)`)
        if (![400, 700, 900].includes(l.weight)) errors.push(`${at} (text) : graisse 400, 700 ou 900`)
        if (!color(l.color)) errors.push(`${at} (text) : couleur`)
        if (!unit(l.x) || !unit(l.y) || !unit(l.maxWidth) || l.maxWidth === 0) errors.push(`${at} (text) : x, y, maxWidth entre 0 et 1`)
        if (!Number.isInteger(l.lines) || l.lines < 1 || l.lines > 12) errors.push(`${at} (text) : lignes 1 à 12`)
        if (!align(l.align)) errors.push(`${at} (text) : alignement`)
        break
      case 'credit':
      case 'source':
        if (l.type === 'credit') credit = true; else source = true
        if (!font(l.font)) errors.push(`${at} (${l.type}) : police`)
        if (!px(l.size, 200)) errors.push(`${at} (${l.type}) : taille en px (1 à 200)`)
        if (!color(l.color)) errors.push(`${at} (${l.type}) : couleur`)
        if (!unit(l.x) || !unit(l.y) || !unit(l.maxWidth) || l.maxWidth === 0) errors.push(`${at} (${l.type}) : x, y, maxWidth entre 0 et 1`)
        if (!align(l.align)) errors.push(`${at} (${l.type}) : alignement`)
        break
      case 'glitch':
        if (!unit(l.intensity)) errors.push(`${at} (glitch) : intensité entre 0 et 1`)
        break
    }
  })
  if (!credit) errors.push('aucune couche credit : le crédit est obligatoire')
  if (!source) errors.push('aucune couche source : la source est obligatoire')
  return errors
}

const bottomLines = (family: Family, mode: 'framed' | 'full'): Layer[] => {
  const tall = family === '9:16'
  const y = family === '16:9' ? 0.86 : tall ? 0.905 : 0.9
  const color: ColorToken = mode === 'framed' ? 'palette.cream' : 'white'
  return [
    { type: 'credit', font: 'InterTight', size: tall ? 30 : 28, color, x: 0.06, y, maxWidth: 0.88, align: 'left' },
    { type: 'source', font: 'InterTight', size: tall ? 26 : 24, color, x: 0.06, y: y + (tall ? 0.024 : 0.034), maxWidth: 0.88, align: 'left' },
  ]
}

/** The starting templates, one set per family of dimensions; the seed writes them once. */
export function seedTemplates(): Template[] {
  const framed = (key: string, name: string, family: Family, bandTop: number, bandBottom: number): Template => ({
    key, name, family, mode: 'framed',
    layers: [
      { type: 'band', position: 'top', height: bandTop, color: 'palette.bg' },
      { type: 'band', position: 'bottom', height: bandBottom, color: 'palette.bg' },
      { type: 'media', fit: 'contain', top: bandTop, height: Math.round((1 - bandTop - bandBottom) * 1000) / 1000 },
      { type: 'logo', variant: 'horizontal', color: 'auto', x: 0.06, y: 0.035, width: 0.3 },
      { type: 'text', font: 'Tomorrow', size: 56, weight: 700, color: 'palette.cream', x: 0.06, y: bandTop * 0.62, maxWidth: 0.88, lines: 2, align: 'left', uppercase: true },
      ...bottomLines(family, 'framed'),
      { type: 'glitch', intensity: 0 },
    ],
  })
  const full = (key: string, name: string, family: Family): Template => ({
    key, name, family, mode: 'full',
    layers: [
      { type: 'media', fit: 'cover' },
      { type: 'gradient', from: 'palette.bg', to: 'transparent', direction: 'to bottom', top: 0, height: 0.3 },
      { type: 'gradient', from: 'transparent', to: 'palette.bg', direction: 'to bottom', top: 0.6, height: 0.4 },
      { type: 'logo', variant: 'horizontal', color: 'white', x: 0.06, y: 0.04, width: 0.28 },
      { type: 'text', font: 'Tomorrow', size: 64, weight: 900, color: 'white', x: 0.06, y: 0.7, maxWidth: 0.88, lines: 3, align: 'left', uppercase: true },
      ...bottomLines(family, 'full'),
      { type: 'glitch', intensity: 0 },
    ],
  })
  return [
    framed('story-encadre', 'Story 9:16 encadré', '9:16', 0.2, 0.2),
    full('story-plein', 'Story 9:16 plein', '9:16'),
    framed('post-encadre', 'Post 4:5 encadré', '4:5', 0.18, 0.2),
    full('post-plein', 'Post 4:5 plein', '4:5'),
    full('carre', 'Carré 1:1', '1:1'),
    full('paysage', 'Paysage 16:9', '16:9'),
  ]
}

export function templatesForFamily(templates: Template[], family: Family): Template[] {
  return templates.filter((template) => template.family === family)
}

/** How wide a glyph runs, as a share of the font size: an average, enough to count lines ahead of the render. */
const GLYPH: Record<FontName, number> = { Tomorrow: 0.66, InterTight: 0.5 }

export type FittedText = { lines: string[]; size: number; truncated: boolean }

function wrap(text: string, charsPerLine: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const piece = word.length > charsPerLine ? word.slice(0, charsPerLine) : word
    if (!current) { current = piece; continue }
    if ((current + ' ' + piece).length <= charsPerLine) current += ' ' + piece
    else { lines.push(current); current = piece }
  }
  if (current) lines.push(current)
  return lines
}

/**
 * Shrinks the text until it holds in its lines, down to half its size; past
 * that it is cut, with an ellipsis, and the cut is reported. Never silently.
 */
export function fitText(text: string, options: { font: FontName; size: number; maxWidthPx: number; lines: number; uppercase?: boolean }): FittedText {
  const source = (options.uppercase ? text.toUpperCase() : text).replace(/\s+/g, ' ').trim()
  if (!source) return { lines: [], size: options.size, truncated: false }
  const floor = Math.max(12, Math.round(options.size * 0.5))
  let size = options.size
  while (size >= floor) {
    const perLine = Math.max(4, Math.floor(options.maxWidthPx / (size * GLYPH[options.font])))
    const lines = wrap(source, perLine)
    if (lines.length <= options.lines) return { lines, size, truncated: false }
    size = Math.round(size * 0.92)
  }
  const perLine = Math.max(4, Math.floor(options.maxWidthPx / (floor * GLYPH[options.font])))
  const lines = wrap(source, perLine).slice(0, options.lines)
  const last = lines[lines.length - 1] ?? ''
  lines[lines.length - 1] = last.length >= perLine - 1 ? last.slice(0, Math.max(1, perLine - 2)) + '…' : last + '…'
  return { lines, size: floor, truncated: true }
}
