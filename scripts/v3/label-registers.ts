/**
 * Writes the cool registers onto the catalogue, once.
 *
 *   node --env-file=.env.local --import tsx scripts/v3/label-registers.ts            # dry: 5,000 rows, counts and samples
 *   node --env-file=.env.local --import tsx scripts/v3/label-registers.ts --apply    # the whole catalogue, then the index
 *
 * Resumable: a checkpoint is saved after every batch, so stopping it at any
 * moment — a closed laptop included — loses nothing; the next run continues
 * from there. Only rows whose registers change are written: a few per cent
 * of the catalogue.
 */

import { MongoClient, type AnyBulkWriteOperation, type Db, type Document, type ObjectId } from 'mongodb'

import { computeRegisters, type LabelableRow } from '@/lib/v3/cool/registers'
import { V3_INDEXES } from '@/lib/v3/indexes'
import { COOL_REGISTERS, type CoolRegister } from '@/lib/v3/types'
import { count } from './reportFormat'

const CHECKPOINT_COLLECTION = 'v3_repair_checkpoints'
const CHECKPOINT_ID = 'label-registers'
const BATCH = 2000
const QUERY_BUDGET_MS = 120_000
const RETRIES = 4

type Row = LabelableRow & Document & { _id: ObjectId; v3?: (LabelableRow['v3'] & { registers?: CoolRegister[] }) | null }
type Tally = Record<CoolRegister, number>

const flag = (name: string) => process.argv.includes(`--${name}`)
const numericFlag = (name: string, fallback: number) => {
  const raw = process.argv.find((argument) => argument.startsWith(`--${name}=`))
  const value = raw ? Number(raw.split('=')[1]) : NaN
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}
const emptyTally = (): Tally => Object.fromEntries(COOL_REGISTERS.map((id) => [id, 0])) as Tally
const sameRegisters = (left: CoolRegister[], right: CoolRegister[]) =>
  left.length === right.length && left.every((id, index) => id === right[index])

let stopping = false
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    stopping = true
    console.log(`\n${signal} reçu : le lot en cours se termine, le point de reprise est sauvé.`)
  })
}

async function withRetries<T>(what: string, run: () => Promise<T>): Promise<T> {
  let delay = 5_000
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run()
    } catch (error) {
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
  const limit = apply ? Infinity : numericFlag('limit', 5000)

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 20000 })
  await client.connect()
  try {
    const db: Db = client.db(dbName)
    const items = db.collection('items')
    const checkpoints = db.collection(CHECKPOINT_COLLECTION)
    console.log(apply ? 'Mode : ÉCRITURE, tout le catalogue\n' : `Mode : rapport à blanc sur ${count(limit)} contenus, aucune écriture\n`)

    const total = await items.estimatedDocumentCount()
    const saved = apply && !flag('restart')
      ? ((await checkpoints.findOne({ _id: CHECKPOINT_ID as never })) as { lastId?: ObjectId; scanned?: number; written?: number; tally?: Tally } | null)
      : null
    let afterId: ObjectId | null = saved?.lastId ?? null
    let scanned = saved?.scanned ?? 0
    let written = saved?.written ?? 0
    const tally: Tally = { ...emptyTally(), ...(saved?.tally ?? {}) }
    if (afterId) console.log(`Reprise après ${String(afterId)} : ${count(scanned)} déjà lus, ${count(written)} déjà écrits\n`)

    const samples: Partial<Record<CoolRegister, string[]>> = {}
    const started = Date.now()
    let sinceStart = 0
    let batches = 0

    while (!stopping && sinceStart < limit) {
      const rows = (await withRetries('lecture', () =>
        items
          .find(
            { ...(afterId ? { _id: { $gt: afterId } } : {}), type: { $in: ['video', 'image'] }, 'v3.usable': true },
            {
              sort: { _id: 1 },
              limit: BATCH,
              projection: {
                type: 1, title: 1, provider: 1, isSuppressed: 1, obsoleteVideoStatus: 1, editorialRoutine: 1,
                'v3.universe': 1, 'v3.angle': 1, 'v3.era': 1, 'v3.popularity': 1, 'v3.usable': 1, 'v3.registers': 1,
              },
              maxTimeMS: QUERY_BUDGET_MS,
            },
          )
          .toArray(),
      )) as Row[]
      if (!rows.length) break

      const operations: AnyBulkWriteOperation<Document>[] = []
      for (const row of rows) {
        const registers = computeRegisters(row)
        for (const id of registers) {
          tally[id] += 1
          const bucket = (samples[id] ??= [])
          if (bucket.length < 6) bucket.push(`${row.type} · ${String(row.title ?? '').replace(/\s+/g, ' ').slice(0, 70)}`)
        }
        const stored = row.v3?.registers ?? []
        if (sameRegisters(registers, stored)) continue
        operations.push({
          updateOne: {
            filter: { _id: row._id },
            update: registers.length ? { $set: { 'v3.registers': registers } } : { $unset: { 'v3.registers': '' } },
          },
        })
      }

      if (apply && operations.length) {
        await withRetries('écriture', () => items.bulkWrite(operations, { ordered: false }))
      }
      afterId = rows[rows.length - 1]._id
      scanned += rows.length
      sinceStart += rows.length
      written += apply ? operations.length : 0
      batches += 1
      if (apply) {
        await withRetries('point de reprise', () =>
          checkpoints.updateOne(
            { _id: CHECKPOINT_ID as never },
            { $set: { lastId: afterId, scanned, written, tally, updatedAt: new Date() } },
            { upsert: true },
          ),
        )
      }
      if (batches % 10 === 0 || !apply) {
        const perMinute = Math.round((sinceStart / (Date.now() - started)) * 60_000)
        const remaining = Math.max(0, total - scanned)
        const eta = perMinute > 0 ? Math.round(remaining / perMinute) : 0
        console.log(
          `  ${count(scanned)} lus · ${count(written)} écrits · ${COOL_REGISTERS.map((id) => `${id} ${count(tally[id])}`).join(' · ')}` +
            ` · ~${count(perMinute)}/min · reste ~${eta} min`,
        )
      }
    }

    console.log(`\nLus : ${count(scanned)} · écrits : ${count(written)}${stopping ? ' · ARRÊTÉ, reprise possible' : ''}`)
    for (const id of COOL_REGISTERS) {
      console.log(`\n${id} : ${count(tally[id])}`)
      for (const line of samples[id] ?? []) console.log(`   ${line}`)
    }

    if (apply && !stopping) {
      const index = V3_INDEXES.find((planned) => planned.name === 'v3_register_type_rand')
      if (index) {
        console.log('\nCréation de l_index v3_register_type_rand (côté serveur, continue même si le client se coupe)…')
        await items.createIndex(index.key, { name: index.name, background: true })
        console.log('Index prêt.')
      }
      console.log('\nTERMINÉ')
    }
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
