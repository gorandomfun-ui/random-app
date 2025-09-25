import type { ItemType } from './types'

type Nullable<T> = T | null | undefined

export type SourceInfo = {
  name?: string | null
  url?: string | null
} | null

export type ImageItem = {
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
}

export type VideoItem = {
  type: 'video'
  url: string
  thumbUrl?: string | null
  text?: string | null
  lang?: 'en' | 'fr' | 'de' | 'jp'
  provider?: string | null
  source?: SourceInfo
}

export type QuoteItem = {
  type: 'quote'
  text: string
  author: string
  provider: string
  source: { name: string; url?: string }
}

export type JokeItem = {
  type: 'joke'
  text: string
  provider: string
  source: { name: string; url?: string }
}

export type FactItem = {
  type: 'fact'
  text: string
  provider: string
  source: { name: string; url?: string }
}

export type WebItem = {
  type: 'web'
  url: string
  text: string
  ogImage: string | null
  provider?: string | null
  source: { name: string; url?: string }
  tags?: string[]
  keywords?: string[]
  host?: string | null
}

export type RandomContentItem = ImageItem | VideoItem | QuoteItem | FactItem | JokeItem | WebItem

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

export type ContentItemType = ItemType | 'encourage'

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
