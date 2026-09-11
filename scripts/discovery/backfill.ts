import { MongoClient } from 'mongodb'
import { backfillBatch } from '../../lib/discovery/backfill'
async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI
  if (!uri) throw new Error('MONGO_URI / MONGODB_URI required')
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 })
  try {
    const db = client.db(process.env.MONGODB_DB || process.env.MONGO_DB || 'randomapp')
    const batchesArg = process.argv.find(x => x.startsWith('--batches='))?.split('=')[1]
    const limitArg = process.argv.find(x => x.startsWith('--limit='))?.split('=')[1]
    const secondsArg = process.argv.find(x => x.startsWith('--seconds='))?.split('=')[1]
    const progressArg = process.argv.find(x => x.startsWith('--progress-every='))?.split('=')[1]
    const batches = Math.max(1, Math.min(2000, Number(batchesArg) || 1))
    const maxRuntimeMs = secondsArg ? Math.max(5, Math.min(900, Number(secondsArg) || 25)) * 1000 : 25000
    const progressEvery = Math.max(1, Math.min(100, Number(progressArg) || 1))
    const deadline = Date.now() + maxRuntimeMs
    const limit = Math.max(1, Math.min(500, Number(limitArg) || 200))
    let totalProcessed = 0
    for (let i = 0; i < batches && Date.now() < deadline; i++) {
      const result = await backfillBatch(db, limit)
      totalProcessed += result.processed
      if (result.finished || (i + 1) % progressEvery === 0) {
        console.log(JSON.stringify({ batches: i + 1, totalProcessed, ...result }))
      }
      if (result.finished) break
    }
  } finally { await client.close() }
}
main().catch(() => { console.error('Backfill batch failed; cursor has not been advanced past failed writes.'); process.exitCode = 1 })
