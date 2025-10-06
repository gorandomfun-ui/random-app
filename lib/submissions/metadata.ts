import * as cheerio from 'cheerio'

import type { SubmissionType } from '@/lib/submissions'

const FETCH_TIMEOUT_MS = 7000
const MAX_TEXT_LENGTH = 200_000

export type LinkMetadata = {
  title?: string | null
  description?: string | null
  image?: string | null
  siteName?: string | null
  canEmbed?: boolean | null
}

function abortableTimeout(): { controller: AbortController; clear: () => void } {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  return {
    controller,
    clear: () => clearTimeout(timeout),
  }
}

function sanitizeUrl(url: string): string {
  try {
    return new URL(url).toString()
  } catch {
    return url
  }
}

async function fetchHtml(url: string): Promise<string | null> {
  const { controller, clear } = abortableTimeout()
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'RandomAppBot/1.0 (+https://gorandom.fun)'
      },
    })
    if (!response.ok) return null
    const text = await response.text()
    if (!text) return null
    if (text.length > MAX_TEXT_LENGTH) return text.slice(0, MAX_TEXT_LENGTH)
    return text
  } catch {
    return null
  } finally {
    clear()
  }
}

function extractMetaFromHtml(html: string): LinkMetadata {
  const $ = cheerio.load(html)
  const og = (prop: string) => $(`meta[property="${prop}"]`).attr('content') || $(`meta[name="${prop}"]`).attr('content')
  const title = og('og:title') || $('title').first().text() || null
  const description = og('og:description') || $('meta[name="description"]').attr('content') || null
  const image = og('og:image') || $('meta[name="image"]').attr('content') || null
  const siteName = og('og:site_name') || $('meta[name="application-name"]').attr('content') || null
  return {
    title: title ? title.trim() : null,
    description: description ? description.trim() : null,
    image: image ? image.trim() : null,
    siteName: siteName ? siteName.trim() : null,
  }
}

const EMBED_PROVIDERS = new Set(['youtube', 'youtu', 'vimeo', 'dailymotion'])

function resolveEmbedCapability(provider?: string | null, videoId?: string | null): boolean {
  if (videoId && provider && provider.toLowerCase().includes('youtube')) return true
  if (provider) {
    const normalized = provider.toLowerCase()
    for (const key of EMBED_PROVIDERS) {
      if (normalized.includes(key)) return true
    }
  }
  return Boolean(videoId)
}

function parseVideo(url: string): { videoId?: string | null; provider?: string | null; thumb?: string | null } {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, '')
    if (host === 'youtu.be') {
      const id = parsed.pathname.replace(/^\//, '')
      return { videoId: id, provider: 'youtube', thumb: id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null }
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'www.youtube.com') {
      const id = parsed.searchParams.get('v') || parsed.pathname.split('/').filter(Boolean).pop()
      return { videoId: id, provider: 'youtube', thumb: id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null }
    }
    return { provider: host }
  } catch {
    return {}
  }
}

export async function fetchLinkMetadata(url: string, type: SubmissionType): Promise<LinkMetadata & { videoId?: string | null; provider?: string | null }> {
  const normalized = sanitizeUrl(url)
  const html = await fetchHtml(normalized)
  const meta = html ? extractMetaFromHtml(html) : {}
  if (type === 'video') {
    const videoInfo = parseVideo(normalized)
    return { ...meta, ...videoInfo, canEmbed: resolveEmbedCapability(videoInfo.provider, videoInfo.videoId) }
  }
  return meta
}
