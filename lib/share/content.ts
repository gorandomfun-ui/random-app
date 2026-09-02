import 'server-only'

import { cache } from 'react'
import { ObjectId, type Document } from 'mongodb'

import { getDbSafe } from '@/lib/random/data'

export type SharedContentType = 'image' | 'video' | 'web' | 'quote' | 'fact' | 'joke'

export type SharedContent = {
  id: string
  type: SharedContentType
  title: string
  description: string
  text: string
  mediaUrl: string | null
  sourceUrl: string | null
  imageUrl: string | null
  provider: string | null
  author: string | null
}

const SHAREABLE_TYPES = new Set<SharedContentType>(['image', 'video', 'web', 'quote', 'fact', 'joke'])

const cleanText = (value: unknown, maxLength = 500): string => {
  if (typeof value !== 'string') return ''
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

const cleanContentText = (value: unknown, maxLength = 10_000): string => {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return trimmed.length <= maxLength ? trimmed : `${trimmed.slice(0, maxLength - 1).trimEnd()}…`
}

const cleanUrl = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const parsed = new URL(value.trim())
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null
  } catch {
    return null
  }
}

const getYouTubeId = (value: string | null): string | null => {
  if (!value) return null
  try {
    const parsed = new URL(value)
    if (parsed.hostname === 'youtu.be') return parsed.pathname.split('/').filter(Boolean)[0] || null
    if (parsed.hostname.includes('youtube.com')) {
      if (parsed.pathname.startsWith('/shorts/')) return parsed.pathname.split('/')[2] || null
      if (parsed.pathname.startsWith('/embed/')) return parsed.pathname.split('/')[2] || null
      return parsed.searchParams.get('v')
    }
  } catch {
    return null
  }
  return null
}

const getDailymotionId = (value: string | null): string | null => {
  if (!value) return null
  const match = value.match(/(?:dailymotion\.com\/(?:video|embed\/video)\/|dai\.ly\/)([a-zA-Z0-9]+)/i)
  return match?.[1] || null
}

function normalizeSharedContent(id: string, doc: Document): SharedContent | null {
  const type = cleanText(doc.type, 20) as SharedContentType
  if (!SHAREABLE_TYPES.has(type)) return null

  const rawSource = doc.source && typeof doc.source === 'object'
    ? doc.source as { name?: unknown; url?: unknown }
    : null
  const provider = cleanText(doc.provider || rawSource?.name, 80) || null
  const mediaUrl = cleanUrl(doc.url)
  const sourceUrl = cleanUrl(rawSource?.url) || cleanUrl(doc.pageUrl) || mediaUrl
  const author = cleanText(doc.author, 120) || null
  const rawText = cleanContentText(doc.text || doc.title || doc.description || doc.quiz?.question)

  let title = cleanText(doc.title || doc.text || doc.quiz?.question, 110)
  if (!title) title = `Random ${type}`

  const description = cleanText(rawText || title, 240)
  let imageUrl = cleanUrl(doc.thumb) || cleanUrl(doc.thumbUrl) || cleanUrl(doc.ogImage)
  if (!imageUrl && type === 'image') imageUrl = mediaUrl
  if (!imageUrl && type === 'video') {
    const youtubeId = getYouTubeId(mediaUrl)
    if (youtubeId) imageUrl = `https://i.ytimg.com/vi/${encodeURIComponent(youtubeId)}/hqdefault.jpg`
    const dailymotionId = getDailymotionId(mediaUrl)
    if (!imageUrl && dailymotionId) {
      imageUrl = `https://www.dailymotion.com/thumbnail/video/${encodeURIComponent(dailymotionId)}`
    }
  }

  return {
    id,
    type,
    title,
    description,
    text: rawText,
    mediaUrl,
    sourceUrl,
    imageUrl,
    provider,
    author,
  }
}

export const getSharedContent = cache(async (id: string): Promise<SharedContent | null> => {
  if (!ObjectId.isValid(id)) return null
  const db = await getDbSafe()
  if (!db) return null

  try {
    const doc = await db.collection('items').findOne({
      _id: new ObjectId(id),
      type: { $in: Array.from(SHAREABLE_TYPES) },
      isSuppressed: { $ne: true },
      isSafe: { $ne: false },
    })
    return doc ? normalizeSharedContent(id, doc) : null
  } catch {
    return null
  }
})
