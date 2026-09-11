/** All in-repository YouTube Data API callers share this gate when explicitly enabled. */
export async function permitBaseYouTube(input: string | URL | Request): Promise<boolean> {
  if (process.env.RANDOM_YOUTUBE_QUOTA_ENABLED !== '1') return true
  const url = new URL(input instanceof Request ? input.url : String(input))
  if (url.hostname !== 'www.googleapis.com' || !url.pathname.startsWith('/youtube/v3/')) return true
  const [{ getDb }, { reserveQuota, quotaConfigFromEnv }] = await Promise.all([import('../db'), import('../discovery/exploration')])
  return reserveQuota(await getDb(), quotaConfigFromEnv(), url.pathname.endsWith('/search') ? 'search' : 'other', 'base', Date.now())
}
