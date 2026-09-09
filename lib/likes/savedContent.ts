import type { LikeItem } from '@/utils/likes'
import type { RandomContentItem } from '@/lib/random/clientTypes'
import { safeMediaUrl } from '@/lib/players/state'

type SavedContent = Exclude<RandomContentItem, { type: 'minigame' }>

const string = (value: unknown, max = 20_000) =>
  typeof value === 'string' ? value.slice(0, max) : ''

/** Validate saved browser data; never trust a URL or executable markup from storage. */
export function decodeSavedContent(value: unknown): SavedContent | null {
  if (!value || typeof value !== 'object') return null
  const data = value as Record<string, unknown>
  const type = data.type
  const text = string(data.text || data.title)
  const url = safeMediaUrl(data.url)
  const provider = string(data.provider, 200)
  const sourceData =
    data.source && typeof data.source === 'object'
      ? (data.source as Record<string, unknown>)
      : {}
  const source = {
    name: string(sourceData.name, 200) || provider,
    url: safeMediaUrl(sourceData.url),
  }
  const shared = {
    _id: string(data._id, 200) || undefined,
    provider,
    source,
  }

  switch (type) {
    case 'image':
      return url
        ? { ...shared, type, url, title: text, thumbUrl: safeMediaUrl(data.thumbUrl) }
        : null
    case 'video':
      return url
        ? { ...shared, type, url, text, thumbUrl: safeMediaUrl(data.thumbUrl) }
        : null
    case 'web':
      return url
        ? { ...shared, type, url, text, ogImage: safeMediaUrl(data.ogImage) || null }
        : null
    case 'quote':
      return text ? { ...shared, type, text, author: string(data.author, 500) } : null
    case 'joke':
      return text ? { ...shared, type, text } : null
    case 'fact': {
      if (
        data.variant === 'quiz' &&
        Array.isArray(data.options) &&
        data.options.length >= 2 &&
        data.options.length <= 12 &&
        data.options.every((option) => typeof option === 'string') &&
        Number.isInteger(data.correctIndex) &&
        Number(data.correctIndex) >= 0 &&
        Number(data.correctIndex) < data.options.length
      ) {
        const options = data.options.map((option) => string(option, 2000))
        const correctIndex = Number(data.correctIndex)
        const correctIndices = Array.isArray(data.correctIndices)
          ? data.correctIndices.filter(
              (index): index is number =>
                Number.isInteger(index) && index >= 0 && index < options.length,
            )
          : undefined
        return {
          ...shared,
          type,
          variant: 'quiz',
          id: string(data.id, 200) || shared._id || 'saved-quiz',
          text,
          question: string(data.question) || text,
          options,
          correctIndex,
          correctIndices,
          answer: string(data.answer) || options[correctIndex],
        }
      }
      return text ? { ...shared, type, variant: 'text', text } : null
    }
    default:
      return null
  }
}

export function savedLikeContent(like: LikeItem): SavedContent | null {
  const snapshot = decodeSavedContent(like.snapshot)
  if (snapshot) return { ...snapshot, _id: like.itemId || like.id }
  return decodeSavedContent({ ...like, _id: like.itemId || like.id })
}
