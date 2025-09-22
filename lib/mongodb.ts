// lib/mongodb.ts
import type { Db } from 'mongodb'
import { getDb as getSharedDb } from './db'

const DEFAULT_DB = process.env.MONGODB_DB || process.env.MONGO_DB || 'randomapp'

export async function getDatabase(): Promise<Db> {
  return getSharedDb(DEFAULT_DB)
}

export const getDb = getDatabase
