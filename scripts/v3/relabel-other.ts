/**
 * Puts the videos filed under "other" where their words say they belong —
 * gameplay in gaming, recipes in food, concerts in music — and writes their
 * cool registers. Fifty-six per cent of the catalogue sat in "other".
 *
 *   node --env-file=.env.local --import tsx scripts/v3/relabel-other.ts            # dry: 8,000 rows, counts and samples
 *   node --env-file=.env.local --import tsx scripts/v3/relabel-other.ts --apply    # every "other" video
 *
 * Resumable: a checkpoint is saved after every batch (the last `rand` read),
 * so a stop loses nothing. Only rows that gain a universe are written.
 */

import { MongoClient, type AnyBulkWriteOperation, type Db, type Document, type ObjectId } from 'mongodb'

import { computeRegisters, type LabelableRow } from '@/lib/v3/cool/registers'
import { cueText, universeFromCues } from '@/lib/v3/tagging/cues'
import type { Universe } from '@/lib/v3/types'
import { count } from './reportFormat'

const CHECKPOINT_COLLECTION = 'v3_repair_checkpoints'
const CHECKPOINT_ID = 'relabel-other'
const BATCH = 2000
const QUERY_BUDGET_MS = 120_000
const RETRIES = 4

type Row = LabelableRow & Document & { _id: ObjectId; rand: number; keywords?: unknown; tags?: unknown }
type Tally = Partial<Record<Universe, number>>

const flag = (name: string) => process.argv.includes(`--${name}`)
const numericFlag = (name: string, fallback: number) => {
  const raw = process.argv.find((argument) => argument.startsWith(`--${name}=`))
  const value = raw ? Number(raw.split('=')[1]) : NaN
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

let stopping = false
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => { stopping = true; console.log(`\n${signal} reçu : le lot en cours se termine, le point de reprise est sauvé.`) })
}

async function withRetries<T>(what: string, run: () => Promise<T>): Promise<T> {
  let delay = 5_000
  for (let attempt = 1; ; attempt += 1) {
    try { return await run() } catch (error) {
      if (attempt >= RETRIES) throw error
      console.log(`  ${what} : échec (${error instanceof Error ? error.message.slice(0, 80) : String(error)}), nouvel essai dans ${delay / 1000} s`)
      await new Promise((resolve) => setTimeout(resolve, delay))
      delay = Math.min(delay * 3, 90_000)
    }
  }
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI
  if (!uri) throw new Error('MONGODB_URI manquant')
  const dbName = process.env.MONGODB_DB || process.env.MONGO_DB || 'randomdb'
  const apply = flag('apply')
  const limit = apply ? Infinity : numericFlag('limit', 8000)
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 20000 })
  await client.connect()
  try {
    const db: Db = client.db(dbName)
    const items = db.collection('items')
    const checkpoints = db.collection(CHECKPOINT_COLLECTION)
    console.log(apply ? 'Mode : ÉCRITURE, toutes les vidéos « other »\n' : `Mode : rapport à blanc sur ${count(limit)} vidéos « other », aucune écriture\n`)
    const saved = apply && !flag('restart')
      ? ((await checkpoints.findOne({ _id: CHECKPOINT_ID as never })) as { afterRand?: number; scanned?: number; written?: number; tally?: Tally } | null)
      : null
    let afterRand = saved?.afterRand ?? -1
    let scanned = saved?.scanned ?? 0
    let written = saved?.written ?? 0
    const tally: Tally = { ...(saved?.tally ?? {}) }
    if (afterRand >= 0) console.log(`Reprise après rand ${afterRand} : ${count(scanned)} déjà lues, ${count(written)} déjà écrites\n`)
    const samples: Partial<Record<Universe, string[]>> = {}
    const started = Date.now()
    let sinceStart = 0
    let batches = 0

    while (!stopping && sinceStart < limit) {
      const rows = (await withRetries('lecture', () =>
        items.find(
          { 'v3.universe': 'other', type: 'video', rand: { $gt: afterRand } },
          { sort: { rand: 1 }, limit: BATCH, hint: 'v3_universe_type_rand', projection: { type: 1, title: 1, keywords: 1, tags: 1, provider: 1, rand: 1, isSuppressed: 1, obsoleteVideoStatus: 1, editorialRoutine: 1, v3: 1 }, maxTimeMS: QUERY_BUDGET_MS },
        ).toArray(),
      )) as Row[]
      if (!rows.length) break
      const operations: AnyBulkWriteOperation<Document>[] = []
      for (const row of rows) {
        const universe = universeFromCues(cueText(row))
        if (!universe || universe === 'other') continue
        tally[universe] = (tally[universe] ?? 0) + 1
        const bucket = (samples[universe] ??= [])
        if (bucket.length < 5) bucket.push(String(row.title ?? '').replace(/\s+/g, ' ').slice(0, 70))
        const relabelled = { ...row, v3: { ...(row.v3 as NonNullable<LabelableRow['v3']>), universe } }
        const registers = computeRegisters(relabelled)
        operations.push({ updateOne: { filter: { _id: row._id }, update: { $set: { 'v3.universe': universe, ...(registers.length ? { 'v3.registers': registers } : {}) }, ...(registers.length ? {} : { $unset: { 'v3.registers': '' } }) } } })
      }
      if (apply && operations.length) await withRetries('écriture', () => items.bulkWrite(operations, { ordered: false }))
      afterRand = rows[rows.length - 1].rand
      scanned += rows.length
      sinceStart += rows.length
      written += apply ? operations.length : 0
      batches += 1
      if (apply) await withRetries('point de reprise', () => checkpoints.updateOne({ _id: CHECKPOINT_ID as never }, { $set: { afterRand, scanned, written, tally, updatedAt: new Date() } }, { upsert: true }))
      if (batches % 10 === 0 || !apply) {
        const perMinute = Math.round((sinceStart / (Date.now() - started)) * 60_000)
        console.log(`  ${count(scanned)} lues · ${count(apply ? written : operations.length)} ${apply ? 'écrites' : 'reclassables dans ce lot'} · ~${count(perMinute)}/min · ${Object.entries(tally).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).slice(0, 6).map(([u, n]) => `${u} ${count(n ?? 0)}`).join(' · ')}`)
      }
    }
    console.log(`\nLues : ${count(scanned)} · reclassées : ${count(Object.values(tally).reduce((a, b) => a + (b ?? 0), 0))}${stopping ? ' · ARRÊTÉ, reprise possible' : ''}`)
    for (const [universe, n] of Object.entries(tally).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))) {
      console.log(`\n${universe} : ${count(n ?? 0)}`)
      for (const line of samples[universe as Universe] ?? []) console.log(`   ${line}`)
    }
    if (apply && !stopping) console.log('\nTERMINÉ')
  } finally {
    await client.close()
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
