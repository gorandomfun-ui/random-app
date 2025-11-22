#!/usr/bin/env node
import { MongoClient } from 'mongodb'

const uri = process.env.MONGODB_URI || process.env.MONGO_URI
const dbName = process.env.MONGODB_DB || process.env.MONGO_DB || 'randomapp'
const BATCH_SIZE = Number(process.env.RAND_BACKFILL_BATCH || 500)
const TYPES = ['image', 'video', 'quote', 'fact', 'joke', 'web']

if (!uri) {
  console.error('❌ Missing MONGODB_URI/MONGO_URI environment variable')
  process.exit(1)
}

async function ensureIndex(collection) {
  try {
    await collection.createIndex(
      { type: 1, rand: 1 },
      {
        name: 'type_rand_lookup',
        partialFilterExpression: { rand: { $exists: true } },
      },
    )
    console.log('✅ Index ensured: type_rand_lookup')
  } catch (error) {
    console.warn('⚠️  Unable to ensure index type_rand_lookup:', error.message)
  }
}

async function backfillType(collection, type) {
  let total = 0
  while (true) {
    const docs = await collection
      .find({
        type,
        $or: [{ rand: { $exists: false } }, { rand: { $not: { $type: 'double' } } }],
      })
      .project({ _id: 1 })
      .limit(BATCH_SIZE)
      .toArray()
    if (!docs.length) break

    const ops = docs.map((doc) => ({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: { rand: Math.random() } },
      },
    }))

    const res = await collection.bulkWrite(ops, { ordered: false })
    total += res.modifiedCount || 0
    console.log(`  ↻ ${type}: updated ${res.modifiedCount || 0} docs (total ${total})`)
  }
  console.log(`✅ ${type}: backfill complete (updated ${total} docs)`)
}

async function main() {
  const client = new MongoClient(uri)
  await client.connect()
  const db = client.db(dbName)
  const collection = db.collection('items')

  await ensureIndex(collection)

  for (const type of TYPES) {
    await backfillType(collection, type)
  }

  await client.close()
  console.log('✨ Backfill finished')
}

main().catch((error) => {
  console.error('❌ Backfill failed:', error)
  process.exit(1)
})
