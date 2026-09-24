/**
 * Whether a website is light or dark, read from what it declares — its
 * body's background in the page or its first stylesheets, a `bgcolor`, a
 * `color-scheme`. Not `theme-color`: it names a brand colour (Mashable says
 * black on a white page), and a wrong answer hides the logo. A frame keeps
 * its colours to itself once shown, so the answer is read at the nightly
 * check and stored; the overlay then draws RANDOM's logo black on a light
 * site, white on a dark one, outlined when the site said nothing.
 */

export type Tone = 'light' | 'dark'
export type ToneReading = { tone: Tone | null; evidence: string | null }

type Rgb = { r: number; g: number; b: number }

const NAMED: Record<string, Rgb> = {
  white: { r: 255, g: 255, b: 255 }, black: { r: 0, g: 0, b: 0 }, ivory: { r: 255, g: 255, b: 240 }, snow: { r: 255, g: 250, b: 250 },
  whitesmoke: { r: 245, g: 245, b: 245 }, beige: { r: 245, g: 245, b: 220 }, linen: { r: 250, g: 240, b: 230 }, gainsboro: { r: 220, g: 220, b: 220 },
  lightgray: { r: 211, g: 211, b: 211 }, lightgrey: { r: 211, g: 211, b: 211 }, silver: { r: 192, g: 192, b: 192 }, gray: { r: 128, g: 128, b: 128 }, grey: { r: 128, g: 128, b: 128 },
  dimgray: { r: 105, g: 105, b: 105 }, darkgray: { r: 169, g: 169, b: 169 }, navy: { r: 0, g: 0, b: 128 }, midnightblue: { r: 25, g: 25, b: 112 },
  darkslategray: { r: 47, g: 79, b: 79 }, maroon: { r: 128, g: 0, b: 0 }, darkgreen: { r: 0, g: 100, b: 0 }, darkblue: { r: 0, g: 0, b: 139 }, indigo: { r: 75, g: 0, b: 130 },
}

/** A CSS colour to its channels: hex, rgb(), rgba(), the usual names. Null for gradients, images, `transparent` and the unknown. */
export function parseColor(value: string | null | undefined): Rgb | null {
  const raw = (value ?? '').trim().toLowerCase().replace(/!important/g, '').trim()
  if (!raw || raw === 'transparent' || raw === 'inherit' || raw === 'initial' || raw.startsWith('var(') || raw.includes('gradient') || raw.includes('url(')) return null
  const hex = raw.match(/^#([0-9a-f]{3,8})$/)
  if (hex) {
    const digits = hex[1]
    if (digits.length === 3 || digits.length === 4) return { r: parseInt(digits[0] + digits[0], 16), g: parseInt(digits[1] + digits[1], 16), b: parseInt(digits[2] + digits[2], 16) }
    if (digits.length === 6 || digits.length === 8) return { r: parseInt(digits.slice(0, 2), 16), g: parseInt(digits.slice(2, 4), 16), b: parseInt(digits.slice(4, 6), 16) }
    return null
  }
  const rgb = raw.match(/^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/)
  if (rgb) {
    const alpha = rgb[4] === undefined ? 1 : rgb[4].endsWith('%') ? Number(rgb[4].slice(0, -1)) / 100 : Number(rgb[4])
    if (alpha < 0.5) return null
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) }
  }
  return NAMED[raw] ?? null
}

/** Relative luminance, 0 black to 1 white. */
export function luminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => { const c = value / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function toneOf(rgb: Rgb): Tone {
  return luminance(rgb) >= 0.4 ? 'light' : 'dark'
}

/** The background a declaration gives, the last `background` or `background-color` wins, as in CSS. */
function backgroundIn(declarations: string): string | null {
  let found: string | null = null
  for (const match of declarations.matchAll(/(?:^|[;\s])background(?:-color)?\s*:\s*([^;}]+)/gi)) {
    const value = match[1].trim()
    // A shorthand may carry an image and a colour: the colour is any token that parses.
    const colour = value.split(/\s+(?![^(]*\))/).find((token) => parseColor(token))
    if (colour) found = colour
    else if (!/url\(|gradient/.test(value)) found = value
  }
  return found
}

/** The body's (or html's) background in a stylesheet: the first rule naming body or html. */
export function toneFromCss(css: string): ToneReading {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const match of text.matchAll(/(?:^|[\s,}])(?:html|body)\s*(?:,\s*[^{]+)?\{([^}]*)\}/gi)) {
    const value = backgroundIn(match[1])
    const rgb = parseColor(value)
    if (rgb) return { tone: toneOf(rgb), evidence: `css body background ${value}` }
  }
  return { tone: null, evidence: null }
}

const attribute = (tag: string, name: string): string | null => {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
  return match ? (match[2] ?? match[3] ?? match[4] ?? '').trim() : null
}

const metaContent = (html: string, name: string): string | null => {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0]
    if ((attribute(tag, 'name') ?? '').toLowerCase() !== name) continue
    const content = attribute(tag, 'content')
    if (content) return content
  }
  return null
}

/** What the page itself says, strongest evidence first; `theme-color` is not evidence. */
export function toneFromHtml(html: string): ToneReading {
  const head = html.slice(0, 400_000)
  for (const tagName of ['body', 'html']) {
    const tag = head.match(new RegExp(`<${tagName}\\b[^>]*>`, 'i'))?.[0]
    if (!tag) continue
    const style = attribute(tag, 'style')
    const inline = style ? parseColor(backgroundIn(style)) : null
    if (inline) return { tone: toneOf(inline), evidence: `${tagName} style background` }
    const bgcolor = tagName === 'body' ? parseColor(attribute(tag, 'bgcolor')) : null
    if (bgcolor) return { tone: toneOf(bgcolor), evidence: 'body bgcolor' }
  }
  for (const match of head.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    const reading = toneFromCss(match[1])
    if (reading.tone) return { tone: reading.tone, evidence: `style block: ${reading.evidence}` }
  }
  const scheme = (metaContent(head, 'color-scheme') ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  if (scheme.length === 1 && (scheme[0] === 'dark' || scheme[0] === 'light')) return { tone: scheme[0] as Tone, evidence: 'meta color-scheme' }
  return { tone: null, evidence: null }
}

/** The stylesheets a page links, absolute, the first few. */
export function stylesheetUrls(html: string, base: string, limit = 4): string[] {
  const urls: string[] = []
  for (const match of html.slice(0, 400_000).matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0]
    if (!/\brel\s*=\s*["']?[^"'>]*stylesheet/i.test(tag)) continue
    const href = attribute(tag, 'href')
    if (!href) continue
    try { urls.push(new URL(href, base).toString()) } catch { /* not an address */ }
    if (urls.length >= limit) break
  }
  return urls
}

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const MAX_BYTES = 400_000

async function fetchText(url: string, accept: string, timeoutMs: number, request: typeof fetch): Promise<{ text: string; url: string } | null> {
  try {
    const response = await request(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': BROWSER_UA, Accept: accept } })
    if (!response.ok) return null
    const text = (await response.text()).slice(0, MAX_BYTES)
    return { text, url: response.url || url }
  } catch {
    return null
  }
}

/** Reads a site's tone: its page first, then its first stylesheets. Null when it declares nothing readable. */
export async function readTone(url: string, options: { timeoutMs?: number; request?: typeof fetch } = {}): Promise<ToneReading> {
  const timeoutMs = options.timeoutMs ?? 9000
  const request = options.request ?? fetch
  const page = await fetchText(url, 'text/html,*/*', timeoutMs, request)
  if (!page) return { tone: null, evidence: null }
  const own = toneFromHtml(page.text)
  if (own.tone) return own
  // A stylesheet's body rule is trusted for "light" only: a black body under a white wrapper is common
  // (Literary Hub says #000 and is white), and a wrong "dark" hides the logo; a wrong "light" is rare.
  for (const sheet of stylesheetUrls(page.text, page.url)) {
    const css = await fetchText(sheet, 'text/css,*/*', timeoutMs, request)
    if (!css) continue
    const reading = toneFromCss(css.text)
    if (reading.tone === 'light') return { tone: 'light', evidence: `stylesheet: ${reading.evidence}` }
  }
  return { tone: null, evidence: null }
}
