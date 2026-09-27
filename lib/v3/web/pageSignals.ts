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
