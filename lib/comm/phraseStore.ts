/** The ready-made lines in comm_phrases: the seed written once, then the curator's own additions and edits. */

import { ObjectId, type Db } from 'mongodb'

import { COMM_PHRASES } from './model'
import { seedPhrases, type Phrase } from './caption'

const QUERY_MS = 2500
let seeded: Promise<void> | null = null

export async function ensureSeedPhrases(db: Db): Promise<void> {
  if (!seeded) {
    seeded = (async () => {
      const count = await db.collection(COMM_PHRASES).countDocuments({ seed: true }, { maxTimeMS: QUERY_MS })
      if (count === 0) await db.collection(COMM_PHRASES).insertMany(seedPhrases().map((phrase) => ({ family: phrase.family, lang: phrase.lang, text: phrase.text, seed: true, createdAt: new Date() })))
    })().catch(() => { seeded = null })
  }
  await seeded
}

export async function listPhrases(db: Db): Promise<Phrase[]> {
  await ensureSeedPhrases(db)
  const rows = await db.collection(COMM_PHRASES).find({}, { sort: { family: 1, lang: 1, text: 1 }, maxTimeMS: QUERY_MS }).toArray()
  return rows.map((row) => ({ _id: String(row._id), family: row.family, lang: row.lang, text: String(row.text ?? ''), seed: row.seed === true }))
}

const FAMILIES = ['decouverte', 'invitation', 'reaction', 'serie', 'vide']

export function validPhrase(input: unknown): Phrase | null {
  const p = input as Partial<Phrase> | null
  if (!p || typeof p !== 'object') return null
  if (!FAMILIES.includes(p.family as string) || (p.lang !== 'fr' && p.lang !== 'en') || typeof p.text !== 'string' || p.text.length > 140) return null
  if (p.family !== 'vide' && !p.text.trim()) return null
  return { family: p.family as Phrase['family'], lang: p.lang, text: p.text.trim() }
}

export async function savePhrase(db: Db, input: unknown, id?: string): Promise<Phrase | null> {
  const phrase = validPhrase(input)
  if (!phrase) return null
  if (id) {
    if (!ObjectId.isValid(id)) return null
    const result = await db.collection(COMM_PHRASES).findOneAndUpdate({ _id: new ObjectId(id) }, { $set: { ...phrase, updatedAt: new Date() } }, { returnDocument: 'after' })
    return result ? { ...phrase, _id: id, seed: result.seed === true } : null
  }
  const doc = { family: phrase.family, lang: phrase.lang, text: phrase.text }
  const inserted = await db.collection(COMM_PHRASES).insertOne({ ...doc, createdAt: new Date() })
  return { ...doc, _id: String(inserted.insertedId) }
}

export async function deletePhrase(db: Db, id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false
  return (await db.collection(COMM_PHRASES).deleteOne({ _id: new ObjectId(id) })).deletedCount === 1
}
