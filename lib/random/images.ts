import { sampleFromCache, touchLastShown } from '@/lib/random/data'
import type { ImageDocument } from '@/lib/ingest/images'
import { STRONG_POOL_MAX_TIME_MS, buildStrongPoolMatch } from '@/lib/random/strongPool'
import type { RandomSelectOptions } from '@/lib/random/types'
import type { Filter } from 'mongodb'

export type ImageItem = {
  type: 'image'
  url: string
  thumbUrl: string | null
  source: { name: string; url?: string | null }
  title?: string
  provider?: string
  tags?: string[]
  keywords?: string[]
  tone?: 'positive' | 'neutral' | 'negative'
  toneConfidence?: number
  toneSignals?: string[]
  _id?: string
}

export async function selectImage(options: RandomSelectOptions = {}): Promise<ImageItem> {
  const strongMatch = options.strong ? buildStrongPoolMatch<ImageDocument>() : null
  const preferredStrongMatch = strongMatch
    ? ({
        $and: [
          strongMatch,
          {
            $or: [
              { provider: { $nin: ['pexels', 'pixabay', 'unsplash'] } },
              { likeCount: { $gte: 1 } },
              { quality: { $gte: 2 } },
              { showWeight: { $gte: 1.2 } },
            ],
          },
        ],
      } as unknown as Filter<ImageDocument>)
    : null
  const doc = strongMatch
    ? (await sampleFromCache<ImageDocument>('image', preferredStrongMatch || strongMatch, { maxTimeMS: STRONG_POOL_MAX_TIME_MS }))
      ?? (await sampleFromCache<ImageDocument>('image', strongMatch, { maxTimeMS: STRONG_POOL_MAX_TIME_MS }))
      ?? (await sampleFromCache<ImageDocument>('image'))
    : await sampleFromCache<ImageDocument>('image')
  if (doc && typeof doc.url === 'string' && doc.url.trim()) {
    const url = doc.url.trim()
    const itemId = doc && typeof doc === 'object' && '_id' in doc ? String((doc as { _id: unknown })._id) : undefined
    await touchLastShown('image', { url })
    return {
      _id: itemId,
      type: 'image',
      url,
      thumbUrl: typeof doc.thumb === 'string' ? doc.thumb : doc.thumbUrl ?? null,
      title: typeof doc.title === 'string' ? doc.title : undefined,
      provider: doc.provider,
      tags: Array.isArray(doc.tags) ? doc.tags : [],
      keywords: Array.isArray(doc.keywords) ? doc.keywords : [],
      source: {
        name: doc.source?.name || doc.provider || 'image',
        url: doc.source?.url || doc.pageUrl || doc.url,
      },
      tone: doc.tone,
      toneConfidence: doc.toneConfidence,
      toneSignals: Array.isArray(doc.toneSignals) ? doc.toneSignals.filter((entry): entry is string => typeof entry === 'string') : undefined,
    }
  }
  throw new Error('No image available')
}
