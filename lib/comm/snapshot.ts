/**
 * The frozen copy of a content taken when the curator sets it aside: what the
 * tool needs even if the content later leaves the base. Built on the server
 * from the items row, never from what the client sends.
 */

import type { CommContentType, LicenseHint, QueueSnapshot, QueueSubject } from './model'

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/** "PT1H2M3S" → seconds; a number is taken as seconds already. */
export function isoDurationSeconds(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.round(value)
  if (typeof value !== 'string') return null
  const match = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i.exec(value.trim())
  if (!match) return null
  const [, days, hours, minutes, seconds] = match
  const total = Number(days ?? 0) * 86400 + Number(hours ?? 0) * 3600 + Number(minutes ?? 0) * 60 + Number(seconds ?? 0)
  return total > 0 ? Math.round(total) : null
}

const PROVIDER_LABELS: Record<string, string> = {
  youtube: 'YouTube', 'reddit-youtube': 'YouTube', dailymotion: 'Dailymotion', pexels: 'Pexels', pixabay: 'Pixabay',
  unsplash: 'Unsplash', giphy: 'Giphy', tenor: 'Tenor', imgflip: 'Imgflip', vimeo: 'Vimeo',
}

export function providerLabel(provider: string, sourceName?: unknown): string {
  const key = provider.toLowerCase()
  if (PROVIDER_LABELS[key]) return PROVIDER_LABELS[key]
  const name = text(sourceName)
  if (name) return name
  return provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : 'Source'
}

/**
 * permissif: the provider's own licence allows the use without attribution;
 * partage: embedding with attribution is the deal (the Giphy badge already shows in Random);
 * prudence: a creator's work on a platform, every right reserved by default.
 */
export function licenseHintOf(provider: string, contentType: CommContentType): LicenseHint {
  const key = provider.toLowerCase()
  if (['pexels', 'pixabay', 'unsplash'].includes(key)) return 'permissif'
  if (['giphy', 'tenor'].includes(key)) return 'partage'
  if (contentType === 'quote' || contentType === 'fact' || contentType === 'joke') return key === 'local' || key.startsWith('ai-') ? 'permissif' : 'partage'
  return 'prudence'
}

/** Giphy serves every GIF as an mp4 at the same address with the extension changed. */
export function giphyMp4Of(url: string): string | null {
  const match = /^(https:\/\/media\d*\.giphy\.com\/media\/[^/?#]+\/)[^/?#]+\.gif(?:[?#].*)?$/i.exec(url)
  return match ? `${match[1]}giphy.mp4` : null
}

/**
 * Who to credit. YouTube keeps its channel; a Dailymotion channel counts only once
 * repaired (the others record a category, a known bug); a quote has its author;
 * a site is its host; the stock and GIF providers do not say who made the file.
 */
export function authorOf(row: Record<string, unknown>, contentType: CommContentType, provider: string): string {
  const key = provider.toLowerCase()
  if (contentType === 'video') {
    if (key === 'dailymotion') return row.authorRepairedAt ? text(row.channelTitle) : ''
    return text(row.channelTitle) || text(row.creatorName) || ''
  }
  if (contentType === 'quote') return text(row.author)
  if (contentType === 'web') {
    const host = text(row.host)
    if (host) return host.replace(/^www\./, '')
    try { return new URL(text(row.url)).host.replace(/^www\./, '') } catch { return '' }
  }
  return text(row.author) || text(row.photographer) || text(row.user) || ''
}

export function contentTypeOf(row: Record<string, unknown>): CommContentType | null {
  const type = text(row.type)
  return ['video', 'image', 'web', 'quote', 'fact', 'joke'].includes(type) ? (type as CommContentType) : null
}

export function snapshotFromRow(row: Record<string, unknown>): { contentType: CommContentType; snapshot: QueueSnapshot; licenseHint: LicenseHint } | null {
  const contentType = contentTypeOf(row)
  if (!contentType) return null
  const provider = text(row.provider) || text((row.source as { name?: unknown } | undefined)?.name).toLowerCase() || 'unknown'
  const source = (row.source && typeof row.source === 'object' ? row.source : {}) as { name?: unknown; url?: unknown }
  const url = text(row.url) || text(source.url)
  const sourceUrl = text(source.url) || text(row.pageUrl) || text(row.link) || url
  const licenseHint = licenseHintOf(provider, contentType)
  const body = text(row.text) || text(row.question)
  const title = text(row.title) || (body ? body.slice(0, 200) : '') || text(row.host) || 'Sans titre'
  const thumb = text(row.thumb) || text(row.thumbUrl) || text(row.ogImage) || null
  return {
    contentType,
    licenseHint,
    snapshot: {
      title,
      url,
      sourceUrl,
      thumb,
      author: authorOf(row, contentType, provider),
      provider,
      providerLabel: providerLabel(provider, source.name),
      durationSec: contentType === 'video' ? isoDurationSeconds(row.duration ?? row.durationSec) : null,
      authorRequired: licenseHint === 'prudence',
      gifMp4: contentType === 'image' && provider.toLowerCase() === 'giphy' ? giphyMp4Of(url) : null,
      text: contentType === 'video' || contentType === 'image' ? null : body || null,
    },
  }
}

/** The v3 subjects of a row, ids and roles; the labels come from subjects_v3 afterwards. */
export function subjectRefsOf(row: Record<string, unknown>): Array<{ id: string; role: string }> {
  const v3 = row.v3 as { subjects?: unknown } | undefined
  if (!v3 || !Array.isArray(v3.subjects)) return []
  const out: Array<{ id: string; role: string }> = []
  for (const entry of v3.subjects) {
    if (!entry || typeof entry !== 'object') continue
    const id = text((entry as { id?: unknown }).id)
    if (!id) continue
    out.push({ id, role: text((entry as { role?: unknown }).role) || 'secondary' })
  }
  return out.slice(0, 12)
}

export function withLabels(refs: Array<{ id: string; role: string }>, labels: Map<string, string>): QueueSubject[] {
  return refs.map((ref) => ({ ...ref, label: labels.get(ref.id) ?? ref.id.replace(/^[a-z]+:/, '') }))
}
