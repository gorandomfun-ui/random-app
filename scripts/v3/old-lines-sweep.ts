/**
 * The dig's door over what the old lines stored on a day (lib/v3/dig/oldLines.ts):
 * counted, reported, and — only when asked — set aside.
 *
 *   node --env-file=.env.local --import tsx scripts/v3/old-lines-sweep.ts                       read only: today's (Paris) old-line videos, counts by rule, a report
 *   node --env-file=.env.local --import tsx scripts/v3/old-lines-sweep.ts --day=2026-10-02      another day
 *   node --env-file=.env.local --import tsx scripts/v3/old-lines-sweep.ts --day=… --apply       sets what fails aside (suppressedReason 'old-lines')
 *   node --env-file=.env.local --import tsx scripts/v3/old-lines-sweep.ts --undo                gives back what this sweep set aside
 *
 * One read of the day's videos through the day's index, a few writes by id.
 * Nothing is deleted: `isSuppressed`, which every draw skips, and a sweep
 * record (kind 'old-lines', with the ids) so `--undo` can give them back.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { MongoClient, ObjectId, type Document } from 'mongodb'

import { OLD_LINES, sortOldLines, type StoredVideo } from '@/lib/v3/dig/oldLines'
import { SWEEPS_COLLECTION } from '@/lib/v3/pools/recap'

const REPORT = 'docs/reports/old-lines-sweep.md'
const BATCH = 500
const apply = process.argv.includes('--apply')
const undo = process.argv.includes('--undo')
const dayArg = process.argv.find((arg) => arg.startsWith('--day='))?.slice(6)
const parisDay = (at: Date) => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
const day = dayArg && /^\d{4}-\d{2}-\d{2}$/.test(dayArg) ? dayArg : parisDay(new Date())
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type Row = StoredVideo & { _id: ObjectId; line: string }

async function main(): Promise<void> {
  const client = new MongoClient(process.env.MONGODB_URI as string, { serverSelectionTimeoutMS: 20_000 })
  await client.connect()
  const db = client.db(process.env.MONGODB_DB || 'randomdb')
  const items = db.collection('items')
  if (undo) {
    const sweeps = await db.collection(SWEEPS_COLLECTION).find({ kind: 'old-lines', undoneAt: { $exists: false } }).toArray()
    for (const sweep of sweeps) {
      const ids = (sweep.ids as ObjectId[]) ?? []
      let given = 0
      for (let start = 0; start < ids.length; start += BATCH) {
        const result = await items.updateMany({ _id: { $in: ids.slice(start, start + BATCH) }, suppressedReason: 'old-lines' }, { $unset: { isSuppressed: '', suppressedReason: '', suppressedAt: '', suppressedDetail: '' } })
        given += result.modifiedCount
        await wait(200)
      }
      await db.collection(SWEEPS_COLLECTION).updateOne({ _id: sweep._id }, { $set: { undoneAt: new Date() } })
      console.log(`rendu : ${given} vidéos (balayage ${String(sweep._id)}, jour ${String(sweep.day)})`)
    }
    await client.close(); return
  }
  // The day's videos from the old lines, in the order they were stored, through the day's index.
  const from = ObjectId.createFromTime(Math.floor(new Date(`${day}T00:00:00+02:00`).getTime() / 1000))
  const to = ObjectId.createFromTime(Math.floor(new Date(`${day}T00:00:00+02:00`).getTime() / 1000) + 86_400)
  const rows = await items.find(
    { type: 'video', _id: { $gte: from, $lt: to }, 'v3.line': { $in: [...OLD_LINES] }, isSuppressed: { $ne: true } },
    { projection: { title: 1, channelTitle: 1, 'v3.channelKey': 1, 'v3.line': 1, 'v3.universe': 1 }, sort: { _id: 1 }, hint: 'idx_image_scan_by_type_id', maxTimeMS: 180_000 },
  ).toArray()
  const stored: Row[] = rows.map((row) => ({ _id: row._id as ObjectId, title: row.title, channelTitle: row.channelTitle, channelKey: (row.v3 as { channelKey?: string } | undefined)?.channelKey, universe: (row.v3 as { universe?: string } | undefined)?.universe, line: String((row.v3 as { line?: string } | undefined)?.line ?? '') }))
  const sorted = sortOldLines(stored)
  const byLine: Record<string, { read: number; aside: number }> = {}
  for (const row of stored) { byLine[row.line] = byLine[row.line] ?? { read: 0, aside: 0 }; byLine[row.line].read += 1 }
  for (const { video } of sorted.aside) byLine[video.line].aside += 1
  const byUniverse: Record<string, number> = {}
  for (const { video } of sorted.aside) byUniverse[video.universe ?? 'other'] = (byUniverse[video.universe ?? 'other'] ?? 0) + 1
  const lines = [
    `# Les vieilles lignes du ${day} à la porte de la fouille — ${new Date().toISOString().slice(0, 16)}Z`, '',
    `${stored.length.toLocaleString('fr-FR')} vidéos lues (${OLD_LINES.join(', ')}) ; **${sorted.aside.length.toLocaleString('fr-FR')} à mettre de côté**, ${sorted.kept.length.toLocaleString('fr-FR')} restent.`, '',
    '| Règle | Vidéos |', '|---|---|',
    ...Object.entries(sorted.byRule).map(([rule, n]) => `| ${rule} | ${n.toLocaleString('fr-FR')} |`), '',
    '| Ligne | Lues | De côté |', '|---|---|---|',
    ...Object.entries(byLine).sort((a, b) => b[1].read - a[1].read).map(([line, n]) => `| ${line} | ${n.read.toLocaleString('fr-FR')} | ${n.aside.toLocaleString('fr-FR')} |`), '',
    '| Univers des mises de côté | Vidéos |', '|---|---|',
    ...Object.entries(byUniverse).sort((a, b) => b[1] - a[1]).map(([universe, n]) => `| ${universe} | ${n.toLocaleString('fr-FR')} |`), '',
    'Exemples :', ...sorted.aside.filter((_, index) => index % Math.max(1, Math.ceil(sorted.aside.length / 16)) === 0).map(({ video, rule }) => `- ${rule} · ${String(video.channelTitle ?? '').slice(0, 24)} · ${String(video.title).slice(0, 70)}`),
  ]
  mkdirSync(dirname(REPORT), { recursive: true })
  writeFileSync(REPORT, `${lines.join('\n')}\n`)
  console.log(lines.slice(0, 9).join('\n'))
  console.log(`rapport ${REPORT}`)
  if (apply && sorted.aside.length) {
    const ids = sorted.aside.map(({ video }) => video._id)
    const sweep = { kind: 'old-lines', day, at: new Date(), byRule: sorted.byRule, byUniverse, read: stored.length, setAside: 0, ids }
    const inserted = await db.collection(SWEEPS_COLLECTION).insertOne(sweep as Document)
    const detail = String(inserted.insertedId)
    let setAside = 0
    for (let start = 0; start < ids.length; start += BATCH) {
      const result = await items.updateMany({ _id: { $in: ids.slice(start, start + BATCH) } }, { $set: { isSuppressed: true, suppressedReason: 'old-lines', suppressedAt: new Date(), suppressedDetail: detail } })
      setAside += result.modifiedCount
      await wait(200)
    }
    await db.collection(SWEEPS_COLLECTION).updateOne({ _id: inserted.insertedId }, { $set: { setAside } })
    console.log(`${setAside} vidéos mises de côté (balayage ${detail}) — --undo les rend.`)
  }
  await client.close()
}

main().catch((error) => { console.error(error); process.exit(1) })
