import { MongoClient } from 'mongodb'
import { backfillBatch } from '../../lib/discovery/backfill'
async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI
  if (!uri) throw new Error('MONGO_URI / MONGODB_URI required')
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 })
  try {
    const db = client.db(process.env.MONGODB_DB || process.env.MONGO_DB || 'randomapp')
    const batchesArg = process.argv.find(x => x.startsWith('--batches='))?.split('=')[1]
    const batches = Math.max(1, Math.min(50, Number(batchesArg) || 1)), deadline = Date.now() + 25000
    for (let i = 0; i < batches && Date.now() < deadline; i++) {
      const result = await backfillBatch(db)
      console.log(JSON.stringify(result))
      if (result.finished) break
    }
  } finally { await client.close() }
}
main().catch(() => { console.error('Backfill batch failed; cursor has not been advanced past failed writes.'); process.exitCode = 1 })
