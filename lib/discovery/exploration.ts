import { createHash, randomUUID } from 'node:crypto'
import type { Db } from 'mongodb'
import type { RawVideo } from '../ingest/videos'
import type { Rng } from './random'
import { reserveDailymotionQuota, type DailymotionSpec } from './dailymotion'
import { hasPhrase, type Subject } from './subjects'
import { cleanDescription } from './profile'

export type DiscoveryFocus = { subject: Subject; ownerId: string; referenceKey: string; branch: 'primary' | 'secondary'; angle: string }
export type SearchSpec = ({
  kind: 'search'; query: string; language: string; order: 'date' | 'relevance' | 'viewCount';
  after: string; before: string
} | { kind: 'channel'; channelId: string } | { kind: 'playlist'; playlistId: string } | DailymotionSpec) & { focus?: DiscoveryFocus }
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
  } }, { upsert: true, maxTimeMS: 2000 })
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
export type DiscoveryProvider = 'youtube' | 'dailymotion'
export type ExplorationStage = 'claiming' | 'provider' | 'ingesting' | 'recovering'
export type ExplorationReport = { pages: number; inserted: number; failures: number; quotaDenied: number;
  errors: { timeout: number; rateLimit: number; http: number; other: number };
  stopReason: 'idle' | 'time-budget' | 'task-budget' | 'quota' | 'provider-errors' | 'cancelled' }

function pageFailure(error: unknown): 'quota' | keyof ExplorationReport['errors'] {
  if (error instanceof Error) {
    if (error.message === 'quota-exhausted') return 'quota'
    if (error.name === 'TimeoutError' || error.name === 'AbortError') return 'timeout'
    if (/^(youtube|dailymotion)-status-429$/.test(error.message)) return 'rateLimit'
    if (/^(youtube|dailymotion)-status-\d{3}$/.test(error.message)) return 'http'
  }
  return 'other'
}

export async function withAbortDeadline<T>(milliseconds: number, parent: AbortSignal | undefined,
  run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  const relay = () => controller.abort(parent?.reason)
  if (parent?.aborted) relay()
  else parent?.addEventListener('abort', relay, { once: true })
  let onAbort: (() => void) | undefined
  const aborted = new Promise<T>((_resolve, reject) => {
    onAbort = () => reject(controller.signal.reason ?? new DOMException('Request aborted', 'AbortError'))
    if (controller.signal.aborted) onAbort()
    else controller.signal.addEventListener('abort', onAbort, { once: true })
  })
  const timer = setTimeout(() => controller.abort(new DOMException('Provider deadline exceeded', 'TimeoutError')),
    Math.max(1, milliseconds))
  try { return await Promise.race([run(controller.signal), aborted]) }
  finally {
    clearTimeout(timer)
    parent?.removeEventListener('abort', relay)
    if (onAbort) controller.signal.removeEventListener('abort', onAbort)
  }
}

export function focusMatchesVideo(video: RawVideo, focus?: DiscoveryFocus): boolean {
  if (!focus) return true
  const source = `${video.title ?? ''}\n${cleanDescription(video.description ?? '')}`
  return focus.subject.aliases.some(alias => hasPhrase(source, alias))
}

/** One invocation: one worker, bounded runtime. Multiple invocations use leases and atomic quotas. */
export async function runExploration(options: {
  db: Db; quota?: QuotaConfig; random: Rng; loadPage: PageLoader;
  ingest: (videos: RawVideo[]) => Promise<{ inserted: number; existingSkipped?: number }>;
  now?: () => number; maxMs?: number; provider?: DiscoveryProvider; signal?: AbortSignal;
  onStage?: (stage: ExplorationStage) => void
}): Promise<ExplorationReport> {
  const { db, quota, random, loadPage, ingest } = options, now = options.now ?? Date.now
  const deadline = now() + Math.min(180000, options.maxMs ?? 180000)
  const report: ExplorationReport = { pages: 0, inserted: 0, failures: 0, quotaDenied: 0,
    errors: { timeout: 0, rateLimit: 0, http: 0, other: 0 }, stopReason: 'idle' }
  const blockedKinds = new Set<SearchSpec['kind']>()
  const consecutiveFailures: Record<DiscoveryProvider, number> = { youtube: 0, dailymotion: 0 }
  let deniedBucket: 'search' | 'other' | undefined
  const tasks = db.collection<DiscoveryTask>('discovery_tasks_v2')
  let attempts = 0
  const pagesByTask = new Map<string, number>()
  while (now() < deadline - 15000 && attempts++ < 40) {
    if (options.signal?.aborted) { report.stopReason = 'cancelled'; break }
    options.onStage?.('claiming')
    const kinds: SearchSpec['kind'][] = [
      ...(options.provider !== 'dailymotion' ? ['search', 'channel', 'playlist'] as const : []),
      ...(options.provider !== 'youtube' && process.env.RANDOM_DM_DISCOVERY_ENABLED === '1' ? ['dailymotion'] as const : []),
    ].filter(kind => !blockedKinds.has(kind))
    if (!kinds.length) { report.stopReason = report.failures ? 'provider-errors' : 'quota'; break }
    const saturated = [...pagesByTask].filter(([, pages]) => pages >= 2).map(([id]) => id)
    const claim = async (untried: boolean, rotate = true, actor?: boolean) => tasks.findOneAndUpdate({ due: { $lte: new Date(now()) }, leaseUntil: { $lte: new Date(now()) },
      // Old owner-channel tasks had no subject or revocation fence. Active likes are reseeded by the worker.
      $or: [{ editorial: { $ne: true } }, { 'spec.focus.subject.key': { $exists: true } }],
      ...(untried ? { attempts: 0 } : {}),
      ...(actor == null ? {} : { editorial: actor }),
      ...(rotate && saturated.length ? { _id: { $nin: saturated } } : {}),
      'spec.kind': { $in: kinds } }, { $set: { leaseUntil: new Date(now() + 240000), leaseToken: randomUUID() } },
    { sort: { priority: -1, due: 1, _id: 1 }, returnDocument: 'after', maxTimeMS: 700 })
    // Give owner exploration a bounded opportunity without making autonomous work depend on it.
    let task = await claim(false, true, attempts % 4 === 1)
    if (!task) task = await claim(random() < .25)
    if (!task) task = await claim(false)
    // Prefer another productive route; keep paging if this is the only available one.
    if (!task && saturated.length) task = await claim(false, false)
    if (!task) { report.stopReason = report.failures ? 'provider-errors' : report.quotaDenied ? 'quota' : 'idle'; break }
    const fence = { _id: task._id, leaseToken: task.leaseToken }
    const provider: DiscoveryProvider = task.spec.kind === 'dailymotion' ? 'dailymotion' : 'youtube'
    let phase: 'database' | 'provider' | 'ingest' = 'database'
    deniedBucket = undefined
    try {
      if (task.spec.focus) {
        const focus = task.spec.focus
        const active = await db.collection('discovery_owner_references_v2').findOne({
          ownerId: focus.ownerId, contentKey: focus.referenceKey, active: true,
        }, { projection: { _id: 1 }, maxTimeMS: 500 })
        if (!active) {
          await tasks.updateOne(fence, { $set: { due: new Date(now() + 7 * 86400000), leaseUntil: new Date(0) }, $unset: { leaseToken: '' } },
            { maxTimeMS: 2000 })
          continue
        }
      }
      phase = 'provider'
      options.onStage?.('provider')
      // Real 50-result Dailymotion pages can exceed ten seconds. Keep a provider-specific bound.
      const providerTimeoutMs = provider === 'dailymotion' ? 20000 : 10000
      const pageBudgetMs = Math.max(1, Math.min(providerTimeoutMs, deadline - now() - 15000))
      const page = await withAbortDeadline(pageBudgetMs, options.signal, signal => loadPage(task!, signal, async bucket => {
          if (signal.aborted) throw signal.reason
          if (provider === 'youtube' && !quota) throw new Error('Missing YouTube quota configuration')
          phase = 'database'
          const allowed = provider === 'dailymotion' ? await reserveDailymotionQuota(db, now())
            : await reserveQuota(db, quota!, bucket, task!.editorial ? 'editorial' : 'exploration', now())
          phase = 'provider'
          if (!allowed) deniedBucket = bucket
          return allowed
        }))
      phase = 'ingest'
      options.onStage?.('ingesting')
      // Do not persist unbounded upstream responses. Inserts must use the existing unique video ID.
      const focused = page.videos.slice(0, 50).filter(video => focusMatchesVideo(video, task!.spec.focus))
      const result = await ingest(focused)
      phase = 'database'
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
        priority: .25 + .75 * yieldScore }, $inc: { attempts: 1 }, $unset: { leaseToken: '' } }, { maxTimeMS: 2000 })
      // Descendants remain suggestions. They never become owner references automatically.
      for (const spec of page.children.slice(0, 3)) await enqueue(db, spec, task.depth + 1, task.editorial, now())
      pagesByTask.set(task._id, (pagesByTask.get(task._id) ?? 0) + 1)
      report.pages++; report.inserted += result.inserted
      consecutiveFailures[provider] = 0
    } catch (error) {
      // Database/insert failures are not provider timeouts. Stop rather than hiding a failed write.
      if (phase !== 'provider') throw error
      options.onStage?.('recovering')
      if (options.signal?.aborted) {
        await tasks.updateOne(fence, { $set: { leaseUntil: new Date(0) }, $unset: { leaseToken: '' } }, { maxTimeMS: 2000 })
        report.stopReason = 'cancelled'; break
      }
      const reason = pageFailure(error)
      if (reason === 'quota') report.quotaDenied++
      else { report.failures++; report.errors[reason]++; consecutiveFailures[provider]++ }
      await tasks.updateOne(fence, { $set: { due: new Date(now() + 86400000), leaseUntil: new Date(0) },
        $inc: { attempts: 1 }, $unset: { leaseToken: '' } }, { maxTimeMS: 2000 })
      // One exhausted provider must not starve the other provider's queued tasks.
      if (reason === 'quota' && provider === 'dailymotion') blockedKinds.add('dailymotion')
      // An editorial cap does not imply that autonomous searches have exhausted their quota.
      if (reason === 'quota' && provider === 'youtube' && !task.editorial) {
        if (deniedBucket === 'other') { blockedKinds.add('channel'); blockedKinds.add('playlist') }
        else blockedKinds.add('search')
      }
      if (consecutiveFailures[provider] >= 3) {
        for (const kind of provider === 'dailymotion' ? ['dailymotion'] as const : ['search', 'channel', 'playlist'] as const) blockedKinds.add(kind)
      }
    }
  }
  if (options.signal?.aborted) report.stopReason = 'cancelled'
  else if (now() >= deadline - 15000) report.stopReason = 'time-budget'
  else if (attempts > 40) report.stopReason = 'task-budget'
  return report
}

/** Real YouTube adapter: search window -> creator -> uploads playlist, with stable pagination. */
export function youtubePageLoader(apiKey: string, request: typeof fetch = fetch): PageLoader {
  if (!apiKey) throw new Error('Missing YOUTUBE_API_KEY')
  return async (task, signal, permit) => {
    const spec = task.spec
    // Different discovery angles share the same subject-scoped creator task.
    const creatorFocus = spec.focus ? { ...spec.focus, angle: 'creator' } : undefined
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
      videoOwnerChannelId?: string; videoOwnerChannelTitle?: string; channelTitle?: string; publishedAt?: string;
      liveBroadcastContent?: string; resourceId?: { videoId?: string } };
      contentDetails?: { videoId?: string; videoPublishedAt?: string; relatedPlaylists?: { uploads?: string } } }
    const data = await response.json() as { items?: ApiItem[]; nextPageToken?: string }
    if (spec.kind === 'channel') return { videos: [], children: (data.items ?? []).flatMap(x =>
      x.contentDetails?.relatedPlaylists?.uploads ? [{ kind: 'playlist' as const, playlistId: x.contentDetails.relatedPlaylists.uploads, ...(creatorFocus ? { focus: creatorFocus } : {}) }] : []) }
    const videos: RawVideo[] = (data.items ?? []).slice(0, 50).flatMap(item => {
      const id = item.id?.videoId ?? item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId
      if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return []
      const s = item.snippet
      return [{ videoId: id, provider: 'youtube', url: `https://youtu.be/${id}`, title: s?.title,
        description: s?.description, thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        channelId: spec.kind === 'playlist' ? s?.videoOwnerChannelId : s?.channelId,
        channelTitle: spec.kind === 'playlist' ? s?.videoOwnerChannelTitle : s?.channelTitle,
        liveBroadcastContent: s?.liveBroadcastContent,
        publishedAt: spec.kind === 'playlist' ? item.contentDetails?.videoPublishedAt : s?.publishedAt,
        contextQueries: [`discovery-task:${task._id}`, ...(spec.kind === 'search' ? [spec.query] : [])] }]
    })
    const creators = [...new Set(videos.filter(video => focusMatchesVideo(video, spec.focus)).map(x => x.channelId).filter((x): x is string => Boolean(x)))]
    // Rotate the followed creators rather than always exploring the first three ranked channels.
    const start = creators.length ? task.pages % creators.length : 0
    const rotatedCreators = [...creators.slice(start), ...creators.slice(0, start)]
    return { videos, nextCursor: data.nextPageToken,
      children: task.depth < 2 ? rotatedCreators.slice(0, 3).map(channelId => ({ kind: 'channel', channelId, ...(creatorFocus ? { focus: creatorFocus } : {}) })) : [] }
  }
}

export async function installExplorationIndexes(db: Db): Promise<void> {
  await db.collection('discovery_tasks_v2').createIndex({ due: 1, leaseUntil: 1, priority: -1 }, { name: 'discovery_tasks_due_v2' })
}
