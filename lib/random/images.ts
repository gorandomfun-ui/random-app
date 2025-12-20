import { sampleFromCache, touchLastShown } from '@/lib/random/data'
import type { ImageDocument } from '@/lib/ingest/images'

export type ImageItem = {
  type: 'image'
  url: string
  thumbUrl: string | null
  source: { name: string; url?: string | null }
  tone?: 'positive' | 'neutral' | 'negative'
  toneConfidence?: number
  toneSignals?: string[]
  _id?: string
}

export async function selectImage(): Promise<ImageItem> {
  const doc = await sampleFromCache<ImageDocument>('image')
  if (doc && typeof doc.url === 'string' && doc.url.trim()) {
    const url = doc.url.trim()
    const itemId = doc && typeof doc === 'object' && '_id' in doc ? String((doc as { _id: unknown })._id) : undefined
    await touchLastShown('image', { url })
    return {
      _id: itemId,
      type: 'image',
      url,
      thumbUrl: typeof doc.thumb === 'string' ? doc.thumb : doc.thumbUrl ?? null,
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
