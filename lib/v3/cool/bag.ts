/**
 * What a session's cool draws start from, dosed for what the visitor sees.
 *
 * Drawing each source with the same weight put video games in a third of
 * the threads — gaming is one register, but the curator's likes lean that
 * way too, and every start brings two neighbours of the same subject. The
 * bag says how the starts of a session split, ten at a time, shuffled once
 * per session like the other bags of the draw: one gaming, two old school
 * (archives and vintage GIFs together, since they taste the same), two
 * music, two from elsewhere, two around the likes, one trend. Never the same
 * source twice in a row.
 */

import { bagValue } from '@/lib/discovery/random'

export type CoolSource = 'gaming' | 'oldschool' | 'music' | 'elsewhere' | 'like' | 'trend'
export const COOL_SOURCES: CoolSource[] = ['gaming', 'oldschool', 'music', 'elsewhere', 'like', 'trend']

export const DEFAULT_BAG: CoolSource[] = [
  'gaming', 'oldschool', 'oldschool', 'music', 'music', 'elsewhere', 'elsewhere', 'like', 'like', 'trend',
]
/** The trend is where the bubble is; Random's point is to leave it. */
const MAX_TREND_TICKETS = 5

/**
 * The bag, from `RANDOM_COOL_BAG` when set — "gaming:1,oldschool:2,music:2,
 * elsewhere:2,like:2,trend:1" — else the default. A setting that names no
 * known source, or more than five trend tickets, is ignored.
 */
export function coolBag(setting: string | undefined = process.env.RANDOM_COOL_BAG): CoolSource[] {
  if (!setting?.trim()) return DEFAULT_BAG
  const bag: CoolSource[] = []
  for (const token of setting.split(',')) {
    const [name, countRaw] = token.split(':').map((part) => part.trim().toLowerCase())
    const count = countRaw === undefined ? 1 : Number(countRaw)
    if (!COOL_SOURCES.includes(name as CoolSource) || !Number.isInteger(count) || count < 0 || count > 10) return DEFAULT_BAG
    for (let index = 0; index < count; index += 1) bag.push(name as CoolSource)
  }
  if (!bag.length || bag.filter((source) => source === 'trend').length > MAX_TREND_TICKETS) return DEFAULT_BAG
  return bag
}

/**
 * The source of the session's next start. The bag is shuffled once per
 * session by the seed; `index` walks it. When the position repeats the
 * previous start's source, the next position is taken instead — two gaming
 * threads in a row is what the bag exists to prevent.
 */
export function pickBagSource(seed: number, index: number, previous: CoolSource | null, bag: CoolSource[] = coolBag()): CoolSource {
  const at = Math.max(0, Math.floor(index))
  const first = bagValue(seed, 'cool-source', at, bag)
  if (first !== previous || new Set(bag).size === 1) return first
  // Walk on to the next position that differs; the bag holds at most ten, so this ends.
  for (let step = 1; step <= bag.length; step += 1) {
    const next = bagValue(seed, 'cool-source', at + step, bag)
    if (next !== previous) return next
  }
  return first
}
