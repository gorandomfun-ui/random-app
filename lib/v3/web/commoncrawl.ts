/**
 * Common Crawl as a source of the world's small sites: the front pages of a
 * country's domain, read from the crawl's public index — free, no key, no
 * Google (the owner, 2-3 October: sites found without CSE, and sources that
 * cost nothing).
 *
 * Not through the index's query API, which times out on a whole country:
 * through its static files. `cluster.idx` (105 MB, one line per block of
 * three thousand records, sorted by reversed host — "cm,armp)/…") says which
 * compressed blocks hold a country; each block is one HTTP range request,
 * gunzipped, its records read for the live front pages (status 200, HTML,
 * path "/"). One block in Cameroon gave sixty front pages (3 October). The
 * sites then wait in the list the previews line visits (lib/v3/web/candidates.ts),
 * which judges them as it judges every other source.
 */

import { gunzipSync } from 'node:zlib'

export const CRAWLS_URL = 'https://index.commoncrawl.org/collinfo.json'
export const INDEX_BASE = 'https://data.commoncrawl.org/cc-index/collections'

export type Block = { surt: string; file: string; offset: number; length: number }
export type RootPage = { host: string; url: string }

/** The newest crawl's id ("CC-MAIN-2026-39"). */
export async function latestCrawl(request: typeof fetch = fetch): Promise<string> {
  const response = await request(CRAWLS_URL)
  if (!response.ok) throw new Error(`commoncrawl: collinfo HTTP ${response.status}`)
  const crawls = await response.json() as Array<{ id?: string }>
  const id = crawls[0]?.id
  if (!id) throw new Error('commoncrawl: no crawl listed')
  return id
}

export const clusterUrl = (crawl: string): string => `${INDEX_BASE}/${crawl}/indexes/cluster.idx`
export const blockUrl = (crawl: string, block: Block): string => `${INDEX_BASE}/${crawl}/indexes/${block.file}`

/** One line of cluster.idx: "surt timestamp<tab>file<tab>offset<tab>length<tab>seq". */
export function parseClusterLine(line: string): Block | null {
  const [key, file, offset, length] = line.split('\t')
  if (!key || !file || !offset || !length) return null
  const surt = key.split(' ')[0]
  const at = Number(offset), size = Number(length)
  if (!surt || !Number.isInteger(at) || !Number.isInteger(size) || size <= 0) return null
  return { surt, file, offset: at, length: size }
}

/** The reversed-host prefix of a country's domain: "cm," for every host under .cm (and "cm)" for the bare domain). */
const prefixesOf = (tld: string) => [`${tld},`, `${tld})`]

/**
 * The blocks that may hold a country's hosts: those whose first key is under
 * the domain, and the one before them — a block's first key is only its
 * first record, the country's hosts may start inside the previous block.
 */
export function blocksFor(lines: Iterable<string>, tld: string): Block[] {
  const prefixes = prefixesOf(tld.toLowerCase())
  const out: Block[] = []
  let previous: Block | null = null
  let inside = false
  for (const line of lines) {
    const block = parseClusterLine(line)
    if (!block) continue
    const matches = prefixes.some((prefix) => block.surt.startsWith(prefix))
    if (matches) {
      if (!inside && previous) out.push(previous)
      out.push(block)
      inside = true
    } else if (inside) {
      break
    }
    previous = block
  }
  return out
}

/** A gunzipped block's records, as lines. */
export function recordsOf(gz: Buffer): string[] {
  return gunzipSync(gz).toString('utf8').split('\n')
}

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/
/** A front page: scheme, bare host (no port), root path; a query string is tolerated. */
const ROOT = /^(https?):\/\/([^/:?#]+)\/?(?:[?#].*)?$/

/**
 * The live front pages of a country in a block's records: status 200, HTML,
 * a bare host and the root path; "www." dropped, one page per host, https
 * when the crawl saw both. `seen` carries the hosts across blocks.
 */
export function rootPagesIn(lines: Iterable<string>, tld: string, seen: Map<string, RootPage> = new Map()): RootPage[] {
  const suffix = `.${tld.toLowerCase()}`
  const added: RootPage[] = []
  for (const line of lines) {
    const start = line.indexOf(' {')
    if (start < 0) continue
    let record: { url?: string; status?: string; mime?: string; 'mime-detected'?: string }
    try { record = JSON.parse(line.slice(start + 1)) } catch { continue }
    if (record.status !== '200') continue
    const mime = String(record['mime-detected'] ?? record.mime ?? '')
    if (!mime.startsWith('text/html')) continue
    const match = ROOT.exec(String(record.url ?? ''))
    if (!match) continue
    const scheme = match[1]
    const host = match[2].toLowerCase().replace(/^www\./, '')
    if (!host.endsWith(suffix) || IPV4.test(host) || host.includes('_')) continue
    const page = { host, url: `${scheme}://${host}/` }
    const known = seen.get(host)
    if (known) { if (scheme === 'https' && known.url.startsWith('http:')) known.url = page.url; continue }
    seen.set(host, page)
    added.push(page)
  }
  return added
}

/** The country of the day: the places take turns, one a day, round and round. */
export function countryOfDay(countries: readonly string[], now = new Date()): string {
  return countriesFrom(countries, 1, now)[0]
}

/** The day's country and the next few in the round: a small country gives a hundred front pages, so a run goes on to the next until it has its fill. */
export function countriesFrom(countries: readonly string[], count: number, now = new Date()): string[] {
  if (!countries.length) return []
  const day = Math.floor(now.getTime() / 86_400_000)
  const start = ((day % countries.length) + countries.length) % countries.length
  return Array.from({ length: Math.min(count, countries.length) }, (_, index) => countries[(start + index) % countries.length])
}

/** One block, fetched by range and read. */
export async function fetchBlock(crawl: string, block: Block, request: typeof fetch = fetch): Promise<string[]> {
  const response = await request(blockUrl(crawl, block), { headers: { range: `bytes=${block.offset}-${block.offset + block.length - 1}` } })
  if (response.status !== 206 && response.status !== 200) throw new Error(`commoncrawl: block HTTP ${response.status}`)
  return recordsOf(Buffer.from(await response.arrayBuffer()))
}
