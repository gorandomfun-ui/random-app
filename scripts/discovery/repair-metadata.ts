/** Small independent maintenance pass, never invoked by a Random or Wave request. */
import { MongoClient } from 'mongodb'
import { acquireDiscoveryRun, releaseDiscoveryRun } from '../../lib/discovery/runner'
import { repairMetadataBatch, sampleMetadataRepairs } from '../../lib/discovery/metadataRepair'
import { installOwnerIndexes } from '../../lib/discovery/ownerStore'

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI
  const database = process.env.MONGODB_DB || process.env.MONGO_DB
  if (!uri || !database) throw new Error('Explicit database configuration required')
  const indexOnly = process.argv.includes('--index-only')
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000, socketTimeoutMS: indexOnly ? 0 : 25000 })
  const db = client.db(database), controller = new AbortController()
  const apply = process.argv.includes('--apply')
  const deadline = setTimeout(() => process.exit(1), indexOnly ? 600000 : 90000)
  const stop = () => controller.abort()
  process.once('SIGINT', stop); process.once('SIGTERM', stop)
  let lock: string | null = null
  try {
    if (indexOnly) { await installOwnerIndexes(db); console.log('Owner indexes installed; no items index or profile migration.'); return }
    lock = await acquireDiscoveryRun(db, 90000)
    if (!lock) { console.log('Metadata repair skipped: active discovery runner.'); return }
    for (const provider of ['youtube', 'dailymotion'] as const) {
      if (controller.signal.aborted) break
      try {
        const rows = await sampleMetadataRepairs(db, provider, Date.now())
        if (!apply) { console.log(JSON.stringify({ provider, sampled: rows.length, dryRun: true })); continue }
        const result = await repairMetadataBatch(db, provider, rows, { signal: controller.signal })
        console.log(JSON.stringify(result))
      } catch {
        console.error(JSON.stringify({ provider, status: 'failed', message: 'Bounded repair failed; ingestion remains independent.' }))
        process.exitCode = 1
      }
    }
  } finally {
    try { if (lock) await releaseDiscoveryRun(db, lock) }
    finally { await client.close(); clearTimeout(deadline); process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop) }
  }
}
main().catch(() => { console.error('Metadata maintenance failed; inspect configuration and provider status.'); process.exitCode = 1 })
