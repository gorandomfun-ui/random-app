/**
 * Where the small personal sites are listed by people, read as pages (12 October). The owner said yes to "plus de
 * Neocities, de Show HN et de listes choisies" after finding 99 % of the sites dull — Common Crawl's front pages of
 * firms, universities and town halls.
 *
 *  - Neocities' own gallery (neocities.org/browse, random order): a hundred personal sites a page, each with its
 *    visitors, its tags and Neocities' screenshot of it. Its API lists only one's own files: `/api/list` answers
 *    "invalid_auth" without a key, and the web line asked it from 2 to 12 October for nothing.
 *  - Gossip's Web, a directory of handmade websites (some 550 on one page).
 *  - The Useless Web, the list of toys and one-joke sites its button sends to (some 130).
 *
 * Pure, so the tests read recorded pages; the route fetches them (app/api/ingest/web/route.ts) and puts what it finds
 * on the waiting list, where the server's visit judges each site like any other (scripts/v3/web-previews.ts).
 */

export type ListedSite = { url: string; title: string; tags: string[]; image?: string; visitors?: number; name?: string }

export const NEOCITIES_BROWSE = 'https://neocities.org/browse?sort_by=random'
export const GOSSIPS_WEB = 'https://gossipsweb.net/directory'
export const USELESS_WEB = 'https://theuselessweb.com/js/uselessweb.js'

function decode(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

const web = (value: string): string | null => {
  try {
    const url = new URL(value.trim())
    return /^https?:$/.test(url.protocol) ? url.toString() : null
  } catch {
    return null
  }
}

/** One page of Neocities' gallery: each site's address, name, tags, visitors and screenshot. */
export function parseNeocitiesBrowse(html: string): ListedSite[] {
  const out: ListedSite[] = []
  for (const [, name, block] of html.matchAll(/<li id="username_([^"]+)">([\s\S]*?)<\/li>/g)) {
    const url = web(/href="(https?:\/\/[^"]+)"/.exec(block)?.[1] ?? '')
    if (!url) continue
    const title = decode(/title="([^"]*)"/.exec(block)?.[1] ?? '') || name
    const visitors = Number((/title="Visitors">[\s\S]*?<\/span>\s*([\d,]+)/.exec(block)?.[1] ?? '').replace(/,/g, '')) || 0
    const tags = [...block.matchAll(/href="\/browse\?tag=([^"&]+)"/g)].map((match) => decode(match[1]).toLowerCase())
    const shot = /background:url\(([^)]+)\)/.exec(block)?.[1]
    const image = shot ? web(new URL(shot.replace(/^['"]|['"]$/g, ''), 'https://neocities.org/').toString()) ?? undefined : undefined
    out.push({ url, title, tags, visitors, name, ...(image ? { image } : {}) })
  }
  return out
}

/** Gossip's Web's directory: each handmade site's address, name and tags. */
export function parseGossipsWeb(html: string): ListedSite[] {
  const out: ListedSite[] = []
  for (const [, block] of html.matchAll(/<article id="\d+">([\s\S]*?)<\/article>/g)) {
    const link = /<a href="(https?:\/\/[^"]+)" class="website"(?: title="([^"]*)")?>([^<]*)<\/a>/.exec(block)
    const url = web(link?.[1] ?? '')
    if (!url || !link) continue
    const title = decode(link[2] ?? '') || decode(link[3] ?? '') || new URL(url).hostname
    const tags = [...block.matchAll(/href="\/tags\/([^"]+)"/g)].map((match) => decode(match[1]).toLowerCase())
    out.push({ url, title, tags })
  }
  return out
}

/** The Useless Web's list: the addresses in its script. */
export function parseUselessWeb(script: string): ListedSite[] {
  const seen = new Set<string>()
  const out: ListedSite[] = []
  for (const match of script.matchAll(/["'](https?:\/\/[^"'\s]+)["']/g)) {
    const url = web(match[1])
    if (!url || /theuselessweb\.com/i.test(url) || seen.has(url)) continue
    seen.add(url)
    out.push({ url, title: new URL(url).hostname.replace(/^www\./, ''), tags: ['useless-web'] })
  }
  return out
}
