/** Read-only audit of actual references and queued work. Never calls a video provider or modifies data. */
import { MongoClient, ObjectId } from 'mongodb'
import { curatorOwnerId } from '../../lib/discovery/curatorAuth'
import { loadOwnerReferences } from '../../lib/discovery/ownerStore'
import { loadWave } from '../../lib/discovery/mongo'
import { writeFile } from 'node:fs/promises'
import { seeded } from '../../lib/discovery/random'
import { inspectCuration } from '../../lib/discovery/curationInspection'
import type { CatalogueRow } from '../../lib/discovery/catalog'

// Source and availability fields only. No user credentials, likes or database configuration.
const exportRow = (row: CatalogueRow) => Object.fromEntries([
  '_id', 'type', 'provider', 'videoId', 'url', 'title', 'description', 'sourceMetadata', 'discoveryProfile',
  'discoveryVersion', 'discoveryProvenance', 'metadataRefreshedAt', 'apiTags', 'text', 'quiz', 'variant', 'lang',
  'sourceStatus', 'obsoleteVideoStatus', 'obsoleteVideoRuntimeBlockedUntil', 'isSuppressed', 'channelId',
  'creatorId', 'channelTitle', 'categoryId', 'liveBroadcastContent', 'verifiedSeriesKey', 'verifiedDuplicateKey', 'editorialRoutine',
].filter(key => row[key] !== undefined).map(key => [key, row[key]]))

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI, database = process.env.MONGODB_DB || process.env.MONGO_DB
  if (!uri || !database) throw new Error('Explicit database configuration required')
  const args = process.argv.slice(2), waves = args.includes('--waves'), idsAt = args.indexOf('--ids')
  const outAt = args.indexOf('--out'), output = outAt >= 0 ? args[outAt + 1] : undefined
  if (outAt >= 0 && (!output || output.startsWith('--') || !waves)) throw new Error('--out requires --waves and a filename')
  const cases: unknown[] = []
  const explicit = idsAt >= 0 ? [...new Set((args[idsAt + 1] ?? '').split(','))] : []
  if (explicit.length > 20 || explicit.some(id => !ObjectId.isValid(id))) throw new Error('Supply at most 20 valid item IDs')
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000, socketTimeoutMS: 10000 })
  const deadline = setTimeout(() => { console.error('Read-only verification reached its deadline.'); process.exit(1) }, 150000)
  try {
    const db = client.db(database), ownerId = curatorOwnerId(), refs = (await loadOwnerReferences(db, ownerId)).slice(0, 20)
    for (const ref of refs) {
      if (ref.itemId) {
        const status = await inspectCuration(db, ownerId, ref.itemId)
        console.log(JSON.stringify({ kind: 'curation-status', ...status }))
      }

    }
    const ids = explicit.length ? explicit : refs.flatMap(r => r.itemId ? [r.itemId] : [])
    if (waves) for (const id of ids.slice(0, 20)) {
      const started = performance.now()
      try {
        const now = Date.now(), captured: CatalogueRow[] = [], seed = 17 + cases.length
        const anchorRow = output ? await db.collection('items').findOne({ _id: new ObjectId(id) }, { timeoutMS: 1000 }) : null
        const result = await loadWave(db, id, 'fr', ['video', 'image', 'fact', 'quote', 'joke', 'web'],
          row => ({ title: row.title ?? row.text, url: row.url }), seeded(seed), now, [], rows => captured.push(...rows))
        if (output && anchorRow) cases.push({ id, now, seed, anchor: exportRow(anchorRow), candidates: captured.map(exportRow),
          diagnostics: result?.diagnostics, observedReady: result?.plan.ready ?? false,
          observedTrio: result?.plan.ready ? result.plan.trio.map(c => ({ key: c.key, relation: result.plan.ready ? result.plan.relations[c.key] : null })) : [],
          review: null })
        console.log(JSON.stringify({ kind: 'wave', id, ms: Math.round(performance.now() - started),
          ready: result?.plan.ready ?? false, diagnostics: result?.diagnostics,
          anchorSubject: result?.anchor.profile.subject, anchorMetadataQuality: result?.anchor.profile.metadataQuality,
          trio: result?.plan.ready ? result.plan.trio.map(c => ({ key: c.key, type: c.type, quiz: c.quiz,
            payload: c.payload, subject: c.profile.subject?.primary, treatments: c.profile.subject?.treatments,
            relation: result.plan.ready ? result.plan.relations[c.key] : null })) : [],
          humanReviewRequired: true }))
      } catch { console.log(JSON.stringify({ kind: 'wave', id, error: 'retrieval-failed', ms: Math.round(performance.now() - started) })) }
    }
    if (output) await writeFile(output, JSON.stringify({ schema: 'random-wave-audit-v1', readOnly: true,
      note: 'Actual source snapshots and bounded retrieval results. review:null means editorial relevance has NOT been approved.', cases }, null, 2), { flag: 'wx', mode: 0o600 })
  } finally { clearTimeout(deadline); await client.close() }
}
main().catch(() => { console.error('Read-only audit failed: check configuration, indexes and database connectivity.'); process.exitCode = 1 })
