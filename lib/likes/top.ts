import { ObjectId } from 'mongodb'
import { getDb } from '@/lib/db'
import type { LikeType } from '@/utils/likes'

type ItemSource =
  | {
      name?: string | null
      url?: string | null
    }
  | string
  | null

type ItemId = ObjectId | string

type ItemDoc = {
  _id: ItemId
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
const LEADERBOARD_COLLECTION = 'leaderboards'
const LEADERBOARD_ID = 'likes-top'
const LEADERBOARD_LIMIT = 200

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

type LeaderboardDoc = {
  _id: string
  items: LikeLeaderboardItem[]
  updatedAt: Date
}

function mapDocToLeaderboardItem(doc: ItemDoc): LikeLeaderboardItem {
  return {
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
  }
}

async function readLeaderboardItems() {
  const db = await getDb()
  const doc = await db
    .collection<LeaderboardDoc>(LEADERBOARD_COLLECTION)
    .findOne({ _id: LEADERBOARD_ID })
  return doc?.items ?? null
}

async function writeLeaderboardItems(items: LikeLeaderboardItem[]) {
  const db = await getDb()
  await db
    .collection<LeaderboardDoc>(LEADERBOARD_COLLECTION)
    .updateOne(
      { _id: LEADERBOARD_ID },
      { $set: { items: items.slice(0, LEADERBOARD_LIMIT), updatedAt: new Date() } },
      { upsert: true },
    )
}

async function rebuildLeaderboard(limit: number) {
  const db = await getDb()
  const docs = await db
    .collection<ItemDoc>('items')
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

  const items = docs.map(mapDocToLeaderboardItem)
  await writeLeaderboardItems(items)
  return items
}

export async function fetchTopLikedItems(limit: number): Promise<LikeLeaderboardItem[]> {
  const cached = await readLeaderboardItems()
  if (cached && cached.length) {
    return cached.slice(0, limit)
  }
  const rebuilt = await rebuildLeaderboard(Math.max(limit, LEADERBOARD_LIMIT))
  return rebuilt.slice(0, limit)
}

function sortLeaderboardItems(items: LikeLeaderboardItem[]): LikeLeaderboardItem[] {
  return items.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count
    return b.likedAt - a.likedAt
  })
}

export async function refreshTopLikesForItem(objectId: ObjectId): Promise<void> {
  const db = await getDb()
  const doc = await db
    .collection<ItemDoc>('items')
    .findOne(
      { _id: objectId },
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

  const leaderboard = (await readLeaderboardItems()) ?? []
  const filtered = leaderboard.filter((item) => item.id !== toStringId(objectId))

  const likeCount = typeof doc?.likeCount === 'number' ? doc.likeCount : 0
  if (!doc || likeCount <= 0) {
    await writeLeaderboardItems(filtered)
    return
  }

  const entry = mapDocToLeaderboardItem(doc)
  filtered.push(entry)
  const sorted = sortLeaderboardItems(filtered).slice(0, LEADERBOARD_LIMIT)
  await writeLeaderboardItems(sorted)
}
