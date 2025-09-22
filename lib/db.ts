// lib/db.ts
import { MongoClient } from 'mongodb'

const uri = process.env.MONGO_URI || process.env.MONGODB_URI
if (!uri) {
  throw new Error('Missing MONGO_URI / MONGODB_URI in .env.local')
}

const DEFAULT_DB = process.env.MONGODB_DB || process.env.MONGO_DB || 'randomapp'

let client: MongoClient
let clientPromise: Promise<MongoClient>

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined
}

if (process.env.NODE_ENV === 'development') {
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri)
    global._mongoClientPromise = client.connect()
  }
  clientPromise = global._mongoClientPromise!
} else {
  client = new MongoClient(uri)
  clientPromise = client.connect()
}

export default clientPromise

export async function getDb(dbName?: string) {
  const c = await clientPromise
  return c.db(dbName ?? DEFAULT_DB)
}
