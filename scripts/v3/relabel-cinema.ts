/**
 * The videos filed under cinema by the old rule, filed again by the new one
 * (26 September 2026): a cinema subject only makes a video cinema with a word
 * of cinema in its title or a film or TV category, and "tv" or "scene" alone
 * no longer mean cinema. See `pickUniverse` in lib/v3/tagging/tagItem.ts.
 *
 *   node --import tsx scripts/v3/relabel-cinema.ts            read only: counts, examples, a report
 *   node --import tsx scripts/v3/relabel-cinema.ts --apply    writes the new universe
 *   node --import tsx scripts/v3/relabel-cinema.ts --undo     puts back what a run changed
 *
 * It reads the cinema videos through the universe index with a single cursor,
 * the stored labels only (no description), and pauses as it goes: the
 * database is small. The subjects already stored decide, in their stored
 * order; nothing is matched again. Set-aside videos are left alone, so the
 * pools table keeps subtracting them from cinema. Each changed video's
 * previous universe, format family and registers are kept for --undo.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import { MongoClient, type Document, type ObjectId } from 'mongodb'

import { computeRegisters } from '@/lib/v3/cool/registers'
import { formatFamilyKey } from '@/lib/v3/families'
import { universeFromCues } from '@/lib/v3/tagging/cues'
import { hasCinemaClue } from '@/lib/v3/tagging/tagItem'
import { isUniverse, type Universe } from '@/lib/v3/types'
import { count, percent, table } from './reportFormat'

const RUNS = 'relabel_runs_v3'
const REPORT = 'docs/reports/relabel-cinema.md'
const PAUSE_EVERY = 5000
const PAUSE_MS = 400
const WRITE_BATCH = 500

const apply = process.argv.includes('--apply')
const undo = process.argv.includes('--undo')
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type Row = {
  _id: ObjectId
  title: string
  provider?: string
  categoryId?: string
  lang?: string
  v3: Document & { subjects?: Array<{ id: string }>; universe: Universe; angle: string }
}

type Change = { row: Row; to: Universe; formatFamily: string; registers: string[] }

const shuffle = <T,>(values: T[]): T[] => {
  const copy = [...values]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1))
    ;[copy[index], copy[other]] = [copy[other], copy[index]]
  }
  return copy
}

/** The new rule on stored labels: the first subject that counts, else the words of the title. */
export function universeFor(row: Pick<Row, 'title' | 'categoryId'> & { subjects: Array<Universe | undefined> }): Universe {
  for (const universe of row.subjects) {
    if (!universe || universe === 'other') continue
    if (universe === 'cinema-tv' && !hasCinemaClue(row)) continue
    return universe
  }
  return universeFromCues(row.title) ?? 'other'
}

async function undoRuns(db: import('mongodb').Db): Promise<void> {
  const runs = await db.collection(RUNS).find({ kind: 'cinema', undoneAt: { $exists: false } }).toArray()
  let restored = 0
  for (const run of runs) {
    const previous = (run.previous ?? []) as Array<{ _id: ObjectId; universe: string; formatFamily?: string; registers?: string[] }>
    for (let start = 0; start < previous.length; start += WRITE_BATCH) {
      const slice = previous.slice(start, start + WRITE_BATCH)
      const result = await db.collection('items').bulkWrite(slice.map((entry) => ({
        updateOne: {
          filter: { _id: entry._id },
          update: entry.registers?.length
            ? { $set: { 'v3.universe': entry.universe, 'v3.formatFamily': entry.formatFamily, 'v3.registers': entry.registers } }
            : { $set: { 'v3.universe': entry.universe, 'v3.formatFamily': entry.formatFamily }, $unset: { 'v3.registers': '' } },
        },
      })), { ordered: false })
      restored += result.modifiedCount
      await wait(PAUSE_MS)
    }
    await db.collection(RUNS).updateOne({ _id: run._id }, { $set: { undoneAt: new Date() } })
  }
  console.log(`remis : ${restored} vidéos, ${runs.length} passages annulés`)
}

async function main(): Promise<void> {
  const client = new MongoClient(process.env.MONGODB_URI as string, { serverSelectionTimeoutMS: 20000 })
  await client.connect()
  try {
    const db = client.db(process.env.MONGODB_DB || 'randomdb')
    if (undo) return await undoRuns(db)

    const rows: Row[] = []
    const cursor = db.collection('items').find(
      { 'v3.universe': 'cinema-tv', type: 'video' },
      { projection: { title: 1, provider: 1, categoryId: 1, lang: 1, v3: 1, isSuppressed: 1 }, hint: 'v3_universe_type_rand', batchSize: 1000 },
    )
    let read = 0
    let suppressed = 0
    for await (const doc of cursor) {
      read += 1
      if (read % PAUSE_EVERY === 0) {
        process.stdout.write(`\rcinéma : ${count(read)} lues`)
        await wait(PAUSE_MS)
      }
      if (doc.isSuppressed === true) { suppressed += 1; continue }
      rows.push({ _id: doc._id, title: String(doc.title ?? ''), provider: doc.provider, categoryId: doc.categoryId, lang: doc.lang, v3: doc.v3 })
    }
    process.stdout.write(`\rcinéma : ${count(read)} lues\n`)

    // The universes of the stored subjects, read once.
    const ids = [...new Set(rows.flatMap((row) => (row.v3.subjects ?? []).map((subject) => subject.id)))]
    const universeOf = new Map<string, Universe>()
    for (let start = 0; start < ids.length; start += 1000) {
      const subjects = await db.collection('subjects_v3').find({ _id: { $in: ids.slice(start, start + 1000) } } as Document, { projection: { universe: 1 } }).toArray()
      for (const subject of subjects) if (isUniverse(subject.universe)) universeOf.set(String(subject._id), subject.universe)
    }

    const changes: Change[] = []
    const stay: Row[] = []
    for (const row of rows) {
      const to = universeFor({ title: row.title, categoryId: row.categoryId, subjects: (row.v3.subjects ?? []).map((subject) => universeOf.get(subject.id)) })
      if (to === 'cinema-tv') { stay.push(row); continue }
      const v3 = { ...row.v3, universe: to }
      changes.push({
        row,
        to,
        formatFamily: formatFamilyKey({ primarySubjectId: row.v3.subjects?.[0]?.id, universe: to, angle: row.v3.angle as never, lang: row.lang }),
        registers: computeRegisters({ type: 'video', title: row.title, provider: row.provider, v3 } as never),
      })
    }

    const byTo = new Map<string, Change[]>()
    for (const change of changes) byTo.set(change.to, [...(byTo.get(change.to) ?? []), change])
    const lines = [
      `# Reclassement du cinéma — ${apply ? 'appliqué' : 'comptage seul'}`,
      '',
      `Vidéos classées cinéma : **${count(read)}**, dont ${count(suppressed)} mises de côté (laissées telles quelles).`,
      `Avec la nouvelle règle : **${count(changes.length)} changent d'univers** (${percent(changes.length, rows.length)}), ${count(stay.length)} restent au cinéma.`,
      '',
      '## Où elles vont',
      table(['Univers', 'Vidéos'], [...byTo].sort((left, right) => right[1].length - left[1].length).map(([universe, list]) => [universe, count(list.length)])),
      '',
      ...[...byTo].sort((left, right) => right[1].length - left[1].length).slice(0, 12).flatMap(([universe, list]) => [
        `### → ${universe}`,
        ...shuffle(list).slice(0, 12).map((change) => `- ${change.row.title}`),
        '',
      ]),
      '## 30 qui restent au cinéma, au hasard',
      ...shuffle(stay).slice(0, 30).map((row) => `- ${row.title}`),
    ]
    mkdirSync(dirname(REPORT), { recursive: true })
    writeFileSync(REPORT, `${lines.join('\n')}\n`)
    console.log(`${count(rows.length)} examinées · ${count(changes.length)} changent · ${count(stay.length)} restent · rapport ${REPORT}`)
    console.log([...byTo].sort((left, right) => right[1].length - left[1].length).map(([universe, list]) => `${universe} ${list.length}`).join(' · '))

    if (!apply) return

    const at = new Date()
    let written = 0
    for (let start = 0; start < changes.length; start += WRITE_BATCH) {
      const slice = changes.slice(start, start + WRITE_BATCH)
      // What each video was, first, so --undo can always put it back.
      // One record per batch: a single one for the whole run would outgrow a document.
      await db.collection(RUNS).insertOne({ at, kind: 'cinema', previous: slice.map((change) => ({
        _id: change.row._id, universe: change.row.v3.universe, formatFamily: change.row.v3.formatFamily, registers: change.row.v3.registers ?? [],
      })) })
      const result = await db.collection('items').bulkWrite(slice.map((change) => ({
        updateOne: {
          filter: { _id: change.row._id, 'v3.universe': 'cinema-tv' } as Document,
          update: change.registers.length
            ? { $set: { 'v3.universe': change.to, 'v3.formatFamily': change.formatFamily, 'v3.registers': change.registers } }
            : { $set: { 'v3.universe': change.to, 'v3.formatFamily': change.formatFamily }, $unset: { 'v3.registers': '' } },
        },
      })), { ordered: false })
      written += result.modifiedCount
      process.stdout.write(`\rreclassées : ${count(written)} / ${count(changes.length)}`)
      await wait(PAUSE_MS)
    }
    process.stdout.write('\n')
    console.log(`fait : ${count(written)} vidéos reclassées`)
  } finally {
    await client.close()
  }
}

if (process.argv[1]?.endsWith('relabel-cinema.ts')) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
