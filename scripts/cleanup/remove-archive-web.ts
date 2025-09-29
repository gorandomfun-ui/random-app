import { MongoClient } from 'mongodb'

async function run() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI
  const dbName = process.env.MONGODB_DB || 'randomapp'
  if (!uri) {
    console.error('Missing MONGODB_URI (or MONGO_URI) in env')
    process.exit(1)
  }

  const client = new MongoClient(uri)
  await client.connect()
  const db = client.db(dbName)
  const collection = db.collection('items')

  const filter = { type: 'web', provider: 'archive-webring' }
  const count = await collection.countDocuments(filter)
  if (!count) {
    console.log('No archive-webring documents found.')
    await client.close()
    return
  }

  const res = await collection.deleteMany(filter)
  console.log(`Removed ${res.deletedCount} documents (out of ${count} matches).`)

  await client.close()
}

run().catch((error) => {
  console.error('Failed to remove archive web documents:', error)
  process.exit(1)
})
