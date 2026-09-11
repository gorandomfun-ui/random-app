/** Explicit local/staging command. Never invoked automatically by importing a route. */
import { MongoClient } from 'mongodb'
import { installDiscoveryIndexes } from '../../lib/discovery/mongo'
import { installExplorationIndexes } from '../../lib/discovery/exploration'
import { installOwnerIndexes } from '../../lib/discovery/ownerStore'

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI
  if (!uri) throw new Error('MONGO_URI / MONGODB_URI required')
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 })
  try {
    const db = client.db(process.env.MONGODB_DB || process.env.MONGO_DB || 'randomapp')
    await installDiscoveryIndexes(db); await installExplorationIndexes(db); await installOwnerIndexes(db)
    console.log('Discovery V2 indexes installed')
  } finally { await client.close() }
}
main().catch(() => { console.error('Discovery setup failed; check DB access and migration logs.'); process.exitCode = 1 })
