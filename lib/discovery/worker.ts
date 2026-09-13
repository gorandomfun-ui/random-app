import type { Db } from 'mongodb'
import { seeded } from './random'
import { enqueue, quotaConfigFromEnv, runExploration, youtubePageLoader } from './exploration'
import { dailymotionPageLoader, type DailymotionSpec } from './dailymotion'
import { createSearchSeeds } from './seeds'

export async function runDiscoveryBatch(db: Db) {
  if (process.env.RANDOM_DISCOVERY_WORKER_ENABLED !== '1' || process.env.RANDOM_YOUTUBE_QUOTA_ENABLED !== '1') throw new Error('Discovery worker disabled')
  const quota = quotaConfigFromEnv()
  const { finalizeVideoIngest } = await import('../ingest/videos')
    const now = Date.now(), random = seeded(Math.floor(now / 86400000))
    const seeds = createSearchSeeds(random, now, 20)
    await Promise.all(seeds.map(spec => enqueue(db, spec)))
    if (process.env.RANDOM_DM_DISCOVERY_ENABLED === '1') {
      const dailymotionSeeds: DailymotionSpec[] = []
      for (const spec of seeds.slice(0, 6)) if (spec.kind === 'search') dailymotionSeeds.push({
        kind: 'dailymotion', query: spec.query, after: spec.after, before: spec.before, sort: 'relevance',
      })
      // Small category/time partitions without search words, with stable pagination.
      const categories = ['creation', 'music', 'sport', 'tech', 'travel', 'shortfilms', 'people', 'tv']
      for (let i = 0; i < 4; i++) {
        const year = 2007 + Math.floor(random() * (new Date(now).getUTCFullYear() - 2007))
        dailymotionSeeds.push({ kind: 'dailymotion', category: categories[Math.floor(random() * categories.length)],
          after: new Date(Date.UTC(year, 0, 1)).toISOString(), before: new Date(Date.UTC(year + 1, 0, 1)).toISOString(),
          sort: i % 2 ? 'old' : 'least-visited' })
      }
      await Promise.all(dailymotionSeeds.map(spec => enqueue(db, spec)))
    }
    // Neighbours of actual trends: explore creators, without copying search terms into metadata.
    const trends = await db.collection('items').find({ type: 'video', provider: 'youtube', channelId: { $type: 'string' },
      trendObservedAt: { $gte: new Date(now - 7 * 86400000) } }).sort({ trendObservedAt: -1 }).limit(16).maxTimeMS(700).toArray()
    await Promise.all([...new Set(trends.map(x => String(x.channelId)))].slice(0, 4)
      .map(channelId => enqueue(db, { kind: 'channel', channelId })))
    const youtube = process.env.YOUTUBE_API_KEY ? youtubePageLoader(process.env.YOUTUBE_API_KEY) : null
    const dailymotion = dailymotionPageLoader()
    const report = await runExploration({ db, quota, random, maxMs: 90000, loadPage: (task, signal, permit) => task.spec.kind === 'dailymotion' ? dailymotion(task, signal, permit) : youtube ? youtube(task, signal, permit) : Promise.reject(new Error('youtube-unconfigured')),
      ingest: videos => finalizeVideoIngest(videos, { dryRun: false, sampleSize: 0, warnings: [], skipDetails: true, insertOnly: true }) })
    return report
}
