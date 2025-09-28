#!/usr/bin/env node

/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require('fs')
const path = require('path')
const { MongoClient, ObjectId } = require('mongodb')

function loadEnv(envFile = '.env.local') {
  const envPath = path.join(process.cwd(), envFile)
  if (!fs.existsSync(envPath)) return
  for (const lineRaw of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = lineRaw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

function parseArgs(argv) {
  const opts = { dryRun: true }
  for (const arg of argv) {
    if (arg === '--execute') opts.dryRun = false
    else if (arg === '--dry-run') opts.dryRun = true
  }
  return opts
}

function looksLikeImage(url) {
  if (!url || typeof url !== 'string') return false
  if (url.startsWith('data:image/')) return true
  try {
    const parsed = new URL(url)
    const ext = parsed.pathname.split('.').pop()?.toLowerCase()
    if (!ext) return false
    return ['jpg','jpeg','png','gif','webp','avif','bmp','svg'].includes(ext)
  } catch {
    return false
  }
}

function buildPixabayReplacement(doc) {
  const candidates = [doc.thumb, doc.thumbUrl]
  for (const candidate of candidates) {
    if (!looksLikeImage(candidate)) continue
    const upgraded = candidate
      .replace(/__(\d+)(\.[a-z]+)$/i, '_1280$2')
      .replace(/_(\d+)(\.[a-z]+)$/i, '_1280$2')
    if (looksLikeImage(upgraded)) return upgraded
  }
  return null
}

async function main() {
  loadEnv()
  const opts = parseArgs(process.argv.slice(2))
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI
  if (!uri) {
    console.error('Missing MONGODB_URI/MONGO_URI in environment')
    process.exit(1)
  }
  const dbName = process.env.MONGODB_DB || process.env.MONGO_DB || 'randomapp'
  const client = new MongoClient(uri, { maxPoolSize: 1 })

  const summary = {
    duplicatesFound: 0,
    duplicatesRemoved: 0,
    pixabayExamined: 0,
    pixabayUpdated: 0,
    pixabayDeleted: 0,
    pixabayNoChange: 0,
  }

  try {
    await client.connect()
    const db = client.db(dbName)
    const coll = db.collection('items')

    // Step 1: remove duplicate URLs (keep the most recent _id)
    const duplicateGroups = await coll.aggregate([
      { $match: { type: 'image', url: { $exists: true, $ne: null, $ne: '' } } },
      { $group: { _id: '$url', ids: { $push: '$_id' }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ]).toArray()

    summary.duplicatesFound = duplicateGroups.reduce((acc, group) => acc + group.count - 1, 0)

    const duplicateIdsToDelete = []
    for (const group of duplicateGroups) {
      const ids = group.ids.map((id) => (typeof id === 'string' ? new ObjectId(id) : id))
      ids.sort((a, b) => (a.toString() < b.toString() ? 1 : -1)) // keep most recent (largest _id)
      const [, ...rest] = ids
      duplicateIdsToDelete.push(...rest)
    }

    if (!opts.dryRun && duplicateIdsToDelete.length) {
      const result = await coll.deleteMany({ _id: { $in: duplicateIdsToDelete } })
      summary.duplicatesRemoved = result.deletedCount || 0
    } else {
      summary.duplicatesRemoved = duplicateIdsToDelete.length
    }

    // Step 2: fix pixabay URLs that point to pixabay.com rather than cdn
    const cursor = coll.find({
      type: 'image',
      url: { $regex: /^https?:\/\/pixabay\.com\//i },
    }, {
      projection: {
        url: 1,
        thumb: 1,
        thumbUrl: 1,
        source: 1,
      },
    })

    const bulkOps = []
    const deleteIds = []
    let plannedUpdates = 0
    let plannedDeletes = 0

    while (await cursor.hasNext()) {
      const doc = await cursor.next()
      summary.pixabayExamined += 1
      const originalUrl = doc.url
      const replacement = opts.dryRun ? buildPixabayReplacement(doc) : buildPixabayReplacement(doc)

      if (replacement && replacement !== originalUrl && looksLikeImage(replacement)) {
        if (!opts.dryRun) {
          bulkOps.push({
            updateOne: {
              filter: { _id: doc._id },
              update: {
                $set: { url: replacement },
              },
            },
          })
        }
        plannedUpdates += 1
      } else if (!replacement || !looksLikeImage(replacement)) {
        // impossible to salvage: plan deletion
        if (!opts.dryRun) deleteIds.push(doc._id)
        plannedDeletes += 1
      } else {
        summary.pixabayNoChange += 1
      }

      if (bulkOps.length >= 200) {
        if (!opts.dryRun) {
          await coll.bulkWrite(bulkOps, { ordered: false })
          bulkOps.length = 0
        } else {
          bulkOps.length = 0
        }
      }
    }

    if (bulkOps.length && !opts.dryRun) {
      await coll.bulkWrite(bulkOps, { ordered: false })
    }

    if (deleteIds.length && !opts.dryRun) {
      const result = await coll.deleteMany({ _id: { $in: deleteIds } })
      summary.pixabayDeleted = result.deletedCount || 0
    } else {
      summary.pixabayDeleted = plannedDeletes
    }

    summary.pixabayUpdated = plannedUpdates

    console.log('Repair summary:', summary)
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error('repair-images failed:', error)
  process.exit(1)
})
