import { AsyncLocalStorage } from 'node:async_hooks'
const purpose = new AsyncLocalStorage<'retro'>()
/** The scope survives awaited provider calls, but cannot leak into another concurrent request. */
export const withRetroYouTubeBudget = <T>(run: () => Promise<T>) => purpose.run('retro', run)
export function youtubeRequestPurpose(url: URL): 'general' | 'retro' | 'trends' {
  if (url.pathname.endsWith('/videos') && url.searchParams.get('chart') === 'mostPopular') return 'trends'
  return url.pathname.endsWith('/search') && purpose.getStore() === 'retro' ? 'retro' : 'general'
}
export function isYouTubeQuotaResponse(status: number, body?: string): boolean {
  if (status !== 403 || !body) return false
  try {
    const data = JSON.parse(body) as { error?: { errors?: { reason?: string }[] } }
    return Boolean(data.error?.errors?.some(e => e.reason === 'quotaExceeded' || e.reason === 'dailyLimitExceeded'))
  } catch { return false }
}
export async function noteBaseYouTubeQuota(input: string, status: number, body?: string): Promise<void> {
  if (process.env.RANDOM_YOUTUBE_QUOTA_ENABLED !== '1' || !isYouTubeQuotaResponse(status, body)) return
  const url = new URL(input)
  if (url.hostname !== 'www.googleapis.com' || !url.pathname.startsWith('/youtube/v3/')) return
  const [{ getDb }, { quotaDay }] = await Promise.all([import('../db'), import('../discovery/exploration')])
  const bucket = url.pathname.endsWith('/search') ? 'search' : 'other'
  await (await getDb()).collection<{ _id: string; remoteExhausted?: boolean }>('discovery_quota_v2').updateOne(
    { _id: `${quotaDay(Date.now())}:youtube:${bucket}` }, { $set: { remoteExhausted: true } }, { maxTimeMS: 1000 })
}

/** All in-repository YouTube Data API callers share this gate when explicitly enabled. */
export async function permitBaseYouTube(input: string | URL | Request): Promise<boolean> {
  if (process.env.RANDOM_YOUTUBE_QUOTA_ENABLED !== '1') return true
  const url = new URL(input instanceof Request ? input.url : String(input))
  if (url.hostname !== 'www.googleapis.com' || !url.pathname.startsWith('/youtube/v3/')) return true
  const [{ getDb }, { reserveQuota, quotaConfigFromEnv }] = await Promise.all([import('../db'), import('../discovery/exploration')])
  const bucket = url.pathname.endsWith('/search') ? 'search' : 'other'
  const lane = youtubeRequestPurpose(url)
  return reserveQuota(await getDb(), quotaConfigFromEnv(), bucket, 'base', Date.now(), lane)
}
