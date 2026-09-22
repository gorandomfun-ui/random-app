/**
 * Server-side confirmation that a media is really gone, by its identifier at
 * the provider: a frame that loads and shows "video unavailable", a GIF that
 * Giphy replaces with another, a file that answers 404. The verdict functions
 * are pure and read recorded answers; the fetchers are thin.
 *
 * YouTube has its own in `videoAvailability.ts` (it spends quota).
 */

export type MediaVerdict =
  | { checked: false; reason: 'no-id' | 'no-api-key' | 'request-failed' }
  | { checked: true; available: true }
  | { checked: true; available: false; reason: 'not-found' | 'not-public' | 'not-embeddable' | 'gone' }

const UNCHECKED = (reason: 'no-id' | 'no-api-key' | 'request-failed'): MediaVerdict => ({ checked: false, reason })

/** "dailymotion:x8abc12", a watch URL, a dai.ly link, an embed URL → x8abc12. */
export function dailymotionVideoId(input: { videoId?: unknown; url?: unknown }): string | null {
  const direct = typeof input.videoId === 'string' ? input.videoId.trim().replace(/^dailymotion:/, '') : ''
  if (/^[a-z0-9]{5,12}$/i.test(direct)) return direct
  const url = typeof input.url === 'string' ? input.url.trim() : ''
  if (!url) return null
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, '')
    const queryVideo = parsed.searchParams.get('video')
    if (queryVideo && /^[a-z0-9]{5,12}$/i.test(queryVideo)) return queryVideo
    const parts = parsed.pathname.split('/').filter(Boolean)
    const raw = host === 'dai.ly' ? parts[0] : host.endsWith('dailymotion.com') ? parts[parts.indexOf('video') + 1] ?? parts[0] : undefined
    const id = raw?.split('_')[0]
    return id && /^[a-z0-9]{5,12}$/i.test(id) ? id : null
  } catch {
    return null
  }
}

/** The public video API answers with what an embed would find. */
export function dailymotionVerdict(status: number, body: { status?: unknown; private?: unknown; published?: unknown; allow_embed?: unknown } | null): MediaVerdict {
  if (status === 404 || status === 410) return { checked: true, available: false, reason: 'not-found' }
  if (status < 200 || status >= 300 || !body) return UNCHECKED('request-failed')
  if (body.private === true) return { checked: true, available: false, reason: 'not-public' }
  if (body.published === false || (typeof body.status === 'string' && body.status !== 'published')) return { checked: true, available: false, reason: 'not-public' }
  if (body.allow_embed === false) return { checked: true, available: false, reason: 'not-embeddable' }
  return { checked: true, available: true }
}

export async function checkDailymotionAvailability(videoId: string, request: typeof fetch = fetch): Promise<MediaVerdict> {
  if (!/^[a-z0-9]{5,12}$/i.test(videoId)) return UNCHECKED('no-id')
  try {
    const response = await request(`https://api.dailymotion.com/video/${videoId}?fields=id,status,private,published,allow_embed`, { cache: 'no-store' })
    const body = response.ok ? ((await response.json().catch(() => null)) as Record<string, unknown> | null) : null
    return dailymotionVerdict(response.status, body)
  } catch {
    return UNCHECKED('request-failed')
  }
}

/** A Giphy id from the media URL, the page URL or the item's source. */
export function giphyImageId(input: { url?: unknown; pageUrl?: unknown; source?: { url?: unknown } | null }): string | null {
  for (const candidate of [input.url, input.pageUrl, input.source?.url]) {
    if (typeof candidate !== 'string') continue
    try {
      const parsed = new URL(candidate)
      if (!/(^|\.)giphy\.com$/i.test(parsed.hostname)) continue
      const media = parsed.pathname.match(/\/media\/(?:v1\.[^/]+\/)?([A-Za-z0-9]+)(?:\/|$)/)
      const page = parsed.pathname.match(/\/(?:gifs|stickers)\/(?:.*-)?([A-Za-z0-9]+)\/?$/)
      const id = media?.[1] ?? page?.[1]
      if (id) return id
    } catch {
      /* not a URL */
    }
  }
  return null
}

/** Giphy answers 404 for a deleted GIF even when its CDN still serves a stand-in file. */
export function giphyVerdict(status: number, body: { meta?: { status?: unknown; msg?: unknown }; data?: unknown } | null): MediaVerdict {
  if (status === 404 || status === 410) return { checked: true, available: false, reason: 'gone' }
  if (status < 200 || status >= 300 || !body) return UNCHECKED('request-failed')
  const meta = typeof body.meta?.status === 'number' ? body.meta.status : 200
  if (meta === 404) return { checked: true, available: false, reason: 'gone' }
  if (meta !== 200) return UNCHECKED('request-failed')
  if (!body.data || (typeof body.data === 'object' && !Object.keys(body.data as object).length)) return { checked: true, available: false, reason: 'gone' }
  return { checked: true, available: true }
}

export async function checkGiphyAvailability(id: string, request: typeof fetch = fetch): Promise<MediaVerdict> {
  if (!/^[A-Za-z0-9]{3,64}$/.test(id)) return UNCHECKED('no-id')
  const apiKey = (process.env.GIPHY_API_KEY || '').trim()
  if (!apiKey) return UNCHECKED('no-api-key')
  try {
    const response = await request(`https://api.giphy.com/v1/gifs/${id}?api_key=${apiKey}`, { cache: 'no-store' })
    const body = (await response.json().catch(() => null)) as { meta?: { status?: unknown }; data?: unknown } | null
    return giphyVerdict(response.status, body)
  } catch {
    return UNCHECKED('request-failed')
  }
}

/** A Tenor post id from a view page URL or a media URL. */
export function tenorImageId(input: { url?: unknown; pageUrl?: unknown; source?: { url?: unknown } | null }): string | null {
  for (const candidate of [input.pageUrl, input.source?.url, input.url]) {
    if (typeof candidate !== 'string') continue
    try {
      const parsed = new URL(candidate)
      if (!/(^|\.)tenor\.com$/i.test(parsed.hostname)) continue
      const page = parsed.pathname.match(/^\/view\/.*-([0-9]+)\/?$/)?.[1]
      if (page) return page
    } catch {
      /* not a URL */
    }
  }
  return null
}

/** Tenor answers with an empty list for a removed post. */
export function tenorVerdict(status: number, body: { results?: unknown } | null): MediaVerdict {
  if (status === 404 || status === 410) return { checked: true, available: false, reason: 'gone' }
  if (status < 200 || status >= 300 || !body) return UNCHECKED('request-failed')
  return Array.isArray(body.results) && body.results.length ? { checked: true, available: true } : { checked: true, available: false, reason: 'gone' }
}

export async function checkTenorAvailability(id: string, request: typeof fetch = fetch): Promise<MediaVerdict> {
  if (!/^[0-9]{3,32}$/.test(id)) return UNCHECKED('no-id')
  const apiKey = (process.env.TENOR_API_KEY || '').trim()
  if (!apiKey) return UNCHECKED('no-api-key')
  try {
    const response = await request(`https://tenor.googleapis.com/v2/posts?ids=${id}&key=${apiKey}`, { cache: 'no-store' })
    const body = (await response.json().catch(() => null)) as { results?: unknown } | null
    return tenorVerdict(response.status, body)
  } catch {
    return UNCHECKED('request-failed')
  }
}

/** For a plain file (Pexels, Pixabay): the server says whether it is still there. */
export function fileVerdict(status: number): MediaVerdict {
  if (status === 404 || status === 410) return { checked: true, available: false, reason: 'gone' }
  if (status >= 200 && status < 400) return { checked: true, available: true }
  return UNCHECKED('request-failed')
}

export async function checkFileAvailability(url: string, request: typeof fetch = fetch): Promise<MediaVerdict> {
  if (!/^https?:\/\//i.test(url)) return UNCHECKED('no-id')
  try {
    const response = await request(url, { method: 'HEAD', cache: 'no-store', redirect: 'follow' })
    return fileVerdict(response.status)
  } catch {
    return UNCHECKED('request-failed')
  }
}

export type ImageProviderName = 'giphy' | 'tenor' | 'pexels' | 'pixabay'

/** The check an image gets, by provider: by id where the provider has an API, by file otherwise. */
export async function checkImageAvailability(
  image: { provider?: unknown; url?: unknown; pageUrl?: unknown; source?: { url?: unknown } | null },
  request: typeof fetch = fetch,
): Promise<MediaVerdict> {
  const provider = typeof image.provider === 'string' ? image.provider.toLowerCase() : ''
  if (provider === 'giphy') {
    const id = giphyImageId(image)
    return id ? checkGiphyAvailability(id, request) : UNCHECKED('no-id')
  }
  if (provider === 'tenor') {
    const id = tenorImageId(image)
    return id ? checkTenorAvailability(id, request) : UNCHECKED('no-id')
  }
  if (provider === 'pexels' || provider === 'pixabay') {
    return typeof image.url === 'string' ? checkFileAvailability(image.url, request) : UNCHECKED('no-id')
  }
  return UNCHECKED('no-id')
}
