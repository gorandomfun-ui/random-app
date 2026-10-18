import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

import * as cheerio from 'cheerio'

import type { SubmissionType } from '@/lib/submissions'

const FETCH_TIMEOUT_MS = 5000
const MAX_TEXT_LENGTH = 200_000
const MAX_REDIRECTS = 3

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

/**
 * Whether an address is on the public internet. The preview fetches what a
 * visitor typed: never the machine itself, its network, a cloud's metadata
 * service or any reserved range (18 October: any address was fetched).
 */
export function isPublicAddress(address: string): boolean {
  const kind = isIP(address)
  if (kind === 4) {
    const [a, b, c] = address.split('.').map(Number)
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false
    if (a === 100 && b >= 64 && b <= 127) return false
    if (a === 169 && b === 254) return false
    if (a === 172 && b >= 16 && b <= 31) return false
    if (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)))) return false
    if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false
    if (a === 203 && b === 0 && c === 113) return false
    return true
  }
  if (kind === 6) {
    const lower = address.toLowerCase()
    const mapped = lower.match(/^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isPublicAddress(mapped[1])
    if (lower === '::' || lower === '::1') return false
    if (/^f[cd]/.test(lower) || /^fe[89ab]/.test(lower) || lower.startsWith('ff') || lower.startsWith('2001:db8')) return false
    return true
  }
  return false
}

/** An http(s) address on the usual ports whose every IP is public, or null. */
async function publicUrl(raw: string): Promise<URL | null> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.port && url.port !== '80' && url.port !== '443') return null
  if (url.username || url.password) return null
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) return null
  try {
    const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true, verbatim: true })
    if (!addresses.length || !addresses.every((entry) => isPublicAddress(entry.address))) return null
  } catch {
    return null
  }
  return url
}

async function fetchHtml(url: string): Promise<string | null> {
  const { controller, clear } = abortableTimeout()
  try {
    let target = await publicUrl(url)
    for (let hop = 0; target && hop <= MAX_REDIRECTS; hop += 1) {
      const response = await fetch(target, {
        signal: controller.signal,
        // Each hop is checked like the first: a public page cannot send the server to a private one.
        redirect: 'manual',
        headers: {
          'User-Agent': 'RandomAppBot/1.0 (+https://gorandom.fun)'
        },
      })
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        await response.body?.cancel().catch(() => undefined)
        target = location ? await publicUrl(new URL(location, target).toString()) : null
        continue
      }
      if (!response.ok || !response.body) return null
      // At most the first 200 KB are read: a page's title and its tags are at its top.
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let length = 0
      while (length < MAX_TEXT_LENGTH) {
        const { done, value } = await reader.read()
        if (done || !value) break
        chunks.push(value)
        length += value.byteLength
      }
      await reader.cancel().catch(() => undefined)
      const text = new TextDecoder().decode(Buffer.concat(chunks)).slice(0, MAX_TEXT_LENGTH)
      return text || null
    }
    return null
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
