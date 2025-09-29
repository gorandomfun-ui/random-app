const fs = require('fs')
const path = require('path')
const { MongoClient } = require('mongodb')

function loadEnv(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    raw.split(/\r?\n/).forEach((line) => {
      if (!line || line.trim().startsWith('#')) return
      const idx = line.indexOf('=')
      if (idx <= 0) return
      const key = line.slice(0, idx).trim()
      const value = line.slice(idx + 1).trim()
      if (!process.env[key] && key) {
        process.env[key] = value
      }
    })
  } catch (error) {
    // ignore missing file
  }
}

async function run() {
  loadEnv(path.resolve(process.cwd(), '.env.local'))
  loadEnv(path.resolve(process.cwd(), '.env'))
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
