/**
 * The stored websites that are not sites worth a draw (lib/v3/web/quality.ts):
 * counted, shown, and — only when asked — set aside.
 *
 *   node --import tsx scripts/v3/web-sweep.ts            read only: counts by reason, examples of both sides
 *   node --import tsx scripts/v3/web-sweep.ts --apply    sets them aside (suppressedReason 'web-dull')
 *   node --import tsx scripts/v3/web-sweep.ts --undo     gives them back
 *   node --import tsx scripts/v3/web-sweep.ts --rescue [--apply]
 *       the ones set aside that the rule no longer calls dull (the curious
 *       pages, 28 September): counted and shown, given back with --apply
 *
 * Decided with the owner on 27 September, reversing the earlier choice to keep
 * the stored product pages: "trouve un moyen de trier aussi les sites".
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import { MongoClient, type Document, type ObjectId } from 'mongodb'

import { boringWebReason, type BoringReason } from '@/lib/v3/web/quality'
import { count, percent, table } from './reportFormat'

const SWEEPS = 'web_sweeps_v1'
const REPORT = 'docs/reports/web-sweep.md'
const WRITE_BATCH = 500
const PAUSE_MS = 300
const apply = process.argv.includes('--apply')
const undo = process.argv.includes('--undo')
const rescue = process.argv.includes('--rescue')
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const shuffle = <T,>(values: T[]): T[] => [...values].sort(() => Math.random() - 0.5)

async function main(): Promise<void> {
  const client = new MongoClient(process.env.MONGODB_URI as string, { serverSelectionTimeoutMS: 20000 })
  await client.connect()
  try {
    const db = client.db(process.env.MONGODB_DB || 'randomdb')
    if (undo) {
      let restored = 0
      for (const sweep of await db.collection(SWEEPS).find({ undoneAt: { $exists: false } }).toArray()) {
        const ids = (sweep.ids ?? []) as ObjectId[]
        for (let start = 0; start < ids.length; start += WRITE_BATCH) {
          restored += (await db.collection('items').updateMany({ _id: { $in: ids.slice(start, start + WRITE_BATCH) }, suppressedReason: 'web-dull' }, { $unset: { isSuppressed: '', suppressedReason: '', suppressedAt: '', suppressedDetail: '' } })).modifiedCount
        }
        await db.collection(SWEEPS).updateOne({ _id: sweep._id }, { $set: { undoneAt: new Date() } })
      }
      console.log(`rendus : ${restored}`)
      return
    }
    if (rescue) {
      const back: Array<{ _id: ObjectId; url: string; title: string; was: string }> = []
      for await (const doc of db.collection('items').find({ type: 'web', suppressedReason: 'web-dull' }, { projection: { url: 1, title: 1, provider: 1, suppressedDetail: 1 }, batchSize: 2000 })) {
        if (!boringWebReason(String(doc.url ?? ''), String(doc.title ?? ''), String(doc.provider ?? ''))) {
          back.push({ _id: doc._id, url: String(doc.url ?? ''), title: String(doc.title ?? ''), was: String(doc.suppressedDetail ?? '') })
        }
      }
      const byWas = new Map<string, number>()
      for (const row of back) byWas.set(row.was, (byWas.get(row.was) ?? 0) + 1)
      console.log(`à rendre : ${count(back.length)} · ${[...byWas].map(([was, n]) => `${was} ${n}`).join(' · ')}`)
      for (const row of shuffle(back).slice(0, 20)) console.log(`- ${row.was} · ${row.url.slice(0, 70)} · ${row.title.slice(0, 60)}`)
      if (!apply) return
      let restored = 0
      for (let start = 0; start < back.length; start += WRITE_BATCH) {
        restored += (await db.collection('items').updateMany({ _id: { $in: back.slice(start, start + WRITE_BATCH).map((row) => row._id) }, suppressedReason: 'web-dull' }, { $unset: { isSuppressed: '', suppressedReason: '', suppressedAt: '', suppressedDetail: '' } })).modifiedCount
        await wait(PAUSE_MS)
      }
      await db.collection(SWEEPS).insertOne({ at: new Date(), kind: 'rescue', restored: back.map((row) => row._id) })
      console.log(`rendus : ${count(restored)}`)
      return
    }
    const rows: Array<{ _id: ObjectId; url: string; title: string; reason: BoringReason | null; provider: string }> = []
    for await (const doc of db.collection('items').find({ type: 'web', isSuppressed: { $ne: true } }, { projection: { url: 1, title: 1, provider: 1 }, batchSize: 2000 })) {
      rows.push({ _id: doc._id, url: String(doc.url ?? ''), title: String(doc.title ?? ''), provider: String(doc.provider ?? ''), reason: boringWebReason(String(doc.url ?? ''), String(doc.title ?? ''), String(doc.provider ?? '')) })
    }
    const dull = rows.filter((row) => row.reason)
    const kept = rows.filter((row) => !row.reason)
    const byReason = new Map<string, number>()
    for (const row of dull) byReason.set(String(row.reason), (byReason.get(String(row.reason)) ?? 0) + 1)
    const lines = [
      `# Sites en base — ${apply ? 'mise de côté' : 'comptage seul'}`,
      '',
      `Sites lus : ${count(rows.length)}. Sans intérêt : **${count(dull.length)}** (${percent(dull.length, rows.length)}). Gardés : ${count(kept.length)}.`,
      '',
      table(['Motif', 'Sites'], [...byReason].sort((left, right) => right[1] - left[1]).map(([reason, n]) => [reason, count(n)])),
      '',
      table(['Source', 'Sites', 'Sans intérêt'], [...new Set(rows.map((row) => row.provider))].map((provider) => {
        const own = rows.filter((row) => row.provider === provider)
        return [provider || '?', count(own.length), percent(own.filter((row) => row.reason).length, own.length)]
      }).sort((left, right) => String(right[1]).localeCompare(String(left[1]), undefined, { numeric: true }))),
      '',
      ...[...byReason.keys()].flatMap((reason) => [`## ${reason}, 12 au hasard`, ...shuffle(dull.filter((row) => row.reason === reason)).slice(0, 12).map((row) => `- ${row.url.slice(0, 90)} · ${row.title.slice(0, 60)}`), '']),
      '## 40 qui partiraient, au hasard',
      ...shuffle(dull).slice(0, 40).map((row) => `- ${row.reason} · ${row.url.slice(0, 90)} · ${row.title.slice(0, 60)}`),
      '',
      '## 40 qui restent, au hasard',
      ...shuffle(kept).slice(0, 40).map((row) => `- ${row.url.slice(0, 90)} · ${row.title.slice(0, 60)}`),
    ]
    mkdirSync(dirname(REPORT), { recursive: true })
    writeFileSync(REPORT, `${lines.join('\n')}\n`)
    console.log(`${count(rows.length)} sites · ${count(dull.length)} sans intérêt (${percent(dull.length, rows.length)}) · ${[...byReason].map(([reason, n]) => `${reason} ${n}`).join(' · ')} · rapport ${REPORT}`)
    if (!apply) return
    const now = new Date()
    const sweepId = (await db.collection(SWEEPS).insertOne({ at: now, ids: [] })).insertedId
    let suppressed = 0
    for (let start = 0; start < dull.length; start += WRITE_BATCH) {
      const slice = dull.slice(start, start + WRITE_BATCH)
      suppressed += (await db.collection('items').bulkWrite(slice.map((row) => ({
        updateOne: { filter: { _id: row._id, isSuppressed: { $ne: true } } as Document, update: { $set: { isSuppressed: true, suppressedReason: 'web-dull', suppressedAt: now, suppressedDetail: row.reason } } },
      })), { ordered: false })).modifiedCount
      await db.collection(SWEEPS).updateOne({ _id: sweepId }, { $push: { ids: { $each: slice.map((row) => row._id) } } } as Document)
      await wait(PAUSE_MS)
    }
    await db.collection(SWEEPS).updateOne({ _id: sweepId }, { $set: { suppressed, doneAt: new Date() } })
    console.log(`fait : ${count(suppressed)} sites mis de côté`)
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
