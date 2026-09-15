/** GitHub-only, bounded maintenance. Does not launch a catalogue migration. */
import { MongoClient } from 'mongodb'
import { acquireDiscoveryRun, releaseDiscoveryRun } from '../../lib/discovery/runner'
import { installSubjectWorkIndexes } from '../../lib/discovery/subjectWork'
import { maintainSubjects } from '../../lib/discovery/subjectMaintenance'

async function main() {
  if (process.env.RANDOM_SUBJECT_MAINTENANCE_ENABLED === '0') { console.log('Subject maintenance disabled'); return }
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI, database = process.env.MONGODB_DB || process.env.MONGO_DB
  if (!uri || !database) throw new Error('Explicit database configuration required')
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 4000, connectTimeoutMS: 4000, socketTimeoutMS: 6000 })
  const db = client.db(database), controller = new AbortController()
  const cancel = () => controller.abort()
  const graceful = setTimeout(cancel, 65000), hard = setTimeout(() => process.exit(1), 75000)
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel)
  let lock: string | null = null
  try {
    if (process.argv.includes('--index-only')) { await installSubjectWorkIndexes(db); console.log('Small subject queue/cache indexes installed.'); return }
    if (!process.argv.includes('--apply')) { console.log('Pass --apply to process up to 12 queued items. No change made.'); return }
    lock = await acquireDiscoveryRun(db, 90000)
    if (!lock) { console.log('Skipped: another discovery runner holds the lease.'); return }
    console.log(JSON.stringify(await maintainSubjects(db, { signal: controller.signal })))
  } finally {
    try { if (lock) await releaseDiscoveryRun(db, lock) }
    finally { await client.close(); clearTimeout(graceful); clearTimeout(hard); process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel) }
  }
}
main().catch(() => { console.error('Subject maintenance failed; see sanitized counters and provider status.'); process.exitCode = 1 })
