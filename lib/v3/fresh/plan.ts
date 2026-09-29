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

import type { RawVideo } from '@/lib/ingest/videos'

export type FreshBucket = 'world' | 'usa' | 'europe' | 'asia' | 'africa' | 'east-europe' | 'oceania' | 'music' | 'fun'
  | 'sport' | 'animals' | 'science' | 'howto' | 'people' | 'autos' | 'film'

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

/**
 * The charts of the places are mostly music and gaming everywhere (28 September:
 * 339 music and 217 gaming in a list of 732). The kinds YouTube still charts
 * per country — sport, animals, science, how-to, people, autos, film and
 * animation — each bring their own share, so the day's list covers what the
 * theme deck asks for (travel and education are no longer charted).
 */
const KIND_REGIONS = ['US', 'GB', 'FR', 'DE', 'IN', 'BR', 'MX', 'JP', 'KR', 'NG', 'ID', 'ES'] as const

export const FRESH_PLAN: readonly BucketPlan[] = [
  { bucket: 'world', quota: 110, regions: ['US', 'IN', 'BR', 'GB', 'JP', 'MX', 'ID', 'DE', 'FR', 'KR', 'ES', 'PH'], pages: 1, dailymotion: [], order: 'views' },
  { bucket: 'usa', quota: 60, regions: ['US'], pages: 3, dailymotion: [], order: 'rank' },
  { bucket: 'europe', quota: 60, regions: ['GB', 'FR', 'DE', 'IT', 'ES', 'NL', 'SE', 'PT', 'BE', 'IE', 'AT', 'CH', 'DK', 'NO', 'FI'], pages: 1, dailymotion: [], order: 'rank' },
  { bucket: 'asia', quota: 60, regions: ['JP', 'KR', 'IN', 'ID', 'TH', 'VN', 'PH', 'TW', 'MY', 'PK', 'BD', 'SG', 'HK'], pages: 1, dailymotion: [], order: 'rank' },
  { bucket: 'africa', quota: 60, regions: ['NG', 'KE', 'ZA', 'EG', 'MA', 'GH', 'SN', 'DZ', 'TN', 'UG', 'TZ'], pages: 1, dailymotion: [], order: 'rank' },
  { bucket: 'east-europe', quota: 60, regions: ['PL', 'UA', 'RO', 'CZ', 'HU', 'RS', 'BG', 'SK', 'HR', 'LT', 'LV', 'EE', 'GE', 'KZ'], pages: 1, dailymotion: [], order: 'rank' },
  { bucket: 'oceania', quota: 40, regions: ['AU', 'NZ'], pages: 4, dailymotion: [], order: 'rank' },
  { bucket: 'music', quota: 80, regions: ['US', 'GB', 'BR', 'MX', 'NG', 'KR', 'JP', 'IN', 'FR', 'ES', 'CO', 'ZA'], category: '10', pages: 1, dailymotion: [], order: 'rank' },
  { bucket: 'fun', quota: 100, regions: ['US', 'GB', 'IN', 'BR', 'MX', 'FR', 'PH', 'ID', 'NG', 'DE'], category: '23', pages: 1, dailymotion: [], order: 'rank' },
  { bucket: 'sport', quota: 60, regions: KIND_REGIONS, category: '17', pages: 1, dailymotion: [], order: 'rank' },
  { bucket: 'animals', quota: 60, regions: KIND_REGIONS, category: '15', pages: 1, dailymotion: [], order: 'rank' },
  { bucket: 'science', quota: 50, regions: KIND_REGIONS, category: '28', pages: 1, dailymotion: [], order: 'rank' },
  { bucket: 'howto', quota: 60, regions: KIND_REGIONS, category: '26', pages: 1, dailymotion: [], order: 'rank' },
  { bucket: 'people', quota: 50, regions: ['US', 'GB', 'FR', 'CA', 'AU', 'DE', 'BR', 'MX', 'IN', 'ES'], category: '22', pages: 1, dailymotion: [], order: 'rank' },
  { bucket: 'autos', quota: 40, regions: KIND_REGIONS, category: '2', pages: 1, dailymotion: [], order: 'rank' },
  { bucket: 'film', quota: 50, regions: KIND_REGIONS, category: '1', pages: 1, dailymotion: [], order: 'rank' },
]

/** The most of the day's list one universe may take: the charts push music and gaming, the list should not. */
export const FRESH_UNIVERSE_SHARE: Readonly<Partial<Record<string, number>>> = { music: 0.25, gaming: 0.15 }

/**
 * The zones' picks, trimmed so no universe passes its share of the whole list:
 * the extra ones leave from the end of each zone (its least watched), the
 * zones keeping their turns.
 */
export function capUniverses(picked: Map<FreshBucket, FreshEntry[]>, shares: Readonly<Partial<Record<string, number>>> = FRESH_UNIVERSE_SHARE): Map<FreshBucket, FreshEntry[]> {
  const total = [...picked.values()].reduce((sum, list) => sum + list.length, 0)
  const out = new Map([...picked].map(([bucket, list]) => [bucket, [...list]]))
  for (const [universe, share] of Object.entries(shares)) {
    if (share === undefined) continue
    const allowed = Math.floor(total * share)
    let over = [...out.values()].reduce((sum, list) => sum + list.filter((entry) => entry.universe === universe).length, 0) - allowed
    // Round the zones from the end, one at a time, so no zone loses all of it.
    while (over > 0) {
      let removed = false
      for (const list of out.values()) {
        if (over <= 0) break
        for (let index = list.length - 1; index >= 0; index -= 1) {
          if (list[index].universe !== universe) continue
          list.splice(index, 1)
          over -= 1
          removed = true
          break
        }
      }
      if (!removed) break
    }
  }
  return out
}

/**
 * Short spoken sketches from the humour and people charts of countries whose
 * language most visitors do not share: "KALI INI BENER KADONYAA WKWKWK",
 * "O Léo bebeu o leite" (the owner, 28 September: "je ne sais pas combien de
 * vidéos drôles Brésil ou Asie"). A gag without words travels; a sketch does
 * not. They keep a share of the list, not the list.
 */
export const FRESH_SPOKEN_SHARE = 0.1
const SHARED_LANGUAGE_REGIONS = new Set(['US', 'GB', 'CA', 'AU', 'NZ', 'IE', 'FR', 'BE', 'CH'])

export function isForeignSketch(entry: Pick<FreshEntry, 'bucket' | 'region' | 'universe'>): boolean {
  return (entry.universe === 'humor-memes' || entry.universe === 'people-everyday') && !SHARED_LANGUAGE_REGIONS.has(entry.region)
}

export function capForeignSketches(picked: Map<FreshBucket, FreshEntry[]>, share = FRESH_SPOKEN_SHARE): Map<FreshBucket, FreshEntry[]> {
  const total = [...picked.values()].reduce((sum, list) => sum + list.length, 0)
  let allowed = Math.floor(total * share)
  const out = new Map<FreshBucket, FreshEntry[]>()
  // Zone by zone in the plan's order, each video in its zone's order: the best placed keep their place.
  for (const [bucket, list] of picked) {
    out.set(bucket, list.filter((entry) => {
      if (!isForeignSketch(entry)) return true
      if (allowed <= 0) return false
      allowed -= 1
      return true
    }))
  }
  return out
}

/** A still album cover ("- Topic" channels), or a gaming session past fifteen minutes: not what opens a feed. */
export function isFreshFormat(row: { channelTitle?: unknown; duration?: unknown; universe?: unknown }): boolean {
  if (/ - Topic$/.test(String(row.channelTitle ?? ''))) return false
  if (row.universe === 'gaming') {
    const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(row.duration ?? ''))
    const seconds = match ? Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0) : 0
    if (seconds > 15 * 60) return false
  }
  return true
}

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

/**
 * Made by AI, as its channel or its title says: the owner's guard for the
 * fresh list ("pas des trucs d'IA"), seen on the first day with a video from
 * "ILARION-AI-STUDIO".
 */
const AI_MADE = /(?:^|[^\p{L}\p{N}])(?:ai|a\.i\.)[\s_-]*(?:studio|studios|music|art|generated|films?|animation|cover|song|story|stories|video)(?=$|[^\p{L}\p{N}])|\b(?:ai[- ]generated|generated by ai|made with ai|sora|veo ?\d?|midjourney|suno|udio)\b/iu

export function isAiMade(channel: string | null | undefined, title: string | null | undefined): boolean {
  return AI_MADE.test(`${channel ?? ''} ${title ?? ''}`)
}

export type FreshFound = { raw: RawVideo; bucket: FreshBucket; rank: number; region: string; /** Its view count is an old one, not read today. */ stale?: boolean }

/**
 * The chart videos read in the last hours, as the zones they came from: every
 * chart video keeps where it was seen ("youtube:trending:in", ":10" for the
 * music chart). When YouTube's allowance is spent, the list is rebuilt from
 * them instead of shrinking — a third run on 27 September found 93 videos and
 * replaced the day's thousand.
 */
export function observedFound(rows: Array<{ videoId?: unknown; title?: unknown; provider?: unknown; viewCount?: unknown; discoveryQueries?: unknown }>): FreshFound[] {
  const byRegion = new Map<string, Array<{ raw: RawVideo; region: string; category?: string }>>()
  for (const row of rows) {
    const queries = Array.isArray(row.discoveryQueries) ? row.discoveryQueries.map(String) : []
    const seen = queries.map((query) => /^youtube:trending:([a-z]{2})(?::(\d+))?$/.exec(query)).find(Boolean)
    if (!seen || typeof row.videoId !== 'string') continue
    const region = seen[1].toUpperCase(), category = seen[2]
    const raw = { videoId: row.videoId, url: `https://youtu.be/${row.videoId}`, provider: 'youtube', title: String(row.title ?? ''), viewCount: typeof row.viewCount === 'number' ? row.viewCount : 0 } as RawVideo
    const key = `${region}:${category ?? ''}`
    byRegion.set(key, [...(byRegion.get(key) ?? []), { raw, region, category }])
  }
  const found: FreshFound[] = []
  for (const list of byRegion.values()) {
    // The chart's order is gone; its views stand in for it.
    list.sort((left, right) => (right.raw.viewCount ?? 0) - (left.raw.viewCount ?? 0))
    list.forEach((entry, rank) => {
      for (const plan of FRESH_PLAN) {
        if ((plan.category ?? '') !== (entry.category ?? '') || !plan.regions.includes(entry.region)) continue
        found.push({ raw: entry.raw, bucket: plan.bucket, rank, region: entry.region })
      }
    })
  }
  return found
}


/**
 * Views of the day, measured by us: the owner's rule of 27 September. A
 * chart ranks what is rising, and a video with a huge total climbs every list
 * it is on; ranked by what they gained in a day, the day's real stars come
 * first and the same giants do not come back round. A video needs a count
 * taken ten to thirty-six hours ago — the day after it was first seen is
 * soon enough.
 */
export type ViewSample = { at: number; views: number }
const HOUR = 3_600_000

/**
 * A count taken ten to thirty-six hours ago: the evening catch-up of 29
 * September read the charts at 21:00 and the morning run comes at 09:05,
 * twelve hours and a few minutes later — a twelve-hour floor left half the
 * category zones unmeasured, hence empty.
 */
export const DAILY_MIN_HOURS = 10
export function dailyViews(samples: readonly ViewSample[], viewsNow: number, now: number): number | null {
  const usable = samples.filter((sample) => now - sample.at >= DAILY_MIN_HOURS * HOUR && now - sample.at <= 36 * HOUR && sample.views <= viewsNow)
  if (!usable.length) return null
  const closest = [...usable].sort((left, right) => Math.abs(now - left.at - 24 * HOUR) - Math.abs(now - right.at - 24 * HOUR))[0]
  return Math.round(((viewsNow - closest.views) * 24 * HOUR) / (now - closest.at))
}

/** Within a zone and a country, the order of the day's views: first the one that gained the most. */
export function rankByDaily<T extends { bucket: FreshBucket; region: string; daily: number }>(entries: T[]): Array<T & { rank: number }> {
  const groups = new Map<string, T[]>()
  for (const entry of entries) groups.set(`${entry.bucket}:${entry.region}`, [...(groups.get(`${entry.bucket}:${entry.region}`) ?? []), entry])
  const out: Array<T & { rank: number }> = []
  for (const group of groups.values()) {
    group.sort((left, right) => right.daily - left.daily).forEach((entry, rank) => out.push({ ...entry, rank }))
  }
  return out
}
