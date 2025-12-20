import type { ItemType } from './types'

type Nullable<T> = T | null | undefined

type ToneAttributes = {
  tone?: 'positive' | 'neutral' | 'negative' | null
  toneConfidence?: number | null
  toneSignals?: string[] | null
}

type Identifiable = {
  _id?: string
}

export type SourceInfo = {
  name?: string | null
  url?: string | null
} | null

export type ImageItem = Identifiable & {
  type: 'image'
  url: string
  thumbUrl?: string | null
  width?: number
  height?: number
  title?: string | null
  lang?: 'en' | 'fr' | 'de' | 'jp'
  provider?: string | null
  source?: SourceInfo
  pageUrl?: string | null
  link?: string | null
  attribution?: string | null
} & ToneAttributes

export type VideoItem = Identifiable & {
  type: 'video'
  url: string
  thumbUrl?: string | null
  text?: string | null
  lang?: 'en' | 'fr' | 'de' | 'jp'
  provider?: string | null
  source?: SourceInfo
} & ToneAttributes

export type AiMetadata = {
  source?: string
  model?: string
  generatedAt?: string
}

export type QuoteItem = Identifiable & {
  type: 'quote'
  text: string
  author: string
  provider: string
  source: { name: string; url?: string }
  variant?: 'text' | 'ai'
  lang?: string
  ai?: AiMetadata | null
  disclaimer?: string
} & ToneAttributes

export type JokeItem = Identifiable & {
  type: 'joke'
  text: string
  provider: string
  source: { name: string; url?: string }
  variant?: 'text' | 'ai'
  lang?: string
  ai?: AiMetadata | null
  disclaimer?: string
} & ToneAttributes

export type TriviaDifficulty = 'easy' | 'medium' | 'hard'

export type FactTextItem = Identifiable & {
  type: 'fact'
  variant: 'text' | 'ai'
  text: string
  provider: string
  source: { name: string; url?: string }
  lang?: string
  ai?: AiMetadata | null
  disclaimer?: string
}

export type FactQuizItem = Identifiable & {
  type: 'fact'
  variant: 'quiz'
  id: string
  text: string
  question: string
  options: string[]
  correctIndex: number
  correctIndices?: number[]
  answer: string
  provider: string
  source: { name: string; url?: string }
  category?: string
  difficulty?: TriviaDifficulty
} & ToneAttributes

export type FactItem = FactTextItem | FactQuizItem

export type WebItem = Identifiable & {
  type: 'web'
  url: string
  text: string
  ogImage: string | null
  provider?: string | null
  source: { name: string; url?: string }
  tags?: string[]
  keywords?: string[]
  host?: string | null
} & ToneAttributes

export type MiniGameId =
  | 'tap-to-not-tap'
  | 'emoji-echo'
  | 'useless-progress-bar'
  | 'left-or-right'
  | 'fake-loading-race'
  | 'color-off-by-one'
  | 'steady-spots'

export type MiniGameItem = Identifiable & {
  type: 'minigame'
  gameId: MiniGameId
  level: number
  seed: string
}

export type RandomContentItem = ImageItem | VideoItem | QuoteItem | FactItem | JokeItem | WebItem | MiniGameItem

export type RandomApiResponse = {
  item: RandomContentItem
}

export type AnyContentItem = RandomContentItem & { [key: string]: unknown }

export type EncourageItem = {
  type: 'encourage'
  text: string
  icon: string
}

export type DisplayItem = RandomContentItem | EncourageItem

export type ContentItemType = ItemType | 'encourage' | 'minigame'

export const isImageItem = (item: RandomContentItem): item is ImageItem => item.type === 'image'
export const isVideoItem = (item: RandomContentItem): item is VideoItem => item.type === 'video'
export const isWebItem = (item: RandomContentItem): item is WebItem => item.type === 'web'
export const isQuoteItem = (item: RandomContentItem): item is QuoteItem => item.type === 'quote'
export const isJokeItem = (item: RandomContentItem): item is JokeItem => item.type === 'joke'
export const isFactItem = (item: RandomContentItem): item is FactItem => item.type === 'fact'

export const getSourceLabel = (source: Nullable<SourceInfo>, fallback?: string | null): string | undefined => {
  if (source && source.name) return source.name
  return fallback ?? undefined
}

type Linkable = {
  source?: SourceInfo
  pageUrl?: string | null
  link?: string | null
  url?: string | null
}

export const getSourceHref = (
  item: Linkable,
  fallback?: string | null
): string | undefined => {
  return (
    item.source?.url || item.pageUrl || item.link || item.url || fallback || undefined
  )
}
