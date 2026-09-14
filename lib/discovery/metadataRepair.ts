import { ObjectId, type Db } from 'mongodb'
import { videoDiscoveryFields } from '../ingest/discoveryMetadata'
import { reserveQuota, quotaConfigFromEnv, withAbortDeadline } from './exploration'
import { reserveDailymotionQuota } from './dailymotion'
import type { CatalogueRow } from './catalog'
import { providerError } from './providerErrors'
import { curatorOwnerId } from './curatorAuth'
import { profileFromRow } from './catalog'

type Provider = 'youtube' | 'dailymotion'
export type ProviderMetadata = { id: string; title: string; description: string; channelId?: string;
  channelTitle?: string; categoryId?: string; publishedAt?: Date; viewCount?: number;
  sourceStatus?: { embeddable?: boolean; privacyStatus?: string; uploadStatus?: string } }
const string = (x: unknown) => typeof x === 'string' ? x : undefined
const idOf = (row: CatalogueRow) => String(row.videoId ?? '').replace(/^dailymotion:/, '')
const validId = (provider: Provider, id: string) => provider === 'youtube' ? /^[\w-]{11}$/.test(id) : /^[a-z\d]{3,20}$/i.test(id)

/** ID lookup only: at most one HTTP page of 50 existing videos; never search.list. */
export async function fetchMetadata(provider: Provider, ids: string[], key: string, signal: AbortSignal,
  request: typeof fetch = fetch): Promise<ProviderMetadata[]> {
  if (!ids.length || ids.length > 50 || ids.some(id => !validId(provider, id))) throw new Error('metadata-invalid-ids')
  const params = provider === 'youtube'
    ? new URLSearchParams({ id: ids.join(','), key, part: 'snippet,statistics,status', maxResults: '50' })
    : new URLSearchParams({ ids: ids.join(','), limit: '50', fields: 'id,title,description,owner.id,owner.screenname,channel.id,created_time,views_total,private' })
  const response = await request(`${provider === 'youtube' ? 'https://www.googleapis.com/youtube/v3/videos' : 'https://api.dailymotion.com/videos'}?${params}`, { signal })
  if (!response.ok) throw await providerError(response, provider, 'other')
  const body = await response.json() as { items?: Record<string, unknown>[]; list?: Record<string, unknown>[] }
  const rows = provider === 'youtube' ? body.items : body.list
  if (!Array.isArray(rows)) throw new Error('metadata-invalid-response')
  return rows.slice(0, 50).flatMap(row => {
    if (typeof row.id !== 'string' || !ids.includes(row.id)) return []
    const snippet = (provider === 'youtube' ? row.snippet : row) as Record<string, unknown> | undefined
    if (!snippet || typeof snippet.title !== 'string' || !snippet.title.trim()) return []
    const statistics = row.statistics as Record<string, unknown> | undefined
    const date = provider === 'youtube' ? new Date(String(snippet.publishedAt)) : new Date(Number(row.created_time) * 1000)
    const views = Number(provider === 'youtube' ? statistics?.viewCount : row.views_total)
    const status = row.status as ProviderMetadata['sourceStatus'] | undefined
    return [{ id: row.id, title: snippet.title, description: string(snippet.description) ?? '',
      channelId: string(provider === 'youtube' ? snippet.channelId : row['owner.id'] ?? row.owner),
      channelTitle: string(provider === 'youtube' ? snippet.channelTitle : row['owner.screenname']),
      categoryId: string(provider === 'youtube' ? snippet.categoryId : row['channel.id']),
      ...(Number.isFinite(date.getTime()) ? { publishedAt: date } : {}),
      ...(Number.isFinite(views) && views >= 0 ? { viewCount: views } : {}),
      ...(provider === 'youtube' && status ? { sourceStatus: status } : {}),
      ...(provider === 'dailymotion' && row.private === true ? { sourceStatus: { privacyStatus: 'private' } } : {}),
    }]
  })
}

/** Additive repair only: never touches likes, rand, suppression, trend dates or media identity. */
export async function repairMetadataBatch(db: Db, provider: Provider, rows: CatalogueRow[],
  options: { signal?: AbortSignal; request?: typeof fetch; now?: number; permit?: () => Promise<boolean> } = {}) {
  const now = options.now ?? Date.now()
  const eligible = rows.filter(r => r.type === 'video' && r.provider === provider && validId(provider, idOf(r))).slice(0, 50)
  if (!eligible.length) return { provider, checked: 0, updated: 0, status: 'empty' }
  const key = process.env.YOUTUBE_API_KEY ?? ''
  if (provider === 'youtube' && !key && !options.request) return { provider, checked: 0, updated: 0, status: 'missing-key' }
  const permit = options.permit ?? (() => provider === 'dailymotion' ? reserveDailymotionQuota(db, now)
    : reserveQuota(db, quotaConfigFromEnv(), 'other', 'exploration', now))
  // Quota is reserved once BEFORE the request and is never refunded after a timeout.
  if (!await permit()) return { provider, checked: 0, updated: 0, status: 'quota' }
  await db.collection('items').updateMany({ _id: { $in: eligible.map(row => row._id as ObjectId) } },
    { $set: { metadataRepairAttemptedAt: new Date(now) } }, { maxTimeMS: 700 })
  const metadata = await withAbortDeadline(20000, options.signal, signal =>
    fetchMetadata(provider, [...new Set(eligible.map(idOf))], key, signal, options.request))
  const byId = new Map(metadata.map(row => [row.id, row]))
  let updated = 0
  for (const row of eligible) {
    if (options.signal?.aborted) break
    const source = byId.get(idOf(row))
    if (!source) continue // Missing/private/deleted is not inferred from an incomplete response.
    const fields = videoDiscoveryFields({ ...source, provider, statsObservedAt: new Date(now) }, new Date(now))
    const values = Object.fromEntries(Object.entries({ ...fields, title: source.title, description: source.description,
      channelId: source.channelId, channelTitle: source.channelTitle, categoryId: source.categoryId,
      discoveryProvenance: 'provider-metadata',
    }).filter(([, value]) => value !== undefined))
    // An ID lookup adds source evidence; it must not erase the queries that found this item.
    delete values.discoveryQueries
    const result = await db.collection('items').updateOne({ _id: row._id as ObjectId, type: 'video', provider,
      videoId: row.videoId, metadataRefreshedAt: row.metadataRefreshedAt ?? null,
    }, { $set: values }, { maxTimeMS: 700 })
    updated += result.modifiedCount
  }
  return { provider, checked: eligible.length, updated, status: 'completed' }
}

/** Fixed sample, no catalogue scan. Existing owner references are prioritised when available. */
export async function sampleMetadataRepairs(db: Db, provider: Provider, now: number, random = Math.random) {
  const families = ['unknown', 'music', 'sport', 'craft', 'food', 'art', 'advertising', 'cinema', 'science', 'gaming', 'technology', 'travel', 'everyday']
  const family = families[1 + Math.floor(now / 21600000) % (families.length - 1)]
  const owner = await db.collection('discovery_owner_references_v2').find({ ownerId: curatorOwnerId(), active: true, itemId: { $exists: true } })
    .sort({ explorationScheduledAt: 1, _id: 1 }).limit(32).maxTimeMS(600).toArray()
  const ids = owner.flatMap(r => typeof r.itemId === 'string' && ObjectId.isValid(r.itemId) ? [new ObjectId(r.itemId)] : [])
  const priority = ids.length ? await db.collection('items').find({ _id: { $in: ids }, provider }).limit(32).maxTimeMS(600).toArray() : []
  const samples = await Promise.allSettled(['unknown', family].map(f => db.collection('items').find({
    type: 'video', discoveryFamily: f, rand: { $gte: random() },
  }).hint('discovery_family_rand_v2').sort({ rand: 1 }).limit(60).maxTimeMS(600).toArray()))
  const rows = new Map([...priority, ...samples.flatMap(r => r.status === 'fulfilled' ? r.value : [])].map(r => [String(r._id), r]))
  return [...rows.values()].filter(r => {
    if (r.type !== 'video' || r.provider !== provider) return false
    if (r.metadataRepairAttemptedAt && new Date(r.metadataRepairAttemptedAt).getTime() > now - 7 * 86400000) return false
    const profile = profileFromRow(r)
    return profile.metadataQuality === 'unverified' || !profile.subject?.primary ||
      !r.metadataRefreshedAt || new Date(r.metadataRefreshedAt).getTime() < now - 90 * 86400000
  }).slice(0, 50)
}
