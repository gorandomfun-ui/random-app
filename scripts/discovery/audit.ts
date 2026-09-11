/** Read-only readiness check. No provider calls, writes, or visitor behaviour. */
import { MongoClient } from 'mongodb'
async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI
  if (!uri) throw new Error('Database configuration required')
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 })
  try {
    const db = client.db(process.env.MONGODB_DB || process.env.MONGO_DB || 'randomapp')
    const items = db.collection('items')
    const coverage = await items.aggregate([{ $group: { _id: { type: '$type', family: '$discoveryFamily', provider: '$provider', version: '$discoveryVersion' }, count: { $sum: 1 } } }], { maxTimeMS: 15000 }).toArray()
    const textCoverage = await items.aggregate([{ $match: { type: { $in: ['quote', 'joke', 'fact'] } } },
      { $group: { _id: { type: '$type', lang: '$lang', variant: '$variant' }, count: { $sum: 1 } } }], { maxTimeMS: 15000 }).toArray()
    const stockFree = await items.countDocuments({ type: { $in: ['video', 'image'] }, provider: { $nin: ['pexels', 'pixabay'] }, discoveryVersion: 2, isSuppressed: { $ne: true } }, { maxTimeMS: 3000 })
    const indexes = (await items.listIndexes().toArray()).map(x => x.name)
    console.log(JSON.stringify({ readOnly: true, stockFree, coverage, textCoverage, indexes,
      checksBeforeActivation: ['Enough non-stock playable videos and images', 'At least four quizzes per supported content language', 'Enough distinct texts for the 40-item history', 'discovery_family_rand_v2 index installed', 'Source profiles backfilled', 'Private preview exercised in a browser'] }, null, 2))
  } finally { await client.close() }
}
main().catch(() => { console.error('Read-only audit failed; check database access.'); process.exitCode = 1 })
