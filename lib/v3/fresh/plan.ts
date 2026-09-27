/**
 * Fresh of the day, asked for by the owner on 27 September: every morning,
 * the videos most watched right now around the world, a thousand, and each
 * session opens on ten of them — a new ten every time the visitor comes
 * back — before the cool pool and the ordinary draw.
 *
 * YouTube's "most popular" chart per country is the source (one unit for
 * fifty videos). Dailymotion's most watched of the week was tried on the
 * first day and brought a 2k-view rugby clip, an "IMG_3314" and a reposted
 * Turkish serial: it is left out (the field stays for later). Pure: which
 * countries make each zone, how a zone picks its videos, and the order the
 * day's list is served in.
 */

export type FreshBucket = 'world' | 'usa' | 'europe' | 'asia' | 'africa' | 'east-europe' | 'oceania' | 'music' | 'fun'

export type BucketPlan = {
  bucket: FreshBucket
  quota: number
  /** YouTube chart regions. */
  regions: readonly string[]
  /** YouTube category of the chart, when the zone is a kind rather than a place. */
  category?: string
  /** Pages of fifty read per region. */
  pages: number
  /** Dailymotion countries whose week's most watched complete the zone. */
  dailymotion: readonly string[]
  /** 'views': the biggest first, the world's hits; 'rank': the countries take turns, each brings its own. */
  order: 'views' | 'rank'
}

export const FRESH_PLAN: readonly BucketPlan[] = [
  { bucket: 'world', quota: 200, regions: ['US', 'IN', 'BR', 'GB', 'JP', 'MX', 'ID', 'DE', 'FR', 'KR', 'ES', 'PH'], pages: 1, dailymotion: [], order: 'views' },
  { bucket: 'usa', quota: 100, regions: ['US'], pages: 3, dailymotion: [], order: 'rank' },
  { bucket: 'europe', quota: 100, regions: ['GB', 'FR', 'DE', 'IT', 'ES', 'NL', 'SE', 'PT', 'BE', 'IE', 'AT', 'CH', 'DK', 'NO', 'FI'], pages: 1, dailymotion: [], order: 'rank' },
  { bucket: 'asia', quota: 100, regions: ['JP', 'KR', 'IN', 'ID', 'TH', 'VN', 'PH', 'TW', 'MY', 'PK', 'BD', 'SG', 'HK'], pages: 1, dailymotion: [], order: 'rank' },
  { bucket: 'africa', quota: 100, regions: ['NG', 'KE', 'ZA', 'EG', 'MA', 'GH', 'SN', 'DZ', 'TN', 'UG', 'TZ'], pages: 1, dailymotion: [], order: 'rank' },
  { bucket: 'east-europe', quota: 100, regions: ['PL', 'UA', 'RO', 'CZ', 'HU', 'RS', 'BG', 'SK', 'HR', 'LT', 'LV', 'EE', 'GE', 'KZ'], pages: 1, dailymotion: [], order: 'rank' },
  { bucket: 'oceania', quota: 100, regions: ['AU', 'NZ'], pages: 4, dailymotion: [], order: 'rank' },
  { bucket: 'music', quota: 100, regions: ['US', 'GB', 'BR', 'MX', 'NG', 'KR', 'JP', 'IN', 'FR', 'ES', 'CO', 'ZA'], category: '10', pages: 1, dailymotion: [], order: 'rank' },
  { bucket: 'fun', quota: 100, regions: ['US', 'GB', 'IN', 'BR', 'MX', 'FR', 'PH', 'ID', 'NG', 'DE'], category: '23', pages: 1, dailymotion: [], order: 'rank' },
]

/** News on the fresh list: one or two at most, the owner's rule for TV news anywhere. */
export const FRESH_NEWS_MAX = 2
/** A video that was fresh in the last days is not fresh again: the charts keep a hit for a week. */
export const FRESH_MEMORY_DAYS = 3
/** Within any ten in a row: one video per channel, one per near-identical title. */
export const FRESH_SPACING = 10
/** …and no more than four of one universe: the charts are mostly music, the day's list should not be. */
export const FRESH_UNIVERSE_MAX = 4

export type FreshEntry = {
  id: string
  videoId: string
  bucket: FreshBucket
  /** Position in its chart, 0 first. */
  rank: number
  region: string
  views: number
  channel?: string
  family?: string
  universe?: string
}

/** A zone's picks: the biggest first, or each country in turn by its own chart order. */
export function pickBucket(entries: FreshEntry[], plan: BucketPlan, taken: Set<string>): FreshEntry[] {
  const fresh = entries.filter((entry) => !taken.has(entry.videoId))
  let ordered: FreshEntry[]
  if (plan.order === 'views') {
    ordered = [...fresh].sort((left, right) => right.views - left.views)
  } else {
    const byRegion = new Map<string, FreshEntry[]>()
    for (const entry of [...fresh].sort((left, right) => left.rank - right.rank)) byRegion.set(entry.region, [...(byRegion.get(entry.region) ?? []), entry])
    ordered = []
    const queues = [...byRegion.values()]
    for (let round = 0; queues.some((queue) => queue.length > round); round += 1) {
      for (const queue of queues) if (queue[round]) ordered.push(queue[round])
    }
  }
  const out: FreshEntry[] = []
  for (const entry of ordered) {
    if (out.length >= plan.quota) break
    if (taken.has(entry.videoId)) continue
    taken.add(entry.videoId)
    out.push(entry)
  }
  return out
}

/**
 * The day's order: the zones take turns in proportion to their quota, and
 * within any ten in a row there is never the same channel or the same song
 * twice. A video that cannot be placed without breaking that waits for the
 * next turn; at the end the rest follow as they can.
 */
export function interleave(buckets: Map<FreshBucket, FreshEntry[]>): FreshEntry[] {
  const queues = FRESH_PLAN.map((plan) => ({ plan, queue: [...(buckets.get(plan.bucket) ?? [])], credit: 0 })).filter((entry) => entry.queue.length)
  const total = queues.reduce((sum, entry) => sum + entry.queue.length, 0)
  const out: FreshEntry[] = []
  const clashes = (entry: FreshEntry) => {
    const window = out.slice(-FRESH_SPACING + 1)
    if (window.some((previous) => (entry.channel && previous.channel === entry.channel) || (entry.family && previous.family === entry.family))) return true
    return Boolean(entry.universe) && window.filter((previous) => previous.universe === entry.universe).length >= FRESH_UNIVERSE_MAX
  }
  while (out.length < total) {
    for (const entry of queues) entry.credit += entry.plan.quota
    queues.sort((left, right) => right.credit - left.credit)
    let placed = false
    for (const entry of queues) {
      if (!entry.queue.length) continue
      const index = entry.queue.findIndex((candidate) => !clashes(candidate))
      if (index < 0) continue
      out.push(entry.queue.splice(index, 1)[0])
      entry.credit -= queues.reduce((sum, other) => sum + other.plan.quota, 0)
      placed = true
      break
    }
    if (!placed) {
      // Everything left clashes: take the oldest waiting rather than stop.
      const next = queues.find((entry) => entry.queue.length)
      if (!next) break
      out.push(next.queue.shift()!)
    }
  }
  return out
}
