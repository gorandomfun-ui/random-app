/**
 * The YouTube drift: following people, not words.
 *
 * YouTube has no free "related" like Dailymotion's, and reading its pages
 * with a robot is forbidden; what it gives cheaply is a channel's uploads,
 * fifty videos for one unit. So the drift there follows the small channels
 * the day's finds came from — a person, not a house: `SMALL_CHANNEL`
 * videos at most, the size read for fifty channels at a unit — and queues
 * them for the dig's channel pass, which reads two hundred of their videos
 * through the door without a name to match (a channel subject). A hundred
 * channels a day at seven units each: a tenth of the day's units, and the
 * searches' cap does not touch it.
 */

import { ObjectId, type Db, type Document } from 'mongodb'

import { enqueue, QUEUE, type NewSubject, type QueuedSubject } from './queue'
import { channelCounts } from './youtube'

/** A channel with this many videos at most is a person. */
export const SMALL_CHANNEL = Number(process.env.RANDOM_CHANNELS_SMALL ?? 2000)
/** Channels queued in one run. */
export const CHANNELS_PER_RUN = Number(process.env.RANDOM_CHANNELS_PER_RUN ?? 40)
const CANDIDATES = 200

/** The Paris day's first id. */
function dayStart(now = new Date()): ObjectId {
  const day = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  return ObjectId.createFromTime(Math.floor(new Date(`${day}T00:00:00+02:00`).getTime() / 1000))
}

/**
 * The channels of today's YouTube finds, the small ones, queued as channel
 * subjects the dig reads; those already queued, under any base, are left.
 * Returns how many were queued.
 */
export async function queueMetChannels(db: Db, key: string, request: typeof fetch = fetch, log: (text: string) => void = () => undefined, now = new Date()): Promise<number> {
  if (!key) return 0
  const met = await db.collection('items').aggregate<{ _id: string; title: string; n: number }>([
    { $match: { type: 'video', provider: 'youtube', _id: { $gte: dayStart(now) }, channelId: { $exists: true } } },
    { $group: { _id: '$channelId', title: { $first: '$channelTitle' }, n: { $sum: 1 } } },
    { $sort: { n: -1 } },
    { $limit: CANDIDATES },
  ], { hint: 'idx_image_scan_by_type_id', maxTimeMS: 60_000 }).toArray()
  if (!met.length) return 0
  const known = new Set((await db.collection<QueuedSubject>(QUEUE).find({ _id: { $in: met.map((channel) => `channel:youtube:${channel._id}`) } }, { projection: { _id: 1 }, maxTimeMS: 8000 }).toArray()).map((row) => row._id))
  const fresh = met.filter((channel) => /^UC[\w-]{20,}$/.test(channel._id) && !known.has(`channel:youtube:${channel._id}`))
  if (!fresh.length) return 0
  const sizes = await channelCounts(key, fresh.map((channel) => channel._id), request)
  const small = fresh.filter((channel) => { const size = sizes.get(channel._id); return size !== undefined && size > 0 && size <= SMALL_CHANNEL }).slice(0, CHANNELS_PER_RUN)
  const subjects: NewSubject[] = small.map((channel) => ({
    _id: `channel:youtube:${channel._id}`, label: String(channel.title ?? channel._id), aliases: [], kind: 'channel', base: 'snowball', fame: 'small', priority: 6,
    source: { from: 'met', videos: sizes.get(channel._id), hits: channel.n } as Document,
  }))
  const result = await enqueue(db, subjects)
  if (result.inserted) log(`chaînes rencontrées : ${result.inserted} petite(s) chaîne(s) YouTube à lire (${small.slice(0, 5).map((channel) => channel.title).join(', ')}…)`)
  return result.inserted
}
