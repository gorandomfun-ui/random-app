import type { Db } from 'mongodb'
import type { PageLoader } from './exploration'
import type { RawVideo } from '../ingest/videos'
import { quotaDay } from './exploration'

export type DailymotionSpec = { kind: 'dailymotion'; query?: string; category?: string;
  after: string; before: string; sort: 'recent' | 'relevance' | 'old' | 'least-visited' }

export async function reserveDailymotionQuota(db: Db, now: number): Promise<boolean> {
  const configured = Number(process.env.RANDOM_DM_DISCOVERY_DAILY_LIMIT ?? 60)
  if (!Number.isSafeInteger(configured) || configured < 0 || configured > 200) throw new Error('Invalid Dailymotion exploration budget')
  const c = db.collection<{ _id: string; spent: number }>('discovery_dm_quota_v2'), _id = quotaDay(now)
  try { await c.updateOne({ _id }, { $setOnInsert: { spent: 0 } }, { upsert: true }) }
  catch (error) { if ((error as { code?: number }).code !== 11000) throw error }
  return Boolean(await c.findOneAndUpdate({ _id, spent: { $lt: configured } }, { $inc: { spent: 1 } }, { returnDocument: 'after' }))
}

/** Uses the same public legacy API as the current ingestion. No paid Player ID or SDK. */
export function dailymotionPageLoader(request: typeof fetch = fetch): PageLoader {
  return async (task, signal, permit) => {
    const spec = task.spec
    if (spec.kind !== 'dailymotion') throw new Error('Wrong provider adapter')
    if (spec.sort === 'relevance' && !spec.query) throw new Error('Relevance needs a query')
    if (!await permit('search')) throw new Error('quota-exhausted')
    const page = Math.max(1, Math.min(10, Number(task.cursor) || 1))
    const params = new URLSearchParams({ limit: '50', page: String(page), sort: spec.sort,
      created_after: String(Math.floor(new Date(spec.after).getTime() / 1000)), created_before: String(Math.floor(new Date(spec.before).getTime() / 1000)),
      fields: 'id,title,description,url,thumbnail_url,duration,channel.id,owner.id,owner.screenname,created_time,views_total,private' })
    if (spec.query) params.set('search', spec.query)
    if (spec.category) params.set('channel', spec.category)
    const response = await request(`https://api.dailymotion.com/videos?${params}`, { signal })
    if (!response.ok) throw new Error(`dailymotion-status-${response.status}`)
    const body = await response.json() as { has_more?: boolean; list?: Array<Record<string, unknown>> }
    const videos = (body.list ?? []).slice(0, 50).flatMap((row): RawVideo[] => {
      if (typeof row.id !== 'string' || !/^[a-z\d]+$/i.test(row.id) || row.private === true) return []
      const str = (key: string) => typeof row[key] === 'string' ? row[key] as string : undefined
      return [{ videoId: `dailymotion:${row.id}`, provider: 'dailymotion', url: `https://www.dailymotion.com/video/${row.id}`,
        title: str('title'), description: str('description'), thumb: str('thumbnail_url'), channelId: str('owner.id'), channelTitle: str('owner.screenname'),
        categoryId: str('channel.id'),
        duration: typeof row.duration === 'number' ? `PT${Math.max(0, row.duration)}S` : undefined,
        publishedAt: typeof row.created_time === 'number' ? new Date(row.created_time * 1000) : undefined,
        viewCount: typeof row.views_total === 'number' ? row.views_total : undefined, statsObservedAt: new Date(),
        contextQueries: [`discovery-task:${task._id}`, ...(spec.query ? [spec.query] : [])] }]
    })
    return { videos, children: [], nextCursor: body.has_more && page < 10 ? String(page + 1) : undefined }
  }
}
