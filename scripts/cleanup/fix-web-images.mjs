import pkg from '@next/env'
const { loadEnvConfig } = pkg
import { MongoClient } from 'mongodb'
import probe from 'probe-image-size'

loadEnvConfig(process.cwd())

const uri = process.env.MONGO_URI || process.env.MONGODB_URI
const dbName = process.env.MONGODB_DB || process.env.MONGO_DB || 'randomapp'

if (!uri) {
  console.error('Missing MONGO_URI/MONGODB_URI')
  process.exit(1)
}

const MIN_IMAGE_WIDTH = 500
const MIN_IMAGE_HEIGHT = 280
const MIN_IMAGE_AREA = 150000
const MIN_IMAGE_BYTES = 15000
const MIN_ASPECT_RATIO = 0.35
const MAX_ASPECT_RATIO = 3.2
const BATCH_LIMIT = Number(process.env.WEB_FIX_BATCH || '200')
const CONCURRENCY = Number(process.env.WEB_FIX_CONCURRENCY || '8')

function isValidImageUrl(url) {
  if (!url) return false
  if (!/^https?:\/\//i.test(url)) return false
  const lower = url.toLowerCase()
  if (lower.startsWith('data:')) return false
  const EXT = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif']
  return EXT.some((ext) => lower.includes(ext))
}

async function validateRemoteImage(url) {
  try {
    const result = await probe(url, {
      rejectUnauthorized: false,
      timeout: { response: 2500, deadline: 4500 },
    })
    if (!result?.width || !result?.height) return null
    const { width, height } = result
    if (width < MIN_IMAGE_WIDTH || height < MIN_IMAGE_HEIGHT) return null
    if (width * height < MIN_IMAGE_AREA) return null
    const ratio = width / height
    if (ratio < MIN_ASPECT_RATIO || ratio > MAX_ASPECT_RATIO) return null
    const length = Number(result.length || result.size || 0)
    if (Number.isFinite(length) && length > 0 && length < MIN_IMAGE_BYTES) return null
    const resolved = typeof result.url === 'string' && result.url.startsWith('http') ? result.url : url
    return { url: resolved, width, height }
  } catch (error) {
    return null
  }
}

async function fetchOgImage(link) {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 2000)
    const res = await fetch(link, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (RandomApp Bot)' },
    })
    clearTimeout(timer)
    if (!res.ok) return null
    const html = await res.text()
    const pick = (regex) => regex.exec(html)?.[1]
    const m1 = pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    const m2 = pick(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
    const img = m1 || m2 || pick(/<img[^>]+src=["']([^"']+)["']/i)
    if (!img) return null
    try {
      return new URL(img, link).toString()
    } catch {
      return img
    }
  } catch {
    return null
  }
}

async function main() {
  const client = new MongoClient(uri)
  await client.connect()
  const db = client.db(dbName)
  const collection = db.collection('items')
  let totalChecked = 0
  let totalUpdated = 0
  let totalDeleted = 0

  while (true) {
    const filter = { type: 'web', $or: [{ webImageValidatedAt: { $exists: false } }, { webImageValidatedAt: null }] }
    const docs = await collection.find(filter).sort({ updatedAt: 1, _id: 1 }).limit(BATCH_LIMIT).toArray()
    if (!docs.length) break

    console.log(`Processing batch of ${docs.length} web documents…`)
    let checked = 0
    let updated = 0
    let deleted = 0

    async function processDoc(doc) {
      checked += 1
      totalChecked += 1
      const id = doc._id
      const url = doc.url
      let og = doc.ogImage || null
      let meta = null
      if (isValidImageUrl(og)) {
        meta = await validateRemoteImage(og)
      }
      if (!meta) {
        og = await fetchOgImage(url)
        if (isValidImageUrl(og)) {
          meta = await validateRemoteImage(og)
        }
      }
      if (!meta) {
        await collection.deleteOne({ _id: id })
        deleted += 1
        totalDeleted += 1
        return
      }
      const now = new Date()
      if (meta.url !== doc.ogImage || !doc.webImageValidatedAt) {
        await collection.updateOne(
          { _id: id },
          {
            $set: {
              ogImage: meta.url,
              updatedAt: now,
              webImageValidatedAt: now,
              webImageValidation: { width: meta.width, height: meta.height },
            },
          },
        )
        updated += 1
        totalUpdated += 1
      } else {
        await collection.updateOne(
          { _id: id },
          {
            $set: {
              webImageValidatedAt: now,
              webImageValidation: { width: meta.width, height: meta.height },
            },
          },
        )
      }
    }

    const queue = docs.slice()
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker())
    await Promise.all(workers)

    async function worker() {
      while (queue.length) {
        const doc = queue.shift()
        if (!doc) break
        try {
          await processDoc(doc)
        } catch (error) {
          console.error('Failed to process doc', doc._id, error)
        }
      }
    }

    console.log('Batch done', { checked, updated, deleted })
  }

  console.log('All done', { totalChecked, totalUpdated, totalDeleted })
  await client.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
