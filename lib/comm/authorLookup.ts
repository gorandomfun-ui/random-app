/**
 * Who made it, asked to the provider when the base does not know: the
 * channel of a YouTube or Dailymotion video, the photographer of a Pexels or
 * Pixabay picture, the uploader of a Giphy GIF. One small call at the Comm
 * click, four seconds at most, nothing when it fails; the curator never types
 * a name.
 */

import { fetchMetadata } from '@/lib/discovery/metadataRepair'

export type LookupInput = { provider: string; url: string; sourceUrl: string; videoId?: string | null }

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

export function idsOf(input: LookupInput): { youtube?: string; dailymotion?: string; pexels?: string; pixabay?: string; giphy?: string } {
  const provider = input.provider.toLowerCase()
  if (provider === 'youtube' || provider === 'reddit-youtube') {
    const fromId = text(input.videoId)
    const fromUrl = /(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([\w-]{11})/.exec(input.url)?.[1]
    const id = /^[\w-]{11}$/.test(fromId) ? fromId : fromUrl
    return id ? { youtube: id } : {}
  }
  if (provider === 'dailymotion') {
    const fromId = text(input.videoId).replace(/^dailymotion:/, '')
    const fromUrl = /dailymotion\.com\/video\/([a-z\d]{3,20})|dai\.ly\/([a-z\d]{3,20})/i.exec(input.url)
    const id = /^[a-z\d]{3,20}$/i.test(fromId) ? fromId : fromUrl?.[1] ?? fromUrl?.[2]
    return id ? { dailymotion: id } : {}
  }
  if (provider === 'pexels') {
    const id = /pexels-photo-(\d+)|-(\d+)\/?$/.exec(`${input.url} ${input.sourceUrl}`)
    const found = id?.[1] ?? id?.[2]
    return found ? { pexels: found } : {}
  }
  if (provider === 'pixabay') {
    const id = /-(\d+)(?:_\d+)?\.(?:jpg|jpeg|png|webp)|-(\d+)\/?$/.exec(`${input.url} ${input.sourceUrl}`)
    const found = id?.[1] ?? id?.[2]
    return found ? { pixabay: found } : {}
  }
  if (provider === 'giphy') {
    const id = /giphy\.com\/media\/([A-Za-z\d]+)\//.exec(input.url)?.[1] ?? /giphy\.com\/gifs\/(?:[\w-]+-)?([A-Za-z\d]{10,})$/.exec(input.sourceUrl)?.[1]
    return id ? { giphy: id } : {}
  }
  return {}
}

async function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>, ms = 4000): Promise<T | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try { return await work(controller.signal) } catch { return null } finally { clearTimeout(timer) }
}

/** The author's name, or null; never throws. */
export async function lookupAuthor(input: LookupInput, request: typeof fetch = fetch, env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  const ids = idsOf(input)
  if (ids.youtube && env.YOUTUBE_API_KEY) {
    const rows = await withTimeout((signal) => fetchMetadata('youtube', [ids.youtube!], env.YOUTUBE_API_KEY!, signal, request))
    return rows?.[0]?.channelTitle?.trim() || null
  }
  if (ids.dailymotion) {
    const rows = await withTimeout((signal) => fetchMetadata('dailymotion', [ids.dailymotion!], '', signal, request))
    return rows?.[0]?.channelTitle?.trim() || null
  }
  if (ids.pexels && env.PEXELS_API_KEY) {
    const body = await withTimeout(async (signal) => { const r = await request(`https://api.pexels.com/v1/photos/${ids.pexels}`, { signal, headers: { Authorization: env.PEXELS_API_KEY! } }); return r.ok ? (r.json() as Promise<{ photographer?: unknown }>) : null })
    return text(body?.photographer) || null
  }
  if (ids.pixabay && env.PIXABAY_API_KEY) {
    const body = await withTimeout(async (signal) => { const r = await request(`https://pixabay.com/api/?key=${encodeURIComponent(env.PIXABAY_API_KEY!)}&id=${ids.pixabay}`, { signal }); return r.ok ? (r.json() as Promise<{ hits?: Array<{ user?: unknown }> }>) : null })
    return text(body?.hits?.[0]?.user) || null
  }
  if (ids.giphy && env.GIPHY_API_KEY) {
    const body = await withTimeout(async (signal) => { const r = await request(`https://api.giphy.com/v1/gifs/${ids.giphy}?api_key=${encodeURIComponent(env.GIPHY_API_KEY!)}`, { signal }); return r.ok ? (r.json() as Promise<{ data?: { username?: unknown; user?: { display_name?: unknown } } }>) : null })
    return text(body?.data?.user?.display_name) || text(body?.data?.username) || null
  }
  return null
}
