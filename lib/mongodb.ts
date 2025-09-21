// lib/mongodb.ts
import { MongoClient, Db } from 'mongodb'

let _client: MongoClient | null = null
let _db: Db | null = null

export async function getDatabase(): Promise<Db> {
  // accepte MONGODB_URI ou MONGO_URI (tu as les deux dans .env.local)
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI
  const dbName = process.env.MONGODB_DB || 'randomapp'
  if (!uri) throw new Error('Missing MONGODB_URI')

  if (!_client) _client = new MongoClient(uri)
  if (!_db) {
    await _client.connect()
    _db = _client.db(dbName)
  }
  return _db
}

// alias pratique si certaines routes importent getDb
export const getDb = getDatabase
