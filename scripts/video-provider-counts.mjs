#!/usr/bin/env node
import { MongoClient } from 'mongodb'

const uri = process.env.MONGODB_URI || process.env.MONGO_URI
const dbName = process.env.MONGODB_DB || 'randomapp'

if (!uri) {
  console.error('❌ Missing MONGODB_URI/MONGO_URI environment variable')
  process.exit(1)
}

async function main() {
  const client = new MongoClient(uri)
  await client.connect()
  const db = client.db(dbName)
  const results = await db.collection('items').aggregate([
    { $match: { type: 'video' } },
    { $group: { _id: '$provider', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]).toArray()
  console.dir(results, { depth: null })
  await client.close()
}

main().catch((error) => {
  console.error('Script failed:', error)
  process.exit(1)
})
