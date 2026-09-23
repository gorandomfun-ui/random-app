/**
 * Knowing ahead whether a website can be shown inside Random.
 *
 * Many sites forbid being framed (`X-Frame-Options`, a CSP `frame-ancestors`),
 * and the browser never tells the page: the frame just stays blank. So the
 * verdict is read from the headers of the final answer, on the server, and
 * written on the site; the page only frames what was found embeddable.
 */

import { checkLink, type LinkVerdict } from './linkCheck'

/** Where Random lives: what a `frame-ancestors` must allow. */
export const RANDOM_HOSTS = ['gorandom.fun', 'www.gorandom.fun']

export type EmbedVerdict =
  | { embeddable: true; url: string }
  | { embeddable: false; reason: 'x-frame-options' | 'frame-ancestors' | 'http-only' | 'not-html' | 'not-ok' | 'request-failed'; url?: string }

type HeaderReader = { get(name: string): string | null }

/** Whether a `frame-ancestors` directive lets Random's origin in. */
export function frameAncestorsAllow(csp: string, hosts: readonly string[] = RANDOM_HOSTS): boolean {
  const directive = csp.split(';').map((part) => part.trim()).find((part) => /^frame-ancestors\b/i.test(part))
  if (!directive) return true
  const sources = directive.replace(/^frame-ancestors/i, '').trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!sources.length || sources.includes("'none'")) return false
  return sources.some((source) => {
    if (source === '*' || source === 'https:' || source === 'https://*') return true
    const bare = source.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    if (bare.startsWith('*.')) return hosts.some((host) => host.endsWith(bare.slice(1)))
    return hosts.includes(bare)
  })
}

/**
 * The verdict from a final answer: its status, headers and address. Pure,
 * so recorded answers can be tested.
 */
export function embedVerdict(input: { status: number; headers: HeaderReader; url: string }): EmbedVerdict {
  const { status, headers, url } = input
  if (status < 200 || status >= 300) return { embeddable: false, reason: 'not-ok', url }
  const type = (headers.get('content-type') ?? '').toLowerCase()
  if (type && !/text\/html|application\/xhtml\+xml/.test(type)) return { embeddable: false, reason: 'not-html', url }
  if (headers.get('x-frame-options')) return { embeddable: false, reason: 'x-frame-options', url }
  const csp = [headers.get('content-security-policy'), headers.get('content-security-policy-report-only')].filter(Boolean) as string[]
  // Report-only never blocks; only the enforced policy counts.
  const enforced = headers.get('content-security-policy')
  if (enforced && !frameAncestorsAllow(enforced)) return { embeddable: false, reason: 'frame-ancestors', url }
  void csp
  if (/^http:\/\//i.test(url)) return { embeddable: false, reason: 'http-only', url }
  return { embeddable: true, url }
}

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

async function fetchFinal(url: string, timeoutMs: number, request: typeof fetch): Promise<{ status: number; headers: HeaderReader; url: string } | null> {
  try {
    const response = await request(url, {
      method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,*/*' },
    })
    // The body is not needed: only the headers of the final answer say whether a frame may show it.
    await response.body?.cancel().catch(() => undefined)
    return { status: response.status, headers: response.headers, url: response.url || url }
  } catch {
    return null
  }
}

/**
 * Asks the site: the final answer after redirections, and when it ends up on
 * plain http, whether the https twin answers — a frame on http inside an
 * https page is blocked, so the https address is the one to keep.
 */
export async function checkEmbeddable(url: string, options: { timeoutMs?: number; request?: typeof fetch } = {}): Promise<EmbedVerdict> {
  const timeoutMs = options.timeoutMs ?? 9000
  const request = options.request ?? fetch
  const final = await fetchFinal(url, timeoutMs, request)
  if (!final) return { embeddable: false, reason: 'request-failed' }
  const verdict = embedVerdict(final)
  if (verdict.embeddable || verdict.reason !== 'http-only') return verdict
  const https = await fetchFinal(final.url.replace(/^http:/i, 'https:'), timeoutMs, request)
  if (!https || !/^https:\/\//i.test(https.url)) return verdict
  const twin = embedVerdict(https)
  return twin.embeddable ? twin : { embeddable: false, reason: 'http-only', url: final.url }
}

/** One request for both questions a stored site gets: is it alive, can it be framed. */
export async function inspectSite(url: string, options: { timeoutMs?: number; request?: typeof fetch } = {}): Promise<{ link: LinkVerdict; embed: EmbedVerdict }> {
  const [link, embed] = await Promise.all([checkLink(url, options.timeoutMs ?? 9000), checkEmbeddable(url, options)])
  return { link, embed }
}
