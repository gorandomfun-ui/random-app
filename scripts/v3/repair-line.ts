/**
 * Puts the ingestion line back on the videos that lost it.
 *
 *   node --env-file=.env.local --import tsx scripts/v3/repair-line.ts           # counts only
 *   node --env-file=.env.local --import tsx scripts/v3/repair-line.ts --apply
 *
 * Since 19 September the insert-time tagger wrote `legacy` over the `trend`
 * line of every trending video (the caller passed no line and the default
 * won). A video with a trend mark is a trending video, whatever its age:
 * the tagger's own rule (`detectLine`) says so, and the cool pool's trend
 * source tells fresh from stale by the era, not by the line.
 */

import { MongoClient } from 'mongodb'

import { count } from './reportFormat'

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI
  if (!uri) throw new Error('MONGODB_URI manquant')
  const apply = process.argv.includes('--apply')
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 20000 })
  await client.connect()
  try {
    const items = client.db(process.env.MONGODB_DB || process.env.MONGO_DB || 'randomdb').collection('items')
    console.log(apply ? 'Mode : ÉCRITURE\n' : 'Mode : rapport à blanc\n')
    const filter = { type: 'video', trendObservedAt: { $type: 'date' }, 'v3.line': 'legacy' }
    const recent = await items.countDocuments({ ...filter, trendObservedAt: { $gte: new Date(Date.now() - 14 * 86_400_000) } }, { hint: 'discovery_trend_v2', maxTimeMS: 120_000 })
    const all = await items.countDocuments(filter, { hint: 'discovery_trend_v2', maxTimeMS: 120_000 })
    console.log(`Vidéos tendance étiquetées « legacy » : ${count(all)} · dont des 14 derniers jours : ${count(recent)}`)
    if (!apply) { console.log('\nRelancer avec --apply pour corriger.'); return }
    const started = Date.now()
    const result = await items.updateMany(filter, { $set: { 'v3.line': 'trend' } }, { hint: 'discovery_trend_v2' })
    console.log(`Corrigées : ${count(result.modifiedCount)} en ${Math.round((Date.now() - started) / 1000)} s`)
  } finally {
    await client.close()
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
