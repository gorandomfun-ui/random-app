/**
 * Telling a dead website from one that simply refuses robots.
 *
 * A live sample of 60 sites came back 10% "dead", but several of those were
 * 403s from ArtStation and similar, which a real visitor sees perfectly well.
 * Suspending those would remove good content, so the two cases are kept
 * separate and only the certain ones count.
 */

export type LinkVerdict =
  /** Gone for good: nothing is served at this address any more. */
  | { state: 'dead'; reason: string; status?: number }
  /** Answers, or refuses robots. Either way a visitor gets a page. */
  | { state: 'alive'; status: number }
  /** Refused us specifically. Not evidence of anything. */
  | { state: 'blocked'; status: number }
  /** Timed out or the network failed. Retry another day. */
  | { state: 'unknown'; reason: string }

/** Statuses that mean the page is genuinely gone. */
const DEAD_STATUSES = new Set([404, 410, 451])
/** Statuses that mean "not for robots", which says nothing about the page. */
const BLOCKED_STATUSES = new Set([401, 403, 429, 999])

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

export async function checkLink(url: string, timeoutMs = 9000): Promise<LinkVerdict> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      // Presenting as a browser: many hosts serve a 403 to anything else, and
      // we are trying to learn what a visitor would see.
      headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,*/*' },
    })

    if (response.ok) return { state: 'alive', status: response.status }
    if (DEAD_STATUSES.has(response.status)) {
      return { state: 'dead', reason: `HTTP ${response.status}`, status: response.status }
    }
    if (BLOCKED_STATUSES.has(response.status)) return { state: 'blocked', status: response.status }
    // 5xx: the host is having a bad day, not necessarily a dead page.
    return { state: 'unknown', reason: `HTTP ${response.status}` }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'requête échouée'
    // A name that no longer resolves is the one network error that is conclusive.
    if (/ENOTFOUND|getaddrinfo|ERR_NAME_NOT_RESOLVED/i.test(message)) {
      return { state: 'dead', reason: 'domaine introuvable' }
    }
    return { state: 'unknown', reason: message }
  }
}

/** A preview image that no longer loads leaves a hole in the card. */
export async function checkImage(url: string, timeoutMs = 8000): Promise<LinkVerdict> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': BROWSER_UA, Accept: 'image/*' },
    })
    if (response.ok) {
      const type = response.headers.get('content-type') ?? ''
      if (type && !type.startsWith('image/')) {
        return { state: 'dead', reason: `type ${type}`, status: response.status }
      }
      return { state: 'alive', status: response.status }
    }
    if (DEAD_STATUSES.has(response.status)) {
      return { state: 'dead', reason: `HTTP ${response.status}`, status: response.status }
    }
    if (BLOCKED_STATUSES.has(response.status)) return { state: 'blocked', status: response.status }
    return { state: 'unknown', reason: `HTTP ${response.status}` }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'requête échouée'
    if (/ENOTFOUND|getaddrinfo/i.test(message)) return { state: 'dead', reason: 'domaine introuvable' }
    return { state: 'unknown', reason: message }
  }
}

/**
 * Pages that sell rather than show. The brief wants object-sites —
 * experiments, curiosities, personal projects — not product listings.
 */
const MERCHANT_PATH = /\/(?:shop|store|boutique|cart|panier|checkout|product|produit|products|pricing|tarifs|subscribe|abonnement|buy|acheter|order|commande)(?:\/|$|\?)/i
const MERCHANT_HOST = /(?:^|\.)(?:shop|store|boutique|shopify|etsy|amazon|ebay|aliexpress|alibaba)\./i

export function looksMerchant(url: string): boolean {
  try {
    const parsed = new URL(url)
    return MERCHANT_HOST.test(parsed.hostname) || MERCHANT_PATH.test(parsed.pathname)
  } catch {
    return false
  }
}
