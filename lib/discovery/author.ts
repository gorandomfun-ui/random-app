/**
 * An author's other videos, as the site holds them (lib/random/author.ts): how many there are, up to a series, and a
 * series of them at random. Bilibili's live in their own collection (lib/v3/bilibili.ts), the rest in `items`, found
 * through the channel key's index.
 */

import { ObjectId, type Db, type Document, type Filter } from 'mongodb'

import { AUTHOR_SERIES_SIZE, knownChannelKey } from '../random/author'
import { channelKey as channelKeyOf } from '../v3/tagging/classify'
import { SERVABLE } from '../v3/cool/servable'
import { BILIBILI } from '../v3/bilibili'

const COUNT_BUDGET_MS = 300
const READ_BUDGET_MS = 3000
/** An author's rows read to draw a series from: the authors line holds forty at most from one (lib/v3/authors/pick.ts). */
const SERIES_WINDOW = 120

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/**
 * The key the site knows a video's author by (lib/random/author.ts): the one its tagging gave it, else its provider's and
 * channel's (never a Dailymotion category); a Bilibili video keeps its key as its channel.
 */
export function videoChannelKey(doc: { provider?: unknown; channelId?: unknown; v3?: unknown }): string | undefined {
  const tagged = text((doc.v3 as { channelKey?: unknown } | undefined)?.channelKey)
  if (tagged) return tagged
  const channel = text(doc.channelId)
  if (channel.startsWith('bilibili:')) return channel
  return channelKeyOf({ provider: text(doc.provider), channelId: channel })
}

const isBilibili = (key: string) => key.startsWith('bilibili:')
const ids = (values: readonly string[]) => values.filter((value) => ObjectId.isValid(value)).map((value) => new ObjectId(value))

/** Where an author's videos are, and how they are found: Bilibili's keep their key as their channel. */
function whereAuthor(channelKey: string, exclude: readonly string[]): { collection: string; filter: Filter<Document>; hint?: string } {
  const notThese = exclude.length ? { _id: { $nin: ids(exclude) } } : {}
  if (isBilibili(channelKey)) return { collection: BILIBILI, filter: { channelId: channelKey, url: { $regex: '#aid=\\d+&cid=\\d+' }, ...notThese } }
  return { collection: 'items', filter: { 'v3.channelKey': channelKey, type: 'video', ...SERVABLE, ...notThese }, hint: 'v3_channel_key' }
}

/** How many other videos of this author the site holds, counted up to a series: what the légende needs to offer them. */
export async function authorMore(db: Db, channelKey: string, excludeId: string): Promise<number> {
  if (!knownChannelKey(channelKey)) return 0
  const where = whereAuthor(channelKey, excludeId ? [excludeId] : [])
  return db.collection(where.collection).countDocuments(where.filter, { limit: AUTHOR_SERIES_SIZE, maxTimeMS: COUNT_BUDGET_MS, ...(where.hint ? { hint: where.hint } : {}) })
}

/** A series of this author's videos at random, never the ones excluded (the video on screen, those just seen). */
export async function authorSeries(db: Db, channelKey: string, exclude: readonly string[], random: () => number = Math.random): Promise<Document[]> {
  if (!knownChannelKey(channelKey)) return []
  const where = whereAuthor(channelKey, exclude)
  const rows = await db.collection(where.collection).find(where.filter, { limit: SERIES_WINDOW, maxTimeMS: READ_BUDGET_MS, ...(where.hint ? { hint: where.hint } : {}) }).toArray()
  for (let index = rows.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1))
    ;[rows[index], rows[other]] = [rows[other], rows[index]]
  }
  return rows.slice(0, AUTHOR_SERIES_SIZE)
}
