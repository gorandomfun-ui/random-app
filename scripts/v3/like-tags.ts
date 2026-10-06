/**
 * The tags the providers put on the owner's liked videos, written on their
 * rows (`apiTags`) when the rows have none: the look-alikes' line searches
 * with them (lib/v3/ingest/lines/lookalike.ts, likeQueries). Dailymotion
 * answers a hundred ids at a time for free; YouTube fifty for one unit.
 *
 *   node --env-file=.env.local --import tsx scripts/v3/like-tags.ts --apply
 *   node --env-file=.env.local --import tsx scripts/v3/like-tags.ts          reports, writes nothing
 */

import { MongoClient, ObjectId, type AnyBulkWriteOperation, type Document } from 'mongodb'

import { loadLikePool } from '@/lib/v3/cool/likePool'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function dailymotionTags(ids: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  for (let start = 0; start < ids.length; start += 100) {
    const slice = ids.slice(start, start + 100)
    const response = await fetch(`https://api.dailymotion.com/videos?${new URLSearchParams({ ids: slice.join(','), fields: 'id,tags', limit: '100' })}`)
    if (!response.ok) { console.error(`Dailymotion HTTP ${response.status}`); continue }
    const payload = (await response.json()) as { list?: Array<{ id: string; tags?: string[] }> }
    for (const row of payload.list ?? []) out.set(row.id, (row.tags ?? []).map(String))
    await wait(250)
  }
  return out
}

async function youtubeTags(ids: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  const key = process.env.YOUTUBE_API_KEY
  if (!key) { if (ids.length) console.error('YOUTUBE_API_KEY absente : les likes YouTube gardent leurs tags vides'); return out }
  for (let start = 0; start < ids.length; start += 50) {
    const slice = ids.slice(start, start + 50)
    const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?${new URLSearchParams({ part: 'snippet', id: slice.join(','), key, fields: 'items(id,snippet/tags)' })}`)
    if (!response.ok) { console.error(`YouTube HTTP ${response.status}`); continue }
    const payload = (await response.json()) as { items?: Array<{ id: string; snippet?: { tags?: string[] } }> }
    for (const row of payload.items ?? []) out.set(row.id, (row.snippet?.tags ?? []).map(String))
    await wait(100)
  }
  return out
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply')
  const client = new MongoClient(process.env.MONGODB_URI as string, { serverSelectionTimeoutMS: 20_000 })
  await client.connect()
  const db = client.db(process.env.MONGODB_DB || 'randomdb')
  const items = db.collection('items')
  const pool = await loadLikePool(db)
  const ids = pool.likeIds.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id))
  const likes = await items.find({ _id: { $in: ids }, type: 'video' } as Document, { projection: { provider: 1, videoId: 1, apiTags: 1, title: 1 } }).toArray()
  const without = likes.filter((row) => !(Array.isArray(row.apiTags) && row.apiTags.length) && typeof row.videoId === 'string')
  const bare = (row: Document) => String(row.videoId).replace(/^(dailymotion|youtube):/, '')
  const dailymotion = await dailymotionTags(without.filter((row) => row.provider === 'dailymotion').map(bare))
  const youtube = await youtubeTags(without.filter((row) => row.provider === 'youtube').map(bare))
  const writes: AnyBulkWriteOperation<Document>[] = []
  let found = 0
  for (const row of without) {
    const tags = (row.provider === 'dailymotion' ? dailymotion : youtube).get(bare(row))
    if (!tags?.length) continue
    found += 1
    console.log(`  ${String(row.title ?? '').slice(0, 50).padEnd(50)}  ${tags.slice(0, 8).join(', ').slice(0, 80)}`)
    writes.push({ updateOne: { filter: { _id: row._id }, update: { $set: { apiTags: tags.slice(0, 30) } } } })
  }
  if (apply && writes.length) await items.bulkWrite(writes, { ordered: false })
  console.log(JSON.stringify({ likeTags: apply ? 'ok' : 'dry', likes: likes.length, without: without.length, found, written: apply ? writes.length : 0 }))
  await client.close()
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1) })
