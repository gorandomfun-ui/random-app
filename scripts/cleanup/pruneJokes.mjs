import fs from 'fs'
import path from 'path'
import { MongoClient, ObjectId } from 'mongodb'

const BLOCKED_KEYWORDS = ['hitler', 'nazi', 'holocaust', 'auschwitz', 'jew', 'jews', 'jewish']
const BLOCKED_PATTERNS = [
  /difference\s+between\s+a\s+pizza\s+and\s+a\s+black\s+man/i,
  new RegExp(`\\b(${BLOCKED_KEYWORDS.join('|')})\\b`, 'i'),
]

const CATEGORY_PATTERNS = [
  /^(short|best|funny|silly|corny|clean|halloween|christmas|holiday|kids?|child|family|knock[-\s]?knock|dad|one-liner|animal|school)\s+(jokes?|pranks?|puns?|stories|one-liners?)$/i,
  /^(jokes?|pranks?|puns?|one-liners?)\s*(for|about)\s+[a-z\s]{1,40}$/i,
  /^food\s*\+\s*recipes$/i,
  /^science\s+fiction\s+jokes!?$/i,
]

const NON_CONTENT_KEYWORDS = ['privacy', 'terms', 'cookies', 'notice', 'contact', 'subscribe', 'newsletter', 'recipes']

function loadEnv() {
  if (process.env.MONGODB_URI) return
  const envPath = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return
  const content = fs.readFileSync(envPath, 'utf8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const [key, ...rest] = trimmed.split('=')
    if (!key) continue
    const value = rest.join('=').trim()
    if (!process.env[key]) process.env[key] = value
  }
}

loadEnv()

function norm(value = '') {
  return value.replace(/\s+/g, ' ').trim()
}

function looksLikeCategoryLabel(text) {
  const trimmed = norm(text)
  if (!trimmed) return false
  if (CATEGORY_PATTERNS.some((pattern) => pattern.test(trimmed))) return true
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length
  const hasPunctuation = /[.!?]/.test(trimmed)
  const hasJokeKeyword = /\b(jokes?|pranks?|puns?|one-liners?)\b/i.test(trimmed)
  const lower = trimmed.toLowerCase()
  if (!hasPunctuation && hasJokeKeyword && wordCount <= 4) return true
  if (!hasPunctuation && !hasJokeKeyword && wordCount <= 2) return true
  if (!hasPunctuation && NON_CONTENT_KEYWORDS.some((keyword) => lower.includes(keyword))) return true
  return false
}

function isBlockedJoke(text) {
  if (!text) return false
  if (looksLikeCategoryLabel(text)) return true
  return BLOCKED_PATTERNS.some((pattern) => pattern.test(text))
}

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI
  const dbName = process.env.MONGODB_DB || 'randomapp'
  if (!uri) {
    console.error('Missing MONGODB_URI in env')
    process.exit(1)
  }
  const client = new MongoClient(uri)
  await client.connect()
  const db = client.db(dbName)
  const collection = db.collection('items')

  const cursor = collection.find({ type: 'joke' }, { projection: { text: 1 } })
  let scanned = 0
  let removed = 0
  const samples = []

  for await (const doc of cursor) {
    scanned += 1
    const text = typeof doc.text === 'string' ? doc.text : ''
    if (!text) continue
    if (!isBlockedJoke(text)) continue
    const id = doc._id
    if (id instanceof ObjectId) {
      const res = await collection.deleteOne({ _id: id })
      removed += res.deletedCount ?? 0
    } else if (typeof id === 'string' && ObjectId.isValid(id)) {
      const res = await collection.deleteOne({ _id: new ObjectId(id) })
      removed += res.deletedCount ?? 0
    } else {
      const res = await collection.deleteMany({ type: 'joke', text })
      removed += res.deletedCount ?? 0
    }
    if (samples.length < 10) samples.push(text)
  }

  console.log(JSON.stringify({ scanned, removed, samples }, null, 2))
  await client.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
