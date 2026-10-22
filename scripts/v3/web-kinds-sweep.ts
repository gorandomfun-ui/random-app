/**
 * The stored sites sorted by the owner's two kinds of 22 October (lib/v3/web/kinds.ts): the medical ones set aside
 * (hospitals, clinics, doctors, dentists, pharmacies; cosmetic surgery kept), the fun ones marked for their third of
 * the draws (lib/discovery/mongo.ts). The door does both for the sites that come in (scripts/v3/web-previews.ts).
 *
 *   node --env-file=.env.local --import tsx scripts/v3/web-kinds-sweep.ts --dry     counts, writes nothing
 *   node --env-file=.env.local --import tsx scripts/v3/web-kinds-sweep.ts           sets aside and marks
 *   node --env-file=.env.local --import tsx scripts/v3/web-kinds-sweep.ts --undo    gives the medical ones back
 *
 * Set aside, never deleted: `suppressedReason: 'web-medical'`, as the earlier sweeps did ('web-dull').
 */

import type { AnyBulkWriteOperation, Document } from 'mongodb'

import { getDb } from '@/lib/db'
import { funSite, medicalReason } from '@/lib/v3/web/kinds'

const dry = process.argv.includes('--dry')
const undo = process.argv.includes('--undo')
const WRITE_BATCH = 500
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function main(): Promise<void> {
  const db = await getDb()
  const items = db.collection('items')
  if (undo) {
    const result = await items.updateMany({ type: 'web', suppressedReason: 'web-medical' }, { $unset: { isSuppressed: '', suppressedReason: '', suppressedAt: '', suppressedDetail: '' } })
    console.log(`rendus : ${result.modifiedCount}`)
    process.exit(0)
  }
  const now = new Date()
  const writes: AnyBulkWriteOperation<Document>[] = []
  let read = 0
  let medical = 0
  let fun = 0
  let unmarked = 0
  let written = 0
  const flush = async () => {
    const batch = writes.splice(0)
    if (!batch.length || dry) return
    written += (await items.bulkWrite(batch, { ordered: false })).modifiedCount
    await wait(300)
  }
  for await (const row of items.find({ type: 'web' }, { projection: { title: 1, host: 1, provider: 1, isSuppressed: 1, webFun: 1 }, batchSize: 2000 })) {
    read += 1
    const site = { title: row.title as unknown, host: row.host as unknown, provider: row.provider as unknown }
    const reason = row.isSuppressed === true ? null : medicalReason(site)
    if (reason) {
      medical += 1
      writes.push({ updateOne: { filter: { _id: row._id, isSuppressed: { $ne: true } }, update: { $set: { isSuppressed: true, suppressedReason: 'web-medical', suppressedAt: now, suppressedDetail: reason } } } })
    }
    const isFun = funSite(site)
    if (isFun) fun += 1
    if (isFun && row.webFun !== true) writes.push({ updateOne: { filter: { _id: row._id }, update: { $set: { webFun: true } } } })
    else if (!isFun && row.webFun === true) { unmarked += 1; writes.push({ updateOne: { filter: { _id: row._id }, update: { $unset: { webFun: '' } } } }) }
    if (writes.length >= WRITE_BATCH) await flush()
  }
  await flush()
  console.log(JSON.stringify({ dry, read, medical, fun, unmarked, written }))
  process.exit(0)
}

main().catch((error) => { console.error(String(error).replace(/mongodb(\+srv)?:\/\/\S+/g, '[uri]').slice(0, 300)); process.exit(1) })
