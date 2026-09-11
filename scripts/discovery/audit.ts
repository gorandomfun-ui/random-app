/** Read-only readiness check. No provider calls, writes, or visitor behaviour. */
import { MongoClient } from 'mongodb'
async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI
  if (!uri) throw new Error('Database configuration required')
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 })
  try {
    const db = client.db(process.env.MONGODB_DB || process.env.MONGO_DB || 'randomapp')
    const items = db.collection('items')
    const estimatedItems = await items.estimatedDocumentCount({ maxTimeMS: 5000 })
    // A complete grouping of a million-item catalogue can time out and burden production.
    // A bounded random sample is sufficient for readiness; text coverage remains exact below.
    const sampleSize = Math.min(10000, estimatedItems)
    const coverage = sampleSize ? await items.aggregate([
      { $sample: { size: sampleSize } },
      { $group: { _id: { type: '$type', family: '$discoveryFamily', provider: '$provider', version: '$discoveryVersion', suppressed: '$isSuppressed' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ], { maxTimeMS: 30000 }).toArray() : []
    const textCoverage = await items.aggregate([{ $match: { type: { $in: ['quote', 'joke', 'fact'] } } },
      { $group: { _id: { type: '$type', languageScope: '$languageScope', lang: '$lang', variant: '$variant' }, count: { $sum: 1 } } },
      { $sort: { '_id.type': 1, '_id.languageScope': 1, '_id.lang': 1, '_id.variant': 1 } }], { maxTimeMS: 30000 }).toArray()
    const sampledStockFree = coverage.filter(row => row._id?.version === 2 && row._id?.suppressed !== true && ['video', 'image'].includes(row._id?.type) &&
      !['pexels', 'pixabay'].includes(row._id?.provider)).reduce((sum, row) => sum + row.count, 0)
    const estimatedStockFree = sampleSize ? Math.round(sampledStockFree / sampleSize * estimatedItems) : 0
    const indexes = (await items.listIndexes().toArray()).map(x => x.name)
    console.log(JSON.stringify({ readOnly: true, estimatedItems, sampleSize, estimatedStockFree, coverage, textCoverage, indexes,
      checksBeforeActivation: ['Enough non-stock playable videos and images', 'Universal quizzes or at least four localized quizzes per supported content language', 'Enough universal/localized texts for the 40-item history', 'discovery_family_rand_v2 index installed', 'Source profiles backfilled', 'Private preview exercised in a browser'] }, null, 2))
  } finally { await client.close() }
}
main().catch(() => { console.error('Read-only audit failed; check database access.'); process.exitCode = 1 })
