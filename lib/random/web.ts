import { sampleFromCache, touchLastShown } from '@/lib/random/data'
import {
  markGlobalItem,
  markGlobalKeywords,
  markGlobalOrigin,
  markGlobalProvider,
  markGlobalTopics,
} from './globalState'
import type { WebItem } from './clientTypes'
import { deriveToneAugmentation, flattenToneSegments } from '@/lib/ingest/tone'

const RECENT_LIMIT = 10
const recentWebUrls: string[] = []

const WEB_TOPIC_SEEDS: Record<string, string[]> = {
  archive: ['archive','retro','vintage','geocities','old web','guestbook','blinkies','y2k','frameset','marquee'],
  culture: ['zine','gallery','exhibition','art','design','fashion','style'],
  music: ['music','band','playlist','dj','mix','sound','radio','tape','cassette'],
  diy: ['diy','craft','maker','build','tutorial','how to','hack','guide'],
  travel: ['travel','guide','map','city','tour','museum','attraction','itinerary'],
  fandom: ['fan','shrine','tribute','club','community','fanpage','fan site'],
  tech: ['software','download','program','code','script','terminal','retro computing'],
  odd: ['weird','strange','bizarre','curious','odd','mystery'],
}

function trim(value?: string | null): string {
  return (value || '').trim()
}

function registerRecent(url: string) {
  const key = url.toLowerCase()
  const idx = recentWebUrls.indexOf(key)
  if (idx >= 0) recentWebUrls.splice(idx, 1)
  recentWebUrls.push(key)
  while (recentWebUrls.length > RECENT_LIMIT) recentWebUrls.shift()
}

function computeTags(text: string): string[] {
  const lower = text.toLowerCase()
  const tags: string[] = []
  for (const [tag, seeds] of Object.entries(WEB_TOPIC_SEEDS)) {
    if (seeds.some((seed) => lower.includes(seed))) tags.push(tag)
  }
  return tags.length ? Array.from(new Set(tags)) : ['misc']
}

function computeKeywords(text: string, limit = 10): string[] {
  const lower = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
  const words = lower.split(/\s+/).filter(Boolean)
  const unique: string[] = []
  for (const word of words) {
    if (word.length < 3 || word.length > 20) continue
    if (!unique.includes(word)) unique.push(word)
    if (unique.length >= limit) break
  }
  return unique
}

async function pickFromDb(exclude: string[], attempts = 15): Promise<Record<string, unknown> | null> {
  for (let i = 0; i < attempts; i++) {
    const doc = await sampleFromCache<Record<string, unknown>>('web')
    if (!doc) return null
    const url = typeof doc.url === 'string' ? doc.url.trim().toLowerCase() : ''
    if (!url) continue
    if (exclude.includes(url)) continue
    return doc
  }
  return null
}

export async function selectWeb(): Promise<WebItem | null> {
  const exclude = recentWebUrls.slice(-RECENT_LIMIT)
  const doc = await pickFromDb(exclude)
  if (!doc) return null

  const urlRaw = typeof doc.url === 'string' ? doc.url.trim() : ''
  if (!urlRaw) return null
  const host = typeof doc.host === 'string' && doc.host.trim() ? doc.host.trim() : (() => {
    try { return new URL(urlRaw).host.replace(/^www\./, '') } catch { return '' }
  })()
  const text = trim(typeof doc.title === 'string' ? doc.title : typeof doc.text === 'string' ? doc.text : host || urlRaw)
  const ogImage = typeof doc.ogImage === 'string' && doc.ogImage ? doc.ogImage : null
  const provider = typeof doc.provider === 'string' && doc.provider.trim() ? doc.provider.trim() : 'web'
  const rawSource = doc.source && typeof doc.source === 'object' ? (doc.source as { name?: string; url?: string }) : null
  const sourceName = trim(rawSource?.name) || provider
  const sourceUrl = rawSource?.url && typeof rawSource.url === 'string' ? rawSource.url : urlRaw
  const descriptor = `${text} ${host} ${provider}`
  const tags = Array.isArray(doc.tags) && doc.tags.length
    ? (doc.tags as unknown[]).filter((tag): tag is string => typeof tag === 'string')
    : computeTags(descriptor)
  const keywords = Array.isArray(doc.keywords) && doc.keywords.length
    ? (doc.keywords as unknown[]).filter((word): word is string => typeof word === 'string')
    : computeKeywords(descriptor)
  const toneRaw = typeof (doc as { tone?: unknown }).tone === 'string' ? (doc as { tone?: string }).tone : undefined
  let tone: 'positive' | 'neutral' | 'negative' | undefined
  if (toneRaw === 'positive' || toneRaw === 'negative' || toneRaw === 'neutral') {
    tone = toneRaw
  } else {
    tone = undefined
  }
  let toneConfidence = typeof (doc as { toneConfidence?: unknown }).toneConfidence === 'number'
    ? (doc as { toneConfidence?: number }).toneConfidence
    : undefined
  let toneSignals = Array.isArray((doc as { toneSignals?: unknown }).toneSignals)
    ? ((doc as { toneSignals?: unknown }).toneSignals as unknown[])
        .filter((entry): entry is string => typeof entry === 'string')
    : undefined

  if (!tone || toneConfidence === undefined) {
    const toneSegments = flattenToneSegments([provider, sourceName, text, host, tags, keywords])
    const computedTone = deriveToneAugmentation(toneSegments)
    if (computedTone) {
      tone = computedTone.tone
      toneConfidence = computedTone.toneConfidence
      toneSignals = computedTone.toneSignals
    }
  }

  registerRecent(urlRaw)
  await touchLastShown('web', { url: urlRaw })
  markGlobalItem('web', urlRaw)
  markGlobalProvider(provider)
  markGlobalOrigin('db-random')
  markGlobalTopics(tags)
  markGlobalKeywords(keywords)

  return {
    type: 'web',
    url: urlRaw,
    text,
    ogImage,
    provider,
    source: { name: sourceName, url: sourceUrl },
    host,
    tags,
    keywords,
    tone,
    toneConfidence,
    toneSignals,
  }
}
