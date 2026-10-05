/**
 * The fingerprints, written on the videos that have none: today's entries
 * first, then the old stock, a slice a run, from the newest back.
 *
 *   node --import tsx scripts/v3/vec-direct.ts                 up to RANDOM_VEC_MAX videos (10,000) within RANDOM_VEC_MINUTES (12)
 *   node --import tsx scripts/v3/vec-direct.ts --dry           reads and fingerprints, writes nothing
 *   RANDOM_VEC_CURSOR=vec-mac-gap RANDOM_VEC_BEFORE=<id> RANDOM_VEC_AFTER=2026-09-25   a helper machine fills one stretch, then stops
 *
 * Runs on the ingestion server, alone, between the drift's and the dig's
 * runs (lib/v3/ai/fingerprint.ts: 700 MB of memory). Its shared core gives
 * two or three videos a second (3 October), enough for the day's intake and
 * little more; a faster machine can help with the old stock, at a gentle
 * pace for the small database (RANDOM_VEC_CURSOR, RANDOM_VEC_BEFORE,
 * RANDOM_VEC_PACE_MS). The backfill keeps its place in `dig_meta_v4`
 * ({_id: cursor}): the oldest id it has reached, so a run that stops picks
 * up where it left.
 */

import { MongoClient, ObjectId, type Document } from 'mongodb'

import { disposeModel, FIELD, fingerprints, textOf, toBinary } from '@/lib/v3/ai/fingerprint'
import { loadLikePool } from '@/lib/v3/cool/likePool'

const MAX_MINUTES = Number(process.env.RANDOM_VEC_MINUTES ?? 12)
const MAX_VIDEOS = Number(process.env.RANDOM_VEC_MAX ?? 10_000)
const BATCH = 200
const META = 'dig_meta_v4'
/** The backfill's place is its own per machine (`RANDOM_VEC_CURSOR`): a second machine walks another stretch of the stock without treading on the server's. */
const CURSOR = process.env.RANDOM_VEC_CURSOR ?? 'vec'
/** Where a fresh backfill starts (`RANDOM_VEC_BEFORE`, an id or an ISO day): the server starts at today, a helper machine can start further back. */
const BEFORE = process.env.RANDOM_VEC_BEFORE
/** Where it stops (`RANDOM_VEC_AFTER`, an id or an ISO day): a helper machine sent to fill one stretch does not walk on through what is already done. */
const AFTER = process.env.RANDOM_VEC_AFTER
const idOf = (value: string): ObjectId => (ObjectId.isValid(value) && value.length === 24 ? new ObjectId(value) : ObjectId.createFromTime(Math.floor(new Date(value).getTime() / 1000)))
/** A pause between batches (`RANDOM_VEC_PACE_MS`): a fast machine must not flood the small database with writes. */
const PACE_MS = Number(process.env.RANDOM_VEC_PACE_MS ?? 0)
/** The last batch may run past the soft deadline; the hard stop leaves it the time. */
const HARD_STOP_MINUTES = 3
const dry = process.argv.includes('--dry')
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function main(): Promise<void> {
  const deadline = Date.now() + MAX_MINUTES * 60_000
  setTimeout(() => { console.error(`Fingerprints stopped at the ${MAX_MINUTES}-minute deadline.`); process.exit(1) }, (MAX_MINUTES + HARD_STOP_MINUTES) * 60_000).unref()
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
    if (PACE_MS > 0) await wait(PACE_MS)
  }

  // The liked videos first, whatever their age: the taste card needs their fingerprints before anything else (lib/discovery/wheel.ts, likedCentres).
  const pool = await loadLikePool(db).catch(() => ({ zones: [], likeIds: [] as string[] }))
  const likeIds = pool.likeIds.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id))
  const likesWithout = likeIds.length ? await items.find({ _id: { $in: likeIds }, type: 'video', [FIELD]: { $exists: false } } as Document, { projection: { title: 1, description: 1 } }).toArray() : []
  for (let start = 0; start < likesWithout.length; start += BATCH) await write(likesWithout.slice(start, start + BATCH))
  const likesDone = read

  // Today's and yesterday's entries first, by id, those without a fingerprint: what came in after the evening's run (the late dig, the drift
  // at 23:10) is caught by the night's, instead of falling behind the old stock's place for good (5 October: some thousands were).
  const dayStart = new Date(new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) + 'T00:00:00+02:00')
  const yesterdayFrom = ObjectId.createFromTime(Math.floor(dayStart.getTime() / 1000) - 86_400)
  const today = items.find({ type: 'video', _id: { $gte: yesterdayFrom }, [FIELD]: { $exists: false } } as Document, { projection: { title: 1, description: 1 }, hint: 'idx_image_scan_by_type_id', batchSize: BATCH })
  let batch: Document[] = []
  for await (const row of today) {
    batch.push(row)
    if (batch.length >= BATCH) { await write(batch); batch = [] }
    if (Date.now() > deadline || read >= MAX_VIDEOS) break
  }
  await write(batch); batch = []
  const todayDone = read

  // Then the old stock, from where the last run stopped, back towards the oldest id.
  const place = await meta.findOne({ _id: CURSOR } as Document)
  const start = BEFORE ? idOf(BEFORE) : yesterdayFrom
  const stop = AFTER ? idOf(AFTER) : null
  let before: ObjectId = place?.before instanceof ObjectId ? place.before : start
  while (Date.now() < deadline && read < MAX_VIDEOS) {
    const rows = await items.find({ type: 'video', _id: stop ? { $lt: before, $gte: stop } : { $lt: before } } as Document, { projection: { title: 1, description: 1, [FIELD]: 1 }, sort: { _id: -1 }, limit: BATCH, hint: 'idx_image_scan_by_type_id' }).toArray()
    if (!rows.length) break
    before = rows[rows.length - 1]._id as ObjectId
    await write(rows.filter((row) => row[FIELD] === undefined))
    if (!dry) await meta.updateOne({ _id: CURSOR } as Document, { $set: { before, at: new Date() } }, { upsert: true })
  }

  console.log(JSON.stringify({ vec: 'ok', dry, likes: likesDone, today: todayDone - likesDone, read, written, before: String(before), durationMs: Date.now() - startedAt, rss: Math.round(process.memoryUsage().rss / 1e6) }))
  await client.close()
  await disposeModel()
  setTimeout(() => process.exit(0), 200).unref()
}

main().catch((error) => { console.error(error instanceof Error ? error.message : 'fingerprints failed'); process.exit(1) })
