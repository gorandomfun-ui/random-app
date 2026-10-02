/**
 * The fingerprints, written on the videos that have none: today's entries
 * first, then the old stock, a slice a run, from the newest back.
 *
 *   node --import tsx scripts/v3/vec-direct.ts                 up to RANDOM_VEC_MAX videos (20,000) within RANDOM_VEC_MINUTES (20)
 *   node --import tsx scripts/v3/vec-direct.ts --dry           reads and fingerprints, writes nothing
 *
 * Runs on the ingestion server after the dig's runs (lib/v3/ai/fingerprint.ts:
 * 410 MB of memory, 45 videos a second). The backfill keeps its place in
 * `dig_meta_v4` ({_id: 'vec'}): the oldest id it has reached, so a run that
 * stops picks up where it left.
 */

import { MongoClient, ObjectId, type Document } from 'mongodb'

import { disposeModel, FIELD, fingerprints, textOf, toBinary } from '@/lib/v3/ai/fingerprint'
import { loadLikePool } from '@/lib/v3/cool/likePool'

const MAX_MINUTES = Number(process.env.RANDOM_VEC_MINUTES ?? 20)
const MAX_VIDEOS = Number(process.env.RANDOM_VEC_MAX ?? 10_000)
const BATCH = 200
const META = 'dig_meta_v4'
const dry = process.argv.includes('--dry')

async function main(): Promise<void> {
  const deadline = Date.now() + MAX_MINUTES * 60_000
  setTimeout(() => { console.error(`Fingerprints stopped at the ${MAX_MINUTES}-minute deadline.`); process.exit(1) }, (MAX_MINUTES + 1) * 60_000).unref()
  const client = new MongoClient(process.env.MONGODB_URI as string, { serverSelectionTimeoutMS: 20_000 })
  await client.connect()
  const db = client.db(process.env.MONGODB_DB || 'randomdb')
  const items = db.collection('items')
  const meta = db.collection(META)
  const startedAt = Date.now()
  let written = 0, read = 0

  const write = async (rows: Document[]): Promise<void> => {
    if (!rows.length) return
    const prints = await fingerprints(rows.map((row) => textOf(row)))
    read += rows.length
    if (dry) return
    const result = await items.bulkWrite(rows.map((row, index) => ({ updateOne: { filter: { _id: row._id }, update: { $set: { [FIELD]: toBinary(prints[index]) } } } })), { ordered: false })
    written += result.modifiedCount
  }

  // The liked videos first, whatever their age: the taste card needs their fingerprints before anything else (lib/discovery/wheel.ts, likedCentres).
  const pool = await loadLikePool(db).catch(() => ({ zones: [], likeIds: [] as string[] }))
  const likeIds = pool.likeIds.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id))
  const likesWithout = likeIds.length ? await items.find({ _id: { $in: likeIds }, type: 'video', [FIELD]: { $exists: false } } as Document, { projection: { title: 1, description: 1 } }).toArray() : []
  for (let start = 0; start < likesWithout.length; start += BATCH) await write(likesWithout.slice(start, start + BATCH))
  const likesDone = read

  // Today's entries first, by id, those without a fingerprint.
  const dayStart = new Date(new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) + 'T00:00:00+02:00')
  const todayFrom = ObjectId.createFromTime(Math.floor(dayStart.getTime() / 1000))
  const today = items.find({ type: 'video', _id: { $gte: todayFrom }, [FIELD]: { $exists: false } } as Document, { projection: { title: 1, description: 1 }, hint: 'idx_image_scan_by_type_id', batchSize: BATCH })
  let batch: Document[] = []
  for await (const row of today) {
    batch.push(row)
    if (batch.length >= BATCH) { await write(batch); batch = [] }
    if (Date.now() > deadline || read >= MAX_VIDEOS) break
  }
  await write(batch); batch = []
  const todayDone = read

  // Then the old stock, from where the last run stopped, back towards the oldest id.
  const place = await meta.findOne({ _id: 'vec' } as Document)
  let before: ObjectId = place?.before instanceof ObjectId ? place.before : todayFrom
  while (Date.now() < deadline && read < MAX_VIDEOS) {
    const rows = await items.find({ type: 'video', _id: { $lt: before } } as Document, { projection: { title: 1, description: 1, [FIELD]: 1 }, sort: { _id: -1 }, limit: BATCH, hint: 'idx_image_scan_by_type_id' }).toArray()
    if (!rows.length) break
    before = rows[rows.length - 1]._id as ObjectId
    await write(rows.filter((row) => row[FIELD] === undefined))
    if (!dry) await meta.updateOne({ _id: 'vec' } as Document, { $set: { before, at: new Date() } }, { upsert: true })
  }

  console.log(JSON.stringify({ vec: 'ok', dry, likes: likesDone, today: todayDone - likesDone, read, written, before: String(before), durationMs: Date.now() - startedAt, rss: Math.round(process.memoryUsage().rss / 1e6) }))
  await client.close()
  await disposeModel()
  setTimeout(() => process.exit(0), 200).unref()
}

main().catch((error) => { console.error(error instanceof Error ? error.message : 'fingerprints failed'); process.exit(1) })
