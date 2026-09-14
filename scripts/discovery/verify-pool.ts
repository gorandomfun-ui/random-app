/** Read-only measurement of real catalogue draws. No ingestion, API-provider
 * calls, visitor writes, index creation or metadata migration. */
import { MongoClient } from 'mongodb'
import { selectPool } from '../../lib/discovery/mongo'
import { newSession, planDraw, commitDraw } from '../../lib/discovery/pool'
import { curatorOwnerId } from '../../lib/discovery/curatorAuth'
import { CATALOGUE_SAMPLE_SIZE } from '../../lib/discovery/sampling'

async function main() {
  const args = process.argv.slice(2)
  const option = (name: string, fallback: string) => {
    const at = args.indexOf(name); return at < 0 ? fallback : args[at + 1]
  }
  const draws = Number(option('--draws', '150')), sessions = Number(option('--sessions', '2'))
  const type = option('--type', 'video'), withoutHistory = args.includes('--without-history')
  if (!Number.isInteger(draws) || draws < 1 || draws > 500 || !Number.isInteger(sessions) || sessions < 1 ||
    sessions > 5 || draws * sessions > 1000 || !['image', 'video'].includes(type)) throw new Error('Invalid bounded audit options')
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI, database = process.env.MONGODB_DB || process.env.MONGO_DB
  if (!uri || !database) throw new Error('Explicit database configuration required')
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000, socketTimeoutMS: 10000 })
  const start = Date.now(), deadline = start + 120000, durations: number[] = []
  const counts = new Map<string, { count: number; title: unknown; family: string }>()
  const families = new Map<string, number>(), sessionUnique: number[] = []
  let attempted = 0, displayed = 0, empty = 0, failures = 0, fallback = 0
  const ownerId = args.includes('--curation') ? curatorOwnerId() : ''
  try {
    const db = client.db(database)
    const plan = await db.collection('items').aggregate([
      { $sample: { size: CATALOGUE_SAMPLE_SIZE } }, { $match: { type } }, { $limit: 96 },
    ], { timeoutMS: 2000, allowDiskUse: false }).explain('executionStats')
    console.log(JSON.stringify({ kind: 'sampling-plan', randomCursor: JSON.stringify(plan).includes('sampleFromRandomCursor'),
      note: 'A large collection should use the random cursor; inspect a false result before deployment.' }))
    for (let session = 0; session < sessions && Date.now() < deadline; session++) {
      let state = newSession(Math.floor(Math.random() * 0xffffffff))
      const unique = new Set<string>()
      for (let i = 0; i < draws && Date.now() < deadline; i++) {
        attempted++
        const ticket = planDraw(state, type as 'image' | 'video'), tick = performance.now()
        const choice = await selectPool(db, ticket, state, 'fr', row => ({ title: row.title ?? row.text }), Math.random, Date.now(), undefined, ownerId)
        durations.push(performance.now() - tick)
        if (!choice) { empty++; continue }
        displayed++; unique.add(choice.item.key)
        const before = counts.get(choice.item.key)
        counts.set(choice.item.key, { count: (before?.count ?? 0) + 1, title: choice.item.payload.title, family: choice.item.profile.family })
        families.set(choice.item.profile.family, (families.get(choice.item.profile.family) ?? 0) + 1)
        fallback += Number(choice.selection?.retrieval?.broadFallback)
        failures += choice.selection?.retrieval?.queryFailures ?? 0
        // The counter remains realistic; only the exposure memory is cleared.
        state = commitDraw(state, ticket, choice.item)
        if (withoutHistory) state = { ...state, recent: [], visualHistory: [], exposures: [] }
        if (attempted % 50 === 0) console.log(JSON.stringify({ kind: 'progress', attempted, unique: counts.size, empty, fallback, failures }))
      }
      sessionUnique.push(unique.size)
    }
  } finally { await client.close() }
  durations.sort((a, b) => a - b)
  console.log(JSON.stringify({ kind: 'pool-audit', readOnly: true, type, withoutHistory, curation: Boolean(ownerId),
    requested: draws * sessions, attempted, displayed, partial: attempted < draws * sessions, unique: counts.size, sessionUnique,
    exactReplays: displayed - counts.size, empty, fallback, queryFailures: failures,
    selectionP95Ms: Math.round(durations[Math.floor(durations.length * .95)] ?? 0), elapsedMs: Date.now() - start,
    families: Object.fromEntries(families), mostShown: [...counts].sort((a, b) => b[1].count - a[1].count).slice(0, 12)
      .map(([key, value]) => ({ key, ...value })),
    limitation: 'Catalogue/selection audit only; compare player display IDs and browser latency separately.' }, null, 2))
}
main().catch(() => { console.error('Read-only pool audit failed: inspect configuration, query plan and database connectivity.'); process.exitCode = 1 })
