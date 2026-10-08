/**
 * The era read again on every video that carries one, under the rule of
 * 8 October (lib/v3/tagging/classify.ts, classifyEra): retro means a year
 * before 2006 in the title, or an upload from before 2012 — no longer "five
 * years old", which had made a third of the stock retro. A video that loses
 * the label keeps everything else — its universe, its registers, its line —
 * and every other card draws it as before; only the retro card stops.
 *
 *   node --env-file=.env.local --import tsx scripts/v3/relabel-era.ts --dry --slices=10   a sample, writes nothing
 *   node --env-file=.env.local --import tsx scripts/v3/relabel-era.ts --apply
 *
 * Reads the retro and the recent videos in slices of their random order
 * through the era index, with a pause between slices (the base is small);
 * each slice stands alone, so a run that stops is simply run again.
 */

import { MongoClient, type AnyBulkWriteOperation, type Document } from 'mongodb'

import { classifyEra } from '@/lib/v3/tagging/classify'

const SLICES = 400
const MAX_MINUTES = Number(process.env.RANDOM_RELABEL_MINUTES ?? 90)
const PAUSE_MS = 120
const QUERY_MS = 90_000
const ERAS = ['retro', 'recent'] as const

const flag = (name: string): boolean => process.argv.includes(`--${name}`)
const numeric = (name: string, fallback: number): number => { const raw = process.argv.find((argument) => argument.startsWith(`--${name}=`)); const value = Number(raw?.split('=')[1]); return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback }
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const dateOf = (value: unknown): Date | null => { if (value instanceof Date) return value; if (typeof value === 'string') { const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date } return null }

async function main(): Promise<void> {
  const apply = flag('apply')
  const slices = Math.min(SLICES, numeric('slices', SLICES))
  if (!apply && !flag('dry')) { console.error('--apply ou --dry'); process.exit(2) }
  setTimeout(() => { console.error(`Arrêt : ${MAX_MINUTES} minutes écoulées.`); process.exit(1) }, MAX_MINUTES * 60_000).unref()
  const client = new MongoClient(process.env.MONGODB_URI as string, { serverSelectionTimeoutMS: 20_000, socketTimeoutMS: QUERY_MS * 3 })
  await client.connect()
  const items = client.db(process.env.MONGODB_DB || 'randomdb').collection('items')
  const startedAt = Date.now()
  const now = new Date()
  let read = 0, changed = 0
  const moves = new Map<string, number>()
  const samples = new Map<string, string[]>()
  for (const era of ERAS) {
    for (let slice = 0; slice < slices; slice += 1) {
      const range = { $gte: slice / SLICES, $lt: slice === SLICES - 1 ? 1.01 : (slice + 1) / SLICES }
      const rows = await items.find({ type: 'video', 'v3.era': era, rand: range } as Document, { projection: { title: 1, publishedAt: 1, trendObservedAt: 1, 'v3.era': 1 }, hint: 'v3_era_type_rand', maxTimeMS: QUERY_MS, batchSize: 1000 }).toArray()
      const writes: AnyBulkWriteOperation<Document>[] = []
      for (const row of rows) {
        read += 1
        const next = classifyEra({ title: typeof row.title === 'string' ? row.title : null, publishedAt: dateOf(row.publishedAt), trendObservedAt: dateOf(row.trendObservedAt) }, now)
        if (next === era) continue
        changed += 1
        const move = `${era} → ${next}`
        moves.set(move, (moves.get(move) ?? 0) + 1)
        const list = samples.get(move) ?? []
        if (list.length < 8) { list.push(String(row.title ?? '').slice(0, 70)); samples.set(move, list) }
        writes.push({ updateOne: { filter: { _id: row._id }, update: { $set: { 'v3.era': next } } } })
      }
      if (apply && writes.length) await items.bulkWrite(writes, { ordered: false })
      if (slice % 50 === 49) console.log(`  ${era}: ${read.toLocaleString('fr-FR')} lues · ${changed.toLocaleString('fr-FR')} changées · ${Math.round((Date.now() - startedAt) / 1000)} s`)
      await wait(PAUSE_MS)
    }
  }
  for (const [move, count] of moves) {
    console.log(`\n${move} : ${count.toLocaleString('fr-FR')}`)
    for (const title of samples.get(move) ?? []) console.log(`   ${title}`)
  }
  console.log(JSON.stringify({ relabelEra: apply ? 'ok' : 'dry', slices, read, changed, moves: Object.fromEntries(moves), durationMs: Date.now() - startedAt }))
  await client.close()
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1) })
