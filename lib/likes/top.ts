import { getDb } from '@/lib/db'
import type { LikeType } from '@/utils/likes'

type ItemSource =
  | {
      name?: string | null
      url?: string | null
    }
  | string
  | null

type ItemDoc = {
  _id: unknown
  type: LikeType
  url?: string | null
  text?: string | null
  title?: string | null
  thumb?: string | null
  thumbUrl?: string | null
  ogImage?: string | null
  provider?: string | null
  source?: ItemSource
  likeCount?: number | null
  updatedAt?: Date
}

export type LikeLeaderboardItem = {
  id: string
  type: LikeType
  url?: string
  text?: string
  title?: string
  thumbUrl: string | null
  ogImage: string | null
  provider?: string | null
  likedAt: number
  count: number
}

const LIKEABLE_TYPES: LikeType[] = ['image', 'video', 'web', 'quote', 'joke', 'fact']

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function resolveProvider(doc: ItemDoc): string | null {
  const provider = asString(doc.provider)
  if (provider) return provider
  const source = doc.source
  if (!source) return null
  if (typeof source === 'string') {
    const value = source.trim()
    return value || null
  }
  const name = asString(source.name)
  return name ?? null
}

function toStringId(value: unknown): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'toString' in value) {
    try {
      const str = (value as { toString: () => unknown }).toString()
      return typeof str === 'string' ? str : String(str)
    } catch {
      return ''
    }
  }
  return String(value ?? '')
}

export async function fetchTopLikedItems(limit: number): Promise<LikeLeaderboardItem[]> {
  const db = await getDb()
  const collection = db.collection<ItemDoc>('items')

  const docs = await collection
    .find(
      { type: { $in: LIKEABLE_TYPES }, likeCount: { $gt: 0 } },
      {
        projection: {
          _id: 1,
          type: 1,
          url: 1,
          text: 1,
          title: 1,
          thumb: 1,
          thumbUrl: 1,
          ogImage: 1,
          provider: 1,
          source: 1,
          likeCount: 1,
          updatedAt: 1,
        },
      },
    )
    .sort({ likeCount: -1, updatedAt: -1 })
    .limit(limit)
    .toArray()

  return docs.map((doc) => ({
    id: toStringId(doc._id),
    type: doc.type,
    url: asString(doc.url),
    text: asString(doc.text),
    title: asString(doc.title),
    thumbUrl: asString(doc.thumb ?? doc.thumbUrl) ?? null,
    ogImage: asString(doc.ogImage) ?? null,
    provider: resolveProvider(doc),
    likedAt: doc.updatedAt ? new Date(doc.updatedAt).getTime() : Date.now(),
    count: typeof doc.likeCount === 'number' ? doc.likeCount : 0,
  }))
}
