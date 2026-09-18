/**
 * Fetching the view count and publication date the catalogue is missing.
 *
 * 92% of videos have neither, which leaves popularity and era unknowable —
 * and those two decide whether a draw alternates the clip seen ten million
 * times with the one seen by three people.
 *
 * Dailymotion is free. YouTube costs one quota unit per call of 50 videos,
 * so 141,715 videos fit comfortably in a single day's 10,000 units.
 */

export type VideoStats = {
  videoId: string
  viewCount?: number
  publishedAt?: Date
  /** Set when the provider says the video is gone or cannot be embedded. */
  unavailable?: boolean
}

const UA = 'gorandom.fun stats repair (contact: github.com/gorandomfun-ui)'
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function fetchDailymotionStats(ids: string[], attempt = 0): Promise<VideoStats[]> {
  if (!ids.length) return []
  const params = new URLSearchParams({
    ids: ids.join(','),
    limit: '50',
    fields: 'id,views_total,created_time,private,status',
  })
  const response = await fetch(`https://api.dailymotion.com/videos?${params}`, { headers: { 'User-Agent': UA } })

  if (response.status === 429 || response.status === 503) {
    if (attempt >= 4) throw new Error(`Dailymotion HTTP ${response.status} après ${attempt + 1} essais`)
    const header = Number(response.headers.get('retry-after'))
    await wait(Number.isFinite(header) && header > 0 ? header * 1000 : Math.min(60_000, 2_000 * 2 ** attempt))
    return fetchDailymotionStats(ids, attempt + 1)
  }
  if (!response.ok) throw new Error(`Dailymotion HTTP ${response.status}`)

  const payload = (await response.json()) as { list?: Array<Record<string, unknown>> }
  return (payload.list ?? []).flatMap((row): VideoStats[] => {
    const videoId = typeof row.id === 'string' ? row.id : null
    if (!videoId) return []
    const views = typeof row.views_total === 'number' ? row.views_total : undefined
    const created = typeof row.created_time === 'number' ? new Date(row.created_time * 1000) : undefined
    const unavailable = row.private === true || (typeof row.status === 'string' && row.status !== 'published')
    return [{ videoId, viewCount: views, publishedAt: created, ...(unavailable ? { unavailable } : {}) }]
  })
}

export async function fetchYouTubeStats(ids: string[]): Promise<VideoStats[]> {
  const key = (process.env.YOUTUBE_API_KEY || '').trim()
  if (!key || !ids.length) return []
  const params = new URLSearchParams({
    key,
    part: 'statistics,snippet,status',
    id: ids.join(','),
    maxResults: '50',
  })
  const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`, { headers: { 'User-Agent': UA } })
  if (!response.ok) throw new Error(`YouTube HTTP ${response.status}`)

  const payload = (await response.json()) as {
    items?: Array<{
      id?: string
      statistics?: { viewCount?: string }
      snippet?: { publishedAt?: string }
      status?: { privacyStatus?: string; embeddable?: boolean }
    }>
  }

  const found = new Map<string, VideoStats>()
  for (const item of payload.items ?? []) {
    if (!item.id) continue
    const views = Number(item.statistics?.viewCount)
    const published = item.snippet?.publishedAt ? new Date(item.snippet.publishedAt) : undefined
    const unavailable =
      (item.status?.privacyStatus && item.status.privacyStatus !== 'public') || item.status?.embeddable === false
    found.set(item.id, {
      videoId: item.id,
      ...(Number.isFinite(views) ? { viewCount: views } : {}),
      ...(published ? { publishedAt: published } : {}),
      ...(unavailable ? { unavailable: true } : {}),
    })
  }

  // A video YouTube does not return at all has been deleted.
  for (const id of ids) {
    if (!found.has(id)) found.set(id, { videoId: id, unavailable: true })
  }
  return Array.from(found.values())
}
