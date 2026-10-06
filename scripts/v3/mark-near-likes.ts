/**
 * The whole stock measured against the likes, once: every printed video that
 * resembles one of the owner's likes gets the pool's mark (`v3.lookalike
 * {like, score, found: 'base'}`, lib/v3/ai/pool.ts). No model here — the
 * fingerprints are read, not made — so it runs anywhere, in a few minutes,
 * reading the stock in four hundred slices of its random order with a pause
 * between them (the base is small: lib/discovery/mongo.ts).
 *
 *   node --env-file=.env.local --import tsx scripts/v3/mark-near-likes.ts --dry --slices=10   reads a sample, writes nothing
 *   node --env-file=.env.local --import tsx scripts/v3/mark-near-likes.ts --apply
 *
 * Afterwards the marks come with the videos: the look-alikes' line writes its
 * own, the fingerprints' pass marks each new entry it prints. Measured on
 * 6 October over 20,000 videos: one in a hundred reaches 0.75, which the
 * marks ask for (NEAR_POOL), about 2,000 to 4,000 over the stock once the
 * likes whose title says nothing stand aside.
 */

import { MongoClient, type AnyBulkWriteOperation, type Document } from 'mongodb'

import { FIELD, fromRow } from '@/lib/v3/ai/bits'
import { ensurePoolIndexes, modelLikes, poolMark, poolSize } from '@/lib/v3/ai/pool'

const SLICES = 400
const MAX_MINUTES = Number(process.env.RANDOM_MARK_MINUTES ?? 40)
const PAUSE_MS = 100
const QUERY_MS = 60_000

const flag = (name: string): boolean => process.argv.includes(`--${name}`)
const numeric = (name: string, fallback: number): number => { const raw = process.argv.find((argument) => argument.startsWith(`--${name}=`)); const value = Number(raw?.split('=')[1]); return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback }
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function main(): Promise<void> {
  const apply = flag('apply')
  const slices = Math.min(SLICES, numeric('slices', SLICES))
  if (!apply && !flag('dry')) { console.error('--apply ou --dry'); process.exit(2) }
  setTimeout(() => { console.error(`Arrêt : ${MAX_MINUTES} minutes écoulées.`); process.exit(1) }, MAX_MINUTES * 60_000).unref()
  const client = new MongoClient(process.env.MONGODB_URI as string, { serverSelectionTimeoutMS: 20_000, socketTimeoutMS: QUERY_MS * 3 })
  await client.connect()
  const db = client.db(process.env.MONGODB_DB || 'randomdb')
  const items = db.collection('items')
  const startedAt = Date.now()
  const likes = await modelLikes(db)
  console.log(`${likes.length} likes servent de modèle`)
  if (!likes.length) { await client.close(); return }
  if (apply) await ensurePoolIndexes(db)

  let read = 0, already = 0, marked = 0
  const perLike = new Map<string, number>()
  const sample: Array<{ title: string; like: string; score: number }> = []
  for (let slice = 0; slice < slices; slice += 1) {
    const range = { $gte: slice / SLICES, $lt: slice === SLICES - 1 ? 1.01 : (slice + 1) / SLICES }
    const rows = await items.find({ type: 'video', [FIELD]: { $exists: true }, rand: range } as Document, { projection: { [FIELD]: 1, title: 1, 'v3.lookalike': 1, isSuppressed: 1 }, hint: 'vec_type_rand', maxTimeMS: QUERY_MS, batchSize: 1000 }).toArray()
    const writes: AnyBulkWriteOperation<Document>[] = []
    for (const row of rows) {
      read += 1
      if (row.isSuppressed === true) continue
      if ((row.v3 as { lookalike?: unknown } | undefined)?.lookalike) { already += 1; continue }
      const bits = fromRow(row[FIELD])
      if (!bits) continue
      const mark = poolMark(bits, String(row.title ?? ''), likes)
      if (!mark) continue
      marked += 1
      perLike.set(mark.like, (perLike.get(mark.like) ?? 0) + 1)
      if (sample.length < 400) sample.push({ title: String(row.title ?? ''), like: mark.like, score: mark.score })
      writes.push({ updateOne: { filter: { _id: row._id }, update: { $set: { 'v3.lookalike': { ...mark, found: 'base' } } } } })
    }
    if (apply && writes.length) await items.bulkWrite(writes, { ordered: false })
    if (slice % 40 === 39) console.log(`  ${read.toLocaleString('fr-FR')} lues · ${marked.toLocaleString('fr-FR')} marquées · ${Math.round((Date.now() - startedAt) / 1000)} s`)
    await wait(PAUSE_MS)
  }
  const titles = new Map(likes.map((like) => [like.id, like.title]))
  const top = [...perLike].sort((left, right) => right[1] - left[1]).slice(0, 12)
  console.log(`\nPar like, les plus fournis :`)
  for (const [like, count] of top) console.log(`  ${String(count).padStart(5)}  ${(titles.get(like) ?? like).slice(0, 60)}`)
  console.log(`\nÉchantillon :`)
  for (const entry of sample.sort(() => Math.random() - 0.5).slice(0, 20)) console.log(`  ${entry.score.toFixed(3)}  ${entry.title.slice(0, 52).padEnd(52)}  ←  ${(titles.get(entry.like) ?? '').slice(0, 40)}`)
  const pool = apply ? await poolSize(db, QUERY_MS).catch(() => -1) : -1
  console.log(JSON.stringify({ mark: apply ? 'ok' : 'dry', slices, read, already, marked, likes: likes.length, pool, durationMs: Date.now() - startedAt }))
  await client.close()
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1) })
