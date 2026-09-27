/**
 * The ads already stored: counted, shown, and — only when asked — set aside.
 *
 *   node --import tsx scripts/v3/junk-sweep.ts            read only: counts, examples, a report
 *   node --import tsx scripts/v3/junk-sweep.ts --apply    sets them aside (suppressedReason 'junk')
 *   node --import tsx scripts/v3/junk-sweep.ts --undo     gives them back
 *
 * Every scam goes; of the product tops one in twenty stays, the owner wants a
 * few for the fun of it. Reads every YouTube and Dailymotion video through the
 * provider-and-date index, titles only, pausing as it goes. The sweep is
 * recorded with the mini-series ones (kind 'junk') so the pools table counts
 * only what the draw can serve.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import { MongoClient, type Document, type ObjectId } from 'mongodb'

import { junkKind, type JunkKind } from '@/lib/ingest/junk'
import { SWEEPS_COLLECTION } from '@/lib/v3/pools/recap'
import { count, table } from './reportFormat'

const REPORT = 'docs/reports/junk-sweep.md'
const KEEP_TOP_ONE_IN = 20
const PAUSE_EVERY = 10_000
const PAUSE_MS = 400
const WRITE_BATCH = 500

const apply = process.argv.includes('--apply')
const undo = process.argv.includes('--undo')
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type Row = { _id: ObjectId; title: string; universe: string; kind: JunkKind }

const shuffle = <T,>(values: T[]): T[] => [...values].sort(() => Math.random() - 0.5)

async function main(): Promise<void> {
  const client = new MongoClient(process.env.MONGODB_URI as string, { serverSelectionTimeoutMS: 20000 })
  await client.connect()
  try {
    const db = client.db(process.env.MONGODB_DB || 'randomdb')
    if (undo) {
      let restored = 0
      for (const sweep of await db.collection(SWEEPS_COLLECTION).find({ kind: 'junk', undoneAt: { $exists: false } }).toArray()) {
        const ids = (sweep.ids ?? []) as ObjectId[]
        for (let start = 0; start < ids.length; start += WRITE_BATCH) {
          const result = await db.collection('items').updateMany({ _id: { $in: ids.slice(start, start + WRITE_BATCH) }, suppressedReason: 'junk' }, { $unset: { isSuppressed: '', suppressedReason: '', suppressedAt: '', suppressedDetail: '' } })
          restored += result.modifiedCount
          await wait(PAUSE_MS)
        }
        await db.collection(SWEEPS_COLLECTION).updateOne({ _id: sweep._id }, { $set: { undoneAt: new Date() } })
      }
      console.log(`rendues : ${restored}`)
      return
    }

    const found: Row[] = []
    let read = 0
    for (const provider of ['youtube', 'dailymotion']) {
      const cursor = db.collection('items').find(
        { type: 'video', provider, createdAt: { $gte: new Date('2000-01-01') } },
        { projection: { title: 1, 'v3.universe': 1, isSuppressed: 1 }, hint: 'video_provider_createdAt_lookup', batchSize: 2000 },
      )
      for await (const doc of cursor) {
        read += 1
        if (read % PAUSE_EVERY === 0) { process.stdout.write(`\r${count(read)} lues`); await wait(PAUSE_MS) }
        if (doc.isSuppressed === true) continue
        const kind = junkKind(String(doc.title ?? ''))
        if (kind) found.push({ _id: doc._id, title: String(doc.title ?? ''), universe: String(doc.v3?.universe ?? 'other'), kind })
      }
    }
    process.stdout.write(`\r${count(read)} lues\n`)

    const scams = found.filter((row) => row.kind === 'scam')
    const tops = found.filter((row) => row.kind === 'product-top')
    const keptTops = tops.filter((_, index) => index % KEEP_TOP_ONE_IN === 0)
    const setAside = [...scams, ...tops.filter((_, index) => index % KEEP_TOP_ONE_IN !== 0)]
    const byUniverse: Record<string, number> = {}
    for (const row of setAside) byUniverse[row.universe] = (byUniverse[row.universe] ?? 0) + 1

    const lines = [
      `# Pubs dans la base — ${apply ? 'mise de côté' : 'comptage seul'}`,
      '',
      `Vidéos YouTube et Dailymotion lues : ${count(read)}.`,
      `Arnaques : **${count(scams.length)}** (toutes mises de côté). Tops produits : **${count(tops.length)}**, dont ${count(keptTops.length)} gardés (un sur ${KEEP_TOP_ONE_IN}).`,
      `À mettre de côté en tout : **${count(setAside.length)}**.`,
      '',
      '## Par univers',
      table(['Univers', 'Vidéos'], Object.entries(byUniverse).sort((left, right) => right[1] - left[1]).map(([universe, n]) => [universe, count(n)])),
      '',
      '## 30 arnaques, au hasard',
      ...shuffle(scams).slice(0, 30).map((row) => `- ${row.title}`),
      '',
      '## 30 tops produits, au hasard',
      ...shuffle(tops).slice(0, 30).map((row) => `- ${row.title}`),
    ]
    mkdirSync(dirname(REPORT), { recursive: true })
    writeFileSync(REPORT, `${lines.join('\n')}\n`)
    console.log(`${count(scams.length)} arnaques · ${count(tops.length)} tops (${count(keptTops.length)} gardés) · ${count(setAside.length)} à mettre de côté · rapport ${REPORT}`)
    if (!apply) return

    const now = new Date()
    const sweepId = (await db.collection(SWEEPS_COLLECTION).insertOne({ at: now, kind: 'junk', ids: [] })).insertedId
    let suppressed = 0
    for (let start = 0; start < setAside.length; start += WRITE_BATCH) {
      const slice = setAside.slice(start, start + WRITE_BATCH)
      const result = await db.collection('items').bulkWrite(slice.map((row) => ({
        updateOne: { filter: { _id: row._id, isSuppressed: { $ne: true } } as Document, update: { $set: { isSuppressed: true, suppressedReason: 'junk', suppressedAt: now, suppressedDetail: row.kind } } },
      })), { ordered: false })
      suppressed += result.modifiedCount
      await db.collection(SWEEPS_COLLECTION).updateOne({ _id: sweepId }, { $push: { ids: { $each: slice.map((row) => row._id) } } } as Document)
      await wait(PAUSE_MS)
    }
    await db.collection(SWEEPS_COLLECTION).updateOne({ _id: sweepId }, { $set: { suppressed, byUniverse, doneAt: new Date() } })
    console.log(`fait : ${count(suppressed)} mises de côté`)
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
