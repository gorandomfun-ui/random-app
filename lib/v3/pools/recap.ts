/**
 * What each pool holds and what entered it: the recap the owner asked for
 * at the end of an ingestion day. Sizes are one indexed count per universe,
 * less what a mini-series sweep set aside, so they say what the draw can
 * really serve; what entered is read from the last twenty-four hours of videos.
 */

import type { Db, Document } from 'mongodb'

import { UNIVERSES, type Universe } from '../types'

export const RECAP_COLLECTION = 'ingest_universe_recap'
const DAY_MS = 86_400_000

export type UniverseRecap = {
  /** The Paris day the recap closes, `YYYY-MM-DD`. */
  day: string
  at: Date
  /** What the draw can serve: stored, less what was set aside. */
  sizes: Partial<Record<Universe, number>>
  added: Partial<Record<Universe, number>>
  /** Stored videos set aside as mini-series, by universe (see `mini_series_sweeps_v3`). */
  setAside?: Partial<Record<Universe, number>>
}

/** Where a mini-series sweep keeps, among other things, how many it set aside in each universe. */
export const SWEEPS_COLLECTION = 'mini_series_sweeps_v3'

/** What the sweeps still in force set aside, by universe: a handful of small documents. */
export async function setAsideByUniverse(db: Db): Promise<Partial<Record<Universe, number>>> {
  const rows = await db.collection(SWEEPS_COLLECTION).find({ undoneAt: { $exists: false } }, { projection: { byUniverse: 1 }, maxTimeMS: 5000 }).toArray()
  const out: Partial<Record<Universe, number>> = {}
  for (const row of rows) {
    for (const [universe, n] of Object.entries((row.byUniverse ?? {}) as Record<string, number>)) {
      if (typeof n === 'number' && n > 0) out[universe as Universe] = (out[universe as Universe] ?? 0) + n
    }
  }
  return out
}

export function drawable(stored: Partial<Record<Universe, number>>, setAside: Partial<Record<Universe, number>>): Partial<Record<Universe, number>> {
  const out: Partial<Record<Universe, number>> = {}
  for (const [universe, n] of Object.entries(stored) as Array<[Universe, number]>) {
    out[universe] = n < 0 ? n : Math.max(0, n - (setAside[universe] ?? 0))
  }
  return out
}

/** A recap younger than this is trusted for the night's plan; older, the pools are counted again. */
const RECAP_FRESH_MS = 36 * 3_600_000

/** The drawable size of every pool, for the night's plan: the last recap when fresh, a count otherwise. */
export async function drawableSizes(db: Db, now = new Date()): Promise<Partial<Record<Universe, number>>> {
  const latest = await db.collection(RECAP_COLLECTION).find({}, { sort: { at: -1 }, limit: 1, maxTimeMS: 3000 }).toArray().catch(() => [])
  const recap = latest[0] as unknown as UniverseRecap | undefined
  const setAside = await setAsideByUniverse(db).catch(() => ({}))
  if (recap && now.getTime() - new Date(recap.at).getTime() < RECAP_FRESH_MS) {
    // A recap written before sizes became drawable holds stored counts: take the sweeps off here.
    return recap.setAside ? recap.sizes : drawable(recap.sizes, setAside)
  }
  return drawable(await sizesByUniverse(db), setAside)
}

export function parisDay(date: Date): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

/** Videos that entered in the window, by universe: the provider index carries the date, so the read is bounded. */
export async function addedByUniverse(db: Db, since: Date, until: Date): Promise<Partial<Record<Universe, number>>> {
  const rows = await db.collection('items').aggregate<{ _id: string | null; n: number }>([
    { $match: { type: 'video', provider: { $in: ['youtube', 'dailymotion'] }, createdAt: { $gte: since, $lt: until } } },
    { $group: { _id: '$v3.universe', n: { $sum: 1 } } },
  ], { hint: 'video_provider_createdAt_lookup', maxTimeMS: 120_000, allowDiskUse: false }).toArray()
  const added: Partial<Record<Universe, number>> = {}
  for (const row of rows) added[(row._id ?? 'other') as Universe] = row.n
  return added
}

export async function sizesByUniverse(db: Db): Promise<Partial<Record<Universe, number>>> {
  const sizes: Partial<Record<Universe, number>> = {}
  for (const universe of UNIVERSES) {
    sizes[universe] = await db.collection('items').countDocuments({ 'v3.universe': universe, type: 'video' }, { hint: 'v3_universe_type_rand', maxTimeMS: 60_000 }).catch(() => -1)
  }
  return sizes
}

type RecapReaders = {
  added: typeof addedByUniverse
  sizes: typeof sizesByUniverse
  setAside?: typeof setAsideByUniverse
}

export async function computeUniverseRecap(db: Db, now = new Date(), read: RecapReaders = { added: addedByUniverse, sizes: sizesByUniverse }): Promise<UniverseRecap> {
  const [stored, added, setAside] = await Promise.all([
    read.sizes(db),
    read.added(db, new Date(now.getTime() - DAY_MS), now),
    (read.setAside ?? setAsideByUniverse)(db).catch(() => ({})),
  ])
  return { day: parisDay(now), at: now, sizes: drawable(stored, setAside), added, setAside }
}

export async function writeUniverseRecap(db: Db, recap: UniverseRecap): Promise<void> {
  await db.collection(RECAP_COLLECTION).replaceOne({ _id: recap.day } as Document, { ...recap, _id: recap.day }, { upsert: true })
}

const FRENCH: Partial<Record<Universe, string>> = {
  music: 'musique', sport: 'sport', gaming: 'gaming', 'humor-memes': 'humour', 'events-parties': 'fête', food: 'food', travel: 'découverte', craft: 'astuces / artisanat',
  'cinema-tv': 'cinéma-TV', 'nature-animals': 'animaux / nature', animation: 'animation', art: 'art', science: 'science', tech: 'tech', history: 'histoire', vehicles: 'véhicules', fashion: 'mode',
  'people-everyday': 'gens', 'news-society': 'actualité', other: 'non classé',
}

/** "musique +1 240 (43 568) · gaming +860 (16 629) · …": the pools that grew, the biggest first. */
export function recapNote(recap: UniverseRecap, top = 10): string {
  const parts = Object.entries(recap.added)
    .filter(([universe, n]) => (n ?? 0) > 0 && universe !== 'other')
    .sort((left, right) => (right[1] ?? 0) - (left[1] ?? 0))
    .slice(0, top)
    .map(([universe, n]) => `${FRENCH[universe as Universe] ?? universe} +${(n ?? 0).toLocaleString('fr-FR')} (${(recap.sizes[universe as Universe] ?? 0).toLocaleString('fr-FR')})`)
  const other = recap.added.other ?? 0
  return `${parts.join(' · ') || 'rien d_entré'}${other ? ` · non classé +${other.toLocaleString('fr-FR')}` : ''}`
}
