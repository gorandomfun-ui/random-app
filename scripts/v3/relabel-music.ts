/**
 * The videos their uploader filed under Music (YouTube category 10, the
 * Dailymotion "music" channel) that the old rule put in another universe
 * because a word of the title or a subject said motorbike, football or a city
 * (28 September 2026: "LIBASE MOTO (singeli beat)" in vehicles, a Top of the
 * Pops in animals). With the theme deck they leaked music into other cards.
 * See `pickUniverse` in lib/v3/tagging/tagItem.ts.
 *
 *   node --env-file=.env.local --import tsx scripts/v3/relabel-music.ts            read only: counts, examples, a report
 *   node --env-file=.env.local --import tsx scripts/v3/relabel-music.ts --apply    writes the universe
 *   node --env-file=.env.local --import tsx scripts/v3/relabel-music.ts --undo     puts back what a run changed
 *
 * One universe at a time through the universe index, only the music-filed
 * videos sent back, a pause between universes: the database is small. Each
 * changed video's previous universe, format family and registers are kept
 * for --undo. Set-aside videos are left alone.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { MongoClient, type Document, type ObjectId } from 'mongodb'

import { computeRegisters } from '@/lib/v3/cool/registers'
import { formatFamilyKey } from '@/lib/v3/families'
import { UNIVERSES } from '@/lib/v3/types'
import { count, table } from './reportFormat'

const RUNS = 'relabel_runs_v3'
const REPORT = 'docs/reports/relabel-music.md'
const PAUSE_MS = 1500
const WRITE_BATCH = 500
const apply = process.argv.includes('--apply')
const undo = process.argv.includes('--undo')
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const shuffle = <T,>(values: T[]): T[] => [...values].sort(() => Math.random() - 0.5)

type Row = { _id: ObjectId; title: string; provider?: string; lang?: string; v3: { universe: string; formatFamily?: string; registers?: string[]; subjects?: Array<{ id: string }>; angle?: string; line?: string } }

const FILED_UNDER_MUSIC = { $or: [{ provider: { $in: ['youtube', 'reddit-youtube'] }, categoryId: '10' }, { provider: 'dailymotion', categoryId: 'music' }] }

async function undoRuns(db: import('mongodb').Db): Promise<void> {
  const runs = await db.collection(RUNS).find({ kind: 'music', undoneAt: { $exists: false } }).toArray()
  let restored = 0
  for (const run of runs) {
    const previous = (run.previous ?? []) as Array<{ _id: ObjectId; universe: string; formatFamily?: string; registers?: string[] }>
    for (let start = 0; start < previous.length; start += WRITE_BATCH) {
      const result = await db.collection('items').bulkWrite(previous.slice(start, start + WRITE_BATCH).map((entry) => ({
        updateOne: {
          filter: { _id: entry._id },
          update: entry.registers?.length
            ? { $set: { 'v3.universe': entry.universe, 'v3.formatFamily': entry.formatFamily, 'v3.registers': entry.registers } }
            : { $set: { 'v3.universe': entry.universe, 'v3.formatFamily': entry.formatFamily }, $unset: { 'v3.registers': '' } },
        },
      })), { ordered: false })
      restored += result.modifiedCount
      await wait(400)
    }
    await db.collection(RUNS).updateOne({ _id: run._id }, { $set: { undoneAt: new Date() } })
  }
  console.log(`remis : ${restored} vidéos, ${runs.length} lots annulés`)
}

async function main(): Promise<void> {
  const client = new MongoClient(process.env.MONGODB_URI as string, { serverSelectionTimeoutMS: 20000 })
  await client.connect()
  try {
    const db = client.db(process.env.MONGODB_DB || 'randomdb')
    if (undo) return await undoRuns(db)
    const rows: Row[] = []
    for (const universe of UNIVERSES.filter((name) => name !== 'music')) {
      const found = await db.collection('items').find(
        { 'v3.universe': universe, type: 'video', ...FILED_UNDER_MUSIC, isSuppressed: { $ne: true } } as Document,
        { projection: { title: 1, provider: 1, lang: 1, v3: 1 }, hint: 'v3_universe_type_rand', maxTimeMS: 600_000 },
      ).toArray()
      rows.push(...(found as unknown as Row[]))
      console.log(`${universe} : ${count(found.length)}`)
      await wait(PAUSE_MS)
    }
    const byFrom = new Map<string, Row[]>()
    for (const row of rows) byFrom.set(row.v3.universe, [...(byFrom.get(row.v3.universe) ?? []), row])
    const lines = [
      `# Musique rangée ailleurs — ${apply ? 'appliqué' : 'comptage seul'}`,
      '',
      `Vidéos classées Musique par leur auteur mais rangées dans un autre univers : **${count(rows.length)}**.`,
      '',
      table(['Univers d’où elles viennent', 'Vidéos'], [...byFrom].sort((left, right) => right[1].length - left[1].length).map(([universe, list]) => [universe, count(list.length)])),
      '',
      ...[...byFrom].sort((left, right) => right[1].length - left[1].length).flatMap(([universe, list]) => [`## ${universe} → musique, 12 au hasard`, ...shuffle(list).slice(0, 12).map((row) => `- ${row.title.slice(0, 110)}`), '']),
    ]
    mkdirSync(dirname(REPORT), { recursive: true })
    writeFileSync(REPORT, `${lines.join('\n')}\n`)
    console.log(`${count(rows.length)} à ranger en musique · rapport ${REPORT}`)
    if (!apply) return

    const at = new Date()
    let written = 0
    for (let start = 0; start < rows.length; start += WRITE_BATCH) {
      const slice = rows.slice(start, start + WRITE_BATCH)
      await db.collection(RUNS).insertOne({ at, kind: 'music', previous: slice.map((row) => ({ _id: row._id, universe: row.v3.universe, formatFamily: row.v3.formatFamily, registers: row.v3.registers ?? [] })) })
      const result = await db.collection('items').bulkWrite(slice.map((row) => {
        const v3 = { ...row.v3, universe: 'music' }
        const registers = computeRegisters({ type: 'video', title: row.title, provider: row.provider, v3 } as never)
        const formatFamily = formatFamilyKey({ primarySubjectId: row.v3.subjects?.[0]?.id, universe: 'music', angle: row.v3.angle as never, lang: row.lang })
        return {
          updateOne: {
            filter: { _id: row._id, 'v3.universe': row.v3.universe } as Document,
            update: registers.length
              ? { $set: { 'v3.universe': 'music', 'v3.formatFamily': formatFamily, 'v3.registers': registers } }
              : { $set: { 'v3.universe': 'music', 'v3.formatFamily': formatFamily }, $unset: { 'v3.registers': '' } },
          },
        }
      }), { ordered: false })
      written += result.modifiedCount
      process.stdout.write(`\rrangées : ${count(written)} / ${count(rows.length)}`)
      await wait(400)
    }
    process.stdout.write('\n')
    console.log(`fait : ${count(written)} vidéos rangées en musique`)
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
