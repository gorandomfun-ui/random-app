#!/usr/bin/env node
/*
 * Remove all Internet Archive sourced videos from the MongoDB `items` collection.
 * Usage:
 *   node scripts/remove-archive-videos.mjs        # delete for real
 *   node scripts/remove-archive-videos.mjs --dry  # preview counts only
 */
import { MongoClient } from 'mongodb'

const uri = process.env.MONGODB_URI || process.env.MONGO_URI
const dbName = process.env.MONGODB_DB || 'randomapp'
const isDryRun = process.argv.includes('--dry') || process.argv.includes('--dry-run')

if (!uri) {
  console.error('❌ Missing MONGODB_URI/MONGO_URI environment variable')
  process.exit(1)
}

const client = new MongoClient(uri)

async function main() {
  await client.connect()
  const db = client.db(dbName)
  const collection = db.collection('items')
  const filter = { type: 'video', provider: 'archive.org' }

  const count = await collection.countDocuments(filter)
  console.log(`Found ${count} archive.org videos${isDryRun ? ' (dry-run)' : ''}`)

  if (!count) return
  if (isDryRun) {
    const sample = await collection.find(filter).limit(5).project({ videoId: 1, title: 1, url: 1 }).toArray()
    console.log('Sample entries:', sample)
    return
  }

  const result = await collection.deleteMany(filter)
  console.log(`✅ Deleted ${result.deletedCount ?? 0} documents`)    
}

main()
  .catch((error) => {
    console.error('Script failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await client.close().catch(() => {})
  })
