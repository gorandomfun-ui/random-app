/**
 * What a site's page says about itself, read from its HTML: its name, a line
 * of description, its preview image, and whether it is a site at all — a
 * parked domain, a hosting placeholder or a closed account is not.
 * Pure, so the server line and the tests read pages the same way.
 */

export type PageReading = {
  title: string
  description: string
  ogImage: string | null
  /** Visible words, roughly: a page with almost none is empty or a wall. */
  words: number
}

function decode(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function meta(html: string, attribute: 'property' | 'name', key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const before = new RegExp(`<meta[^>]+${attribute}=["']${escaped}["'][^>]*content=["']([^"']*)["']`, 'i').exec(html)?.[1]
  const after = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*${attribute}=["']${escaped}["']`, 'i').exec(html)?.[1]
  const value = before ?? after
  return value ? decode(value) : null
}

export function readPage(html: string, pageUrl: string): PageReading {
  const head = html.slice(0, 300_000)
  const title = meta(head, 'property', 'og:site_name') && (meta(head, 'property', 'og:title') ?? '').length > 70
    ? String(meta(head, 'property', 'og:site_name'))
    : meta(head, 'property', 'og:title') ?? decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] ?? '')
  const description = meta(head, 'property', 'og:description') ?? meta(head, 'name', 'description') ?? ''
  const image = meta(head, 'property', 'og:image') ?? meta(head, 'property', 'og:image:url') ?? meta(head, 'name', 'twitter:image') ?? meta(head, 'property', 'twitter:image')
  let ogImage: string | null = null
  if (image) {
    try {
      const resolved = new URL(image, pageUrl)
      if (/^https?:$/.test(resolved.protocol)) ogImage = resolved.toString()
    } catch { /* not an address */ }
  }
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
  const words = decode(body).split(' ').filter((word) => word.length > 1).length
  return { title: title.slice(0, 160), description: description.slice(0, 280), ogImage, words }
}

/** A domain waiting to be sold, a host's placeholder, a closed account: said anywhere on the page. */
const PARKED = /\b(?:domain (?:name )?(?:is |may be )?for sale|buy this domain|this domain (?:is|has been) (?:parked|registered)|domain parking|parked (?:free|domain)|hugedomains|afternic|sedo\s?parking|account (?:has been )?suspended|welcome to nginx|apache2? (?:debian |ubuntu )?default page|index of \/|checking your browser|attention required! \| cloudflare)/i
/** The same, told by the page's own name only: "coming soon" in a shop's text is just news. */
const PLACEHOLDER_TITLE = /\b(?:coming soon|under construction|en construction|en construcción|em construção|under maintenance|en maintenance|site not found|page not found|page non trouvée|página no encontrada|404|403 forbidden|access denied|default (?:web )?page|future home of|it works!|website (?:is )?(?:expired|unavailable)|domain (?:has )?expired|just a moment)/i

export function notASiteReason(reading: Pick<PageReading, 'title' | 'description' | 'words'>, bodySample = ''): string | null {
  const parked = PARKED.exec(`${reading.title} ${reading.description} ${bodySample.slice(0, 4000)}`)
  if (parked) return `parked: ${parked[0].toLowerCase()}`
  const placeholder = PLACEHOLDER_TITLE.exec(`${reading.title} ${reading.description}`)
  if (placeholder) return `placeholder: ${placeholder[0].toLowerCase()}`
  if (reading.words < 12 && !reading.title) return 'empty'
  return null
}

/** Not a picture of the place: logos, icons, trackers, placeholders. */
const NOT_A_PICTURE = /\.svg(?:$|\?)|^data:|logo|icon|favicon|sprite|pixel|spacer|blank|avatar|gravatar|badge|spinner|loader|loading|placeholder|flag|emoji|button|arrow|facebook\.com\/tr|doubleclick|google-analytics|\/ads?\//i

/**
 * The pictures a page shows, biggest announced first then in page order: what
 * stands for a site that has no og:image (27 September: 16 sites in 60 had
 * none but did show a large photo). Lazy-loaded and responsive images count;
 * the largest width of a srcset is taken.
 */
export function pageImages(html: string, pageUrl: string, limit = 8): string[] {
  const found: Array<{ url: string; width: number; order: number }> = []
  const add = (raw: string | undefined, width = 0) => {
    if (!raw) return
    const value = raw.trim().replace(/&amp;/g, '&')
    if (!value || NOT_A_PICTURE.test(value)) return
    try {
      const resolved = new URL(value, pageUrl)
      if (!/^https?:$/.test(resolved.protocol)) return
      found.push({ url: resolved.toString(), width, order: found.length })
    } catch { /* not an address */ }
  }
  const largestOfSrcset = (srcset: string) => {
    let best: { url: string; width: number } | null = null
    for (const part of srcset.split(',')) {
      const [url, size] = part.trim().split(/\s+/)
      const width = Number(size?.replace(/w$/, '')) || 0
      if (url && (!best || width > best.width)) best = { url, width }
    }
    return best
  }
  for (const tag of html.matchAll(/<(?:img|source)\b[^>]*>/gi)) {
    const element = tag[0]
    const attribute = (name: string) => new RegExp(`\\s${name}=["']([^"']+)["']`, 'i').exec(element)?.[1]
    const declared = Number(attribute('width')) || 0
    const srcset = attribute('data-srcset') ?? attribute('srcset')
    const largest = srcset ? largestOfSrcset(srcset) : null
    if (largest) add(largest.url, Math.max(largest.width, declared))
    add(attribute('data-src') ?? attribute('data-lazy-src') ?? attribute('data-original') ?? attribute('src'), declared)
  }
  for (const style of html.matchAll(/background(?:-image)?\s*:\s*[^;"']*url\(\s*["']?([^"')]+)["']?\s*\)/gi)) add(style[1], 1)
  add(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i.exec(html)?.[1], 1)
  const seen = new Set<string>()
  return found
    .sort((left, right) => (right.width >= 500 ? 1 : 0) - (left.width >= 500 ? 1 : 0) || left.order - right.order)
    .map((entry) => entry.url)
    .filter((url) => !seen.has(url) && Boolean(seen.add(url)))
    .slice(0, limit)
}
