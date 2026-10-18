// lib/db.ts
import { MongoClient } from 'mongodb'

const uri = process.env.MONGO_URI || process.env.MONGODB_URI
if (!uri) {
  throw new Error('Missing MONGO_URI / MONGODB_URI in .env.local')
}

const DEFAULT_DB = process.env.MONGODB_DB || process.env.MONGO_DB || 'randomapp'

/**
 * A base that does not answer is given up after a few seconds instead of
 * holding a function until Vercel's limit: each second waited counts in the
 * free plan's allowance (96 calls ran to the limit between 18 September and
 * 18 October). Long queries are not cut: only finding the base and connecting.
 */
const CLIENT_OPTIONS = { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000 }

let client: MongoClient
let clientPromise: Promise<MongoClient>

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined
}

if (process.env.NODE_ENV === 'development') {
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, CLIENT_OPTIONS)
    global._mongoClientPromise = client.connect()
  }
  clientPromise = global._mongoClientPromise!
} else {
  client = new MongoClient(uri, CLIENT_OPTIONS)
  clientPromise = client.connect()
}

export default clientPromise

export async function getDb(dbName?: string) {
  const c = await clientPromise
  return c.db(dbName ?? DEFAULT_DB)
}
