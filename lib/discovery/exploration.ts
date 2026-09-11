import { createHash, randomUUID } from 'node:crypto'
import type { Db } from 'mongodb'
import type { RawVideo } from '../ingest/videos'
import type { Rng } from './random'
import { reserveDailymotionQuota, type DailymotionSpec } from './dailymotion'

export type SearchSpec = {
  kind: 'search'; query: string; language: string; order: 'date' | 'relevance' | 'viewCount';
  after: string; before: string
} | { kind: 'channel'; channelId: string } | { kind: 'playlist'; playlistId: string } | DailymotionSpec
export type DiscoveryTask = { _id: string; spec: SearchSpec; depth: number; editorial: boolean;
  due: Date; leaseUntil: Date; leaseToken?: string; attempts: number; cursor?: string;
  pages: number; dryPages: number; priority: number; lastYield?: number }
export function taskId(spec: SearchSpec): string {
  const stable = Object.fromEntries(Object.entries(spec).sort(([a], [b]) => a.localeCompare(b)))
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex')
}
export async function enqueue(db: Db, spec: SearchSpec, depth = 0, editorial = false, now = Date.now()): Promise<void> {
  if (depth > 2) return
  await db.collection<DiscoveryTask>('discovery_tasks_v2').updateOne({ _id: taskId(spec) }, { $setOnInsert: {
    spec, depth, editorial, due: new Date(now), leaseUntil: new Date(0), attempts: 0, pages: 0, dryPages: 0, priority: 1,
  } }, { upsert: true })
}
export type QuotaConfig = { searchDailyLimit: number; otherDailyLimit: number;
  /** Capacity reserved for all existing jobs. Configure from actual usage, not a guessed default. */
  searchBaseReserve: number; otherBaseReserve: number; extraSearchLimit: number }
type Quota = { _id: string; spent: number; exploration: number; editorial: number }
export function quotaDay(now: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
export async function reserveQuota(db: Db, config: QuotaConfig, bucket: 'search' | 'other',
  actor: 'base' | 'exploration' | 'editorial', now: number): Promise<boolean> {
  const daily = bucket === 'search' ? config.searchDailyLimit : config.otherDailyLimit
  const base = bucket === 'search' ? config.searchBaseReserve : config.otherBaseReserve
  if (!Number.isSafeInteger(daily) || daily <= 0 || !Number.isSafeInteger(base) || base < 0 || base > daily ||
    !Number.isSafeInteger(config.extraSearchLimit) || config.extraSearchLimit < 0) throw new Error('Invalid explicit quota configuration')
  const extra = Math.min(Math.floor((daily - base) * .25), bucket === 'search' ? Math.min(20, config.extraSearchLimit) : Infinity)
  const collection = db.collection<Quota>('discovery_quota_v2'), _id = `${quotaDay(now)}:youtube:${bucket}`
  try { await collection.updateOne({ _id }, { $setOnInsert: { spent: 0, exploration: 0, editorial: 0 } }, { upsert: true }) }
  catch (error) { if ((error as { code?: number }).code !== 11000) throw error }
  const result = await collection.findOneAndUpdate({ _id, spent: { $lt: daily },
    ...(actor === 'base' && process.env.RANDOM_DISCOVERY_WORKER_ENABLED === '1' ? { $expr: { $lt: [{ $subtract: ['$spent', '$exploration'] }, daily - extra] } } : {}),
    ...(actor !== 'base' ? { exploration: { $lt: extra } } : {}),
    ...(actor === 'editorial' ? { editorial: { $lt: Math.floor(extra * .25) } } : {}),
  }, { $inc: { spent: 1, exploration: Number(actor !== 'base'), editorial: Number(actor === 'editorial') } }, { returnDocument: 'after' })
  return result != null
}
export function quotaConfigFromEnv(): QuotaConfig {
  const read = (name: string): number => {
    const value = process.env[name]
    if (!value || !/^\d+$/.test(value)) throw new Error(`Missing explicit quota setting: ${name}`)
    return Number(value)
  }
  return { searchDailyLimit: read('RANDOM_YT_SEARCH_DAILY_LIMIT'), otherDailyLimit: read('RANDOM_YT_OTHER_DAILY_LIMIT'),
    searchBaseReserve: read('RANDOM_YT_SEARCH_BASE_RESERVE'), otherBaseReserve: read('RANDOM_YT_OTHER_BASE_RESERVE'),
    extraSearchLimit: read('RANDOM_YT_EXTRA_SEARCH_LIMIT') }
}
export type Page = { videos: RawVideo[]; nextCursor?: string; children: SearchSpec[] }
export type PageLoader = (task: DiscoveryTask, signal: AbortSignal, permit: (bucket: 'search' | 'other') => Promise<boolean>) => Promise<Page>

/** One invocation: one worker, bounded runtime. Multiple invocations use leases and atomic quotas. */
export async function runExploration(options: {
  db: Db; quota: QuotaConfig; random: Rng; loadPage: PageLoader;
  ingest: (videos: RawVideo[]) => Promise<{ inserted: number; existingSkipped?: number }>;
  now?: () => number; maxMs?: number
}): Promise<{ pages: number; inserted: number; failures: number }> {
  const { db, quota, random, loadPage, ingest } = options, now = options.now ?? Date.now
  const deadline = now() + Math.min(180000, options.maxMs ?? 180000), report = { pages: 0, inserted: 0, failures: 0 }
  const tasks = db.collection<DiscoveryTask>('discovery_tasks_v2')
  let attempts = 0
  while (now() < deadline - 15000 && attempts++ < 40) {
    const claim = async (untried: boolean) => tasks.findOneAndUpdate({ due: { $lte: new Date(now()) }, leaseUntil: { $lte: new Date(now()) },
      ...(untried ? { attempts: 0 } : {}),
      ...(process.env.RANDOM_DM_DISCOVERY_ENABLED !== '1' ? { 'spec.kind': { $ne: 'dailymotion' } } : {}) }, { $set: { leaseUntil: new Date(now() + 240000), leaseToken: randomUUID() } },
    { sort: { priority: -1, due: 1, _id: 1 }, returnDocument: 'after' })
    let task = await claim(random() < .25)
    if (!task) task = await claim(false)
    if (!task) break
    const fence = { _id: task._id, leaseToken: task.leaseToken }
    try {
      const page = await loadPage(task, AbortSignal.timeout(Math.max(1, Math.min(10000, deadline - now() - 15000))),
        bucket => task!.spec.kind === 'dailymotion' ? reserveDailymotionQuota(db, now()) : reserveQuota(db, quota, bucket, task!.editorial ? 'editorial' : 'exploration', now()))
      // Do not persist unbounded upstream responses. Inserts must use the existing unique video ID.
      const result = await ingest(page.videos.slice(0, 50))
      const scanned = page.videos.length, ratio = scanned ? result.inserted / scanned : 0
      const authors = new Set(page.videos.map(x => x.channelId).filter(Boolean)).size
      const dryPages = result.inserted === 0 ? task.dryPages + 1 : 0
      // Discovery yield, not visitors' engagement. A small-account video is not penalised for low views.
      const yieldScore = .7 * ratio + .3 * Math.min(1, authors / 5)
      const continuePaging = Boolean(page.nextCursor) && task.pages < 7 && dryPages < 2
      const cooldown = dryPages >= 2 ? Math.min(7, dryPages) * 86400000 : 86400000
      await tasks.updateOne(fence, { $set: { cursor: continuePaging ? page.nextCursor : undefined,
        due: new Date(now() + (continuePaging ? 1000 : cooldown)), leaseUntil: new Date(0),
        pages: continuePaging ? task.pages + 1 : 0, dryPages, lastYield: yieldScore,
        priority: .25 + .75 * yieldScore }, $inc: { attempts: 1 }, $unset: { leaseToken: '' } })
      // Descendants remain suggestions. They never become owner references automatically.
      for (const spec of page.children.slice(0, 3)) await enqueue(db, spec, task.depth + 1, task.editorial, now())
      report.pages++; report.inserted += result.inserted
    } catch (error) {
      report.failures++
      await tasks.updateOne(fence, { $set: { due: new Date(now() + 86400000), leaseUntil: new Date(0) },
        $inc: { attempts: 1 }, $unset: { leaseToken: '' } })
      // One exhausted provider must not starve the other provider's queued tasks.
    }
  }
  return report
}

/** Real YouTube adapter: search window -> creator -> uploads playlist, with stable pagination. */
export function youtubePageLoader(apiKey: string, request: typeof fetch = fetch): PageLoader {
  if (!apiKey) throw new Error('Missing YOUTUBE_API_KEY')
  return async (task, signal, permit) => {
    const spec = task.spec
    if (spec.kind === 'dailymotion') throw new Error('Wrong provider adapter')
    const endpoint = spec.kind === 'search' ? 'search' : spec.kind === 'channel' ? 'channels' : 'playlistItems'
    const params = new URLSearchParams({ key: apiKey, part: spec.kind === 'channel' ? 'contentDetails' : 'snippet,contentDetails', maxResults: '50' })
    if (spec.kind === 'search') {
      params.set('part', 'snippet'); params.set('type', 'video'); params.set('q', spec.query)
      params.set('publishedAfter', spec.after); params.set('publishedBefore', spec.before)
      params.set('order', spec.order); params.set('relevanceLanguage', spec.language === 'jp' ? 'ja' : spec.language)
      params.set('videoEmbeddable', 'true'); params.set('safeSearch', 'moderate')
    } else if (spec.kind === 'channel') params.set('id', spec.channelId)
    else params.set('playlistId', spec.playlistId)
    if (task.cursor && spec.kind !== 'channel') params.set('pageToken', task.cursor)
    if (!await permit(spec.kind === 'search' ? 'search' : 'other')) throw new Error('quota-exhausted')
    const response = await request(`https://www.googleapis.com/youtube/v3/${endpoint}?${params}`, { signal })
    if (!response.ok) throw new Error(`youtube-status-${response.status}`) // Never log a URL containing the API key.
    type ApiItem = { id?: { videoId?: string }; snippet?: { title?: string; description?: string; channelId?: string;
      videoOwnerChannelId?: string; videoOwnerChannelTitle?: string; channelTitle?: string; publishedAt?: string; resourceId?: { videoId?: string } };
      contentDetails?: { videoId?: string; videoPublishedAt?: string; relatedPlaylists?: { uploads?: string } } }
    const data = await response.json() as { items?: ApiItem[]; nextPageToken?: string }
    if (spec.kind === 'channel') return { videos: [], children: (data.items ?? []).flatMap(x =>
      x.contentDetails?.relatedPlaylists?.uploads ? [{ kind: 'playlist' as const, playlistId: x.contentDetails.relatedPlaylists.uploads }] : []) }
    const videos: RawVideo[] = (data.items ?? []).slice(0, 50).flatMap(item => {
      const id = item.id?.videoId ?? item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId
      if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return []
      const s = item.snippet
      return [{ videoId: id, provider: 'youtube', url: `https://youtu.be/${id}`, title: s?.title,
        description: s?.description, thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        channelId: spec.kind === 'playlist' ? s?.videoOwnerChannelId : s?.channelId,
        channelTitle: spec.kind === 'playlist' ? s?.videoOwnerChannelTitle : s?.channelTitle,
        publishedAt: spec.kind === 'playlist' ? item.contentDetails?.videoPublishedAt : s?.publishedAt,
        contextQueries: [`discovery-task:${task._id}`, ...(spec.kind === 'search' ? [spec.query] : [])] }]
    })
    const creators = [...new Set(videos.map(x => x.channelId).filter((x): x is string => Boolean(x)))]
    return { videos, nextCursor: data.nextPageToken,
      children: task.depth < 2 ? creators.slice(0, 3).map(channelId => ({ kind: 'channel', channelId })) : [] }
  }
}

export async function installExplorationIndexes(db: Db): Promise<void> {
  await db.collection('discovery_tasks_v2').createIndex({ due: 1, leaseUntil: 1, priority: -1 }, { name: 'discovery_tasks_due_v2' })
}
