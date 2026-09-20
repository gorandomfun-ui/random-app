import type { Db } from 'mongodb'
import { seeded } from './random'
import type { VideoIngestStage } from '../ingest/videos'
import { enqueue, quotaConfigFromEnv, runExploration, youtubePageLoader, type DiscoveryProvider, type ExplorationStage } from './exploration'
import { dailymotionPageLoader, type DailymotionSpec } from './dailymotion'
import { createSearchSeeds } from './seeds'
import { enqueueOwnerExploration, type OwnerSchedulingReport } from './subjectExploration'
import { capPerSource } from './likeCaps'

export type DiscoveryStage = 'seeding' | 'exploring' | 'completed' | ExplorationStage | VideoIngestStage
export type DiscoveryBatchOptions = { provider?: DiscoveryProvider; seed?: boolean; maxMs?: number; signal?: AbortSignal;
  onStage?: (stage: DiscoveryStage) => void }

export async function runDiscoveryBatch(db: Db, options: DiscoveryBatchOptions = {}) {
  if (process.env.RANDOM_DISCOVERY_WORKER_ENABLED !== '1') throw new Error('Discovery worker disabled')
  const providers: DiscoveryProvider[] = []
  if (options.provider !== 'dailymotion' && process.env.RANDOM_YOUTUBE_QUOTA_ENABLED === '1' && process.env.YOUTUBE_API_KEY) providers.push('youtube')
  if (options.provider !== 'youtube' && process.env.RANDOM_DM_DISCOVERY_ENABLED === '1') providers.push('dailymotion')
  if (!providers.length) throw new Error('No configured discovery provider')
  const quota = providers.includes('youtube') ? quotaConfigFromEnv() : undefined
  const started = Date.now(), maxMs = Math.max(15000, Math.min(90000, options.maxMs ?? 90000))
  const random = seeded(Math.floor(started / 86400000))
  let ownerSearchesEnqueued = 0, ownerSchedulingFailed = false
  let ownerScheduling: OwnerSchedulingReport | undefined

  if (options.seed !== false && !options.signal?.aborted) {
    options.onStage?.('seeding')
    let rotation = Math.floor(started / 3600000)
    try {
      const cursor = await db.collection<{ _id: string; sequence: number }>('discovery_scheduler_v2').findOneAndUpdate(
        { _id: 'search-seed-rotation' }, { $inc: { sequence: 1 } },
        { upsert: true, returnDocument: 'after', maxTimeMS: 700 },
      )
      if (cursor) rotation = cursor.sequence - 1
    } catch { /* Time-based rotation remains a bounded fallback. */ }
    const seeds = createSearchSeeds(random, started, 20, undefined, rotation)
    if (providers.includes('youtube')) {
      await Promise.all(seeds.map(spec => enqueue(db, spec)))
      const trends = await db.collection('items').find({ type: 'video', provider: 'youtube', channelId: { $type: 'string' },
        trendObservedAt: { $gte: new Date(started - 7 * 86400000) } }).sort({ trendObservedAt: -1 }).limit(16).maxTimeMS(700).toArray().catch(() => [])
      await Promise.all([...new Set(trends.map(x => String(x.channelId)))].slice(0, 4)
        .map(channelId => enqueue(db, { kind: 'channel', channelId })))
    }
    try { ownerSearchesEnqueued = await enqueueOwnerExploration(db, started, rotation, providers, report => { ownerScheduling = report }) }
    catch { ownerSchedulingFailed = true }
    if (providers.includes('dailymotion')) {
      const dailymotionSeeds: DailymotionSpec[] = []
      for (const spec of seeds.slice(0, 6)) if (spec.kind === 'search') dailymotionSeeds.push({
        kind: 'dailymotion', query: spec.query, after: spec.after, before: spec.before, sort: 'relevance', coverage: spec.coverage,
      })
      const categories = ['creation', 'music', 'sport', 'tech', 'travel', 'shortfilms', 'people', 'tv', 'videogames', 'fun', 'lifestyle']
      for (let i = 0; i < 4; i++) {
        const year = 2007 + Math.floor(random() * (new Date(started).getUTCFullYear() - 2007))
        dailymotionSeeds.push({ kind: 'dailymotion', category: categories[Math.floor(random() * categories.length)],
          after: new Date(i < 2 ? started - 90 * 86400000 : Date.UTC(year, 0, 1)).toISOString(),
          before: new Date(i < 2 ? started : Date.UTC(year + 1, 0, 1)).toISOString(),
          sort: i < 2 ? 'recent' : i % 2 ? 'old' : 'least-visited' })
      }
      await Promise.all(dailymotionSeeds.map(spec => enqueue(db, spec)))
    }
  }

  const { finalizeVideoIngest } = await import('../ingest/videos')
  const youtube = providers.includes('youtube') ? youtubePageLoader(process.env.YOUTUBE_API_KEY!) : null
  const dailymotion = dailymotionPageLoader()
  options.onStage?.('exploring')
  const report = await runExploration({ db, quota, random, maxMs: Math.max(0, maxMs - (Date.now() - started)),
    provider: options.provider ?? (providers.length === 1 ? providers[0] : undefined), signal: options.signal,
    onStage: options.onStage,
    loadPage: async (task, signal, permit) => {
      const page = task.spec.kind === 'dailymotion' ? await dailymotion(task, signal, permit)
        : youtube ? await youtube(task, signal, permit) : await Promise.reject(new Error('youtube-unconfigured'))
      // A page fetched for a like keeps a few videos per channel and per family.
      return task.spec.focus?.ownerId ? { ...page, videos: capPerSource(page.videos) } : page
    },
    ingest: videos => finalizeVideoIngest(videos, { dryRun: false, sampleSize: 0, warnings: [], skipDetails: true,
      insertOnly: true, onStage: options.onStage, conservativeRoutineInitialization: true }) })
  options.onStage?.('completed')
  return { ...report, ownerSearchesEnqueued, ownerSchedulingFailed, ownerScheduling }
}
