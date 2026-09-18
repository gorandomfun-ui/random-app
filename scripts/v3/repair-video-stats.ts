/**
 * Fills in the missing view counts and publication dates.
 *
 *   node --env-file=.env.local --import tsx scripts/v3/repair-video-stats.ts --provider=dailymotion --apply
 *   node --env-file=.env.local --import tsx scripts/v3/repair-video-stats.ts --provider=youtube --apply
 *
 * Dailymotion is free. YouTube spends one quota unit per batch of 50, so the
 * run stops at --units (default 8,000) to leave room for the daily ingest.
 * Resumable per provider.
 */

import { MongoClient, type ObjectId } from 'mongodb'

import { fetchDailymotionStats, fetchYouTubeStats, type VideoStats } from '@/lib/v3/repair/videoStats'
import { count } from './reportFormat'

const CHECKPOINT_COLLECTION = 'v3_repair_checkpoints'
const BATCH = 50
const PAUSE_MS = 220

type Row = { _id: ObjectId; videoId?: string | null; title?: string | null }

const flag = (name: string) => process.argv.includes(`--${name}`)
function option(name: string, fallback: string): string {
  const raw = process.argv.find((argument) => argument.startsWith(`--${name}=`))
  return raw ? raw.split('=')[1] : fallback
}

/** Strips the "dailymotion:" prefix the catalogue stores on those ids. */
function bareId(videoId: string | null | undefined): string | null {
  if (!videoId) return null
  const bare = videoId.replace(/^dailymotion:/, '').trim()
  return bare || null
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI
  if (!uri) throw new Error('MONGODB_URI manquant')
  const provider = option('provider', 'dailymotion')
  if (provider !== 'dailymotion' && provider !== 'youtube') throw new Error('--provider=dailymotion|youtube')
  const apply = flag('apply')
  const maxUnits = Number(option('units', '8000'))

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 20000 })
  await client.connect()

  try {
    const db = client.db(process.env.MONGODB_DB || 'randomdb')
    const items = db.collection('items')
    const checkpointId = `video-stats-${provider}`

    // Only the videos actually missing something.
    const scope = {
      type: 'video',
      provider,
      $or: [{ viewCount: { $exists: false } }, { publishedAt: { $exists: false } }],
    }
    const total = await items.countDocuments(scope)
    console.log(`${provider} : ${count(total)} vidéos sans vues ou sans date`)
    console.log(apply ? 'Mode : ÉCRITURE\n' : 'Mode : rapport à blanc\n')

    const checkpoint = await db.collection(CHECKPOINT_COLLECTION).findOne({ _id: checkpointId as never })
    let afterId = flag('restart') ? null : ((checkpoint as { lastId?: ObjectId } | null)?.lastId ?? null)

    let done = 0
    let filled = 0
    let gone = 0
    let units = 0
    const started = Date.now()

    while (units < maxUnits) {
      const rows = (await items
        .find({ ...scope, ...(afterId ? { _id: { $gt: afterId } } : {}) }, { projection: { videoId: 1, title: 1 }, sort: { _id: 1 }, limit: BATCH })
        .toArray()) as unknown as Row[]
      if (!rows.length) break

      const ids = rows.map((row) => bareId(row.videoId)).filter((id): id is string => Boolean(id))
      let stats: VideoStats[] = []
      try {
        stats = provider === 'youtube' ? await fetchYouTubeStats(ids) : await fetchDailymotionStats(ids)
        units += 1
      } catch (error) {
        console.error(`\nArrêt : ${(error as Error).message}`)
        console.error('Point de reprise enregistré, relancer plus tard reprendra ici.')
        break
      }

      const byId = new Map(stats.map((stat) => [stat.videoId, stat]))
      const operations = rows.flatMap((row) => {
        const stat = byId.get(bareId(row.videoId) ?? '')
        if (!stat) return []
        const set: Record<string, unknown> = { statsObservedAt: new Date() }
        if (stat.viewCount != null) set.viewCount = stat.viewCount
        if (stat.publishedAt) set.publishedAt = stat.publishedAt
        if (stat.unavailable) {
          set.obsoleteVideoStatus = 'obsolete'
          set.obsoleteVideoReason = `stats-${provider}-unavailable`
          gone += 1
        }
        if (stat.viewCount != null || stat.publishedAt) filled += 1
        return [{ updateOne: { filter: { _id: row._id }, update: { $set: set } } }]
      })

      if (apply && operations.length) await items.bulkWrite(operations, { ordered: false })
      afterId = rows[rows.length - 1]._id
      if (apply) {
        await db
          .collection(CHECKPOINT_COLLECTION)
          .updateOne({ _id: checkpointId as never }, { $set: { lastId: afterId, updatedAt: new Date() } }, { upsert: true })
      }

      done += rows.length
      if (done % 2500 === 0) {
        const perMinute = Math.round((done / (Date.now() - started)) * 60000)
        console.log(`  ${count(done)} traités · ${count(filled)} complétés · ${count(gone)} indisponibles · ~${count(perMinute)}/min`)
      }
      if (!apply && done >= 200) break
      await new Promise((resolve) => setTimeout(resolve, PAUSE_MS))
    }

    console.log(`\nTraités ${count(done)} · complétés ${count(filled)} · indisponibles ${count(gone)} · unités de quota ${count(units)}`)
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
