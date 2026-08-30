import { fetchRandom, type RandomTypes } from '@/lib/api'
import type { ItemType } from '@/lib/random/types'
import type { FactItem, RandomContentItem, WebItem } from '@/lib/random/clientTypes'
import funPhrasesEn from '@/data/funPhrases/en.json'
import funPhrasesFr from '@/data/funPhrases/fr.json'
import funPhrasesDe from '@/data/funPhrases/de.json'
import funPhrasesJp from '@/data/funPhrases/jp.json'

export type Lang = 'en' | 'fr' | 'de' | 'jp' | 'es'
export type PlanType = 'image' | 'video' | 'web' | 'text'

const TEXT_TYPES: ItemType[] = ['quote', 'joke', 'fact']
const MIX_TEMPLATE: PlanType[] = ['image', 'image', 'video', 'video', 'web', 'text']

export const TARGET_COUNT = 6
export const CACHE_STORAGE_KEY = 'noroscope-cache-v6'
export const CACHE_TTL_MS = 60 * 60 * 1000

const FUN_PHRASES: Record<Lang, readonly string[]> = {
  en: funPhrasesEn,
  fr: funPhrasesFr,
  de: funPhrasesDe,
  jp: funPhrasesJp,
  es: funPhrasesEn,
}

export function getItemKey(item: RandomContentItem): string {
  switch (item.type) {
    case 'image':
    case 'video':
    case 'web':
      return `${item.type}:${'url' in item && item.url ? item.url : ''}`
    case 'quote':
      return `${item.type}:${item.text || ''}:${item.author || ''}`
    case 'joke':
      return `${item.type}:${item.text || ''}`
    case 'fact':
      return `${item.type}:${item.text || ''}`
    default:
      return `${item.type}:${Math.random()}`
  }
}

function shuffleArray<T>(input: T[]): T[] {
  const arr = input.slice()
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = arr[i]
    arr[i] = arr[j]
    arr[j] = temp
  }
  return arr
}

export function pickFunPhraseForLang(lang: Lang): string {
  const list = FUN_PHRASES[lang] ?? FUN_PHRASES.en
  if (!list.length) return ''
  return list[Math.floor(Math.random() * list.length)] ?? ''
}

async function fetchPlanItem(planType: PlanType, lang: Lang, seen: Set<string>): Promise<RandomContentItem | null> {
  const planTypes = planType === 'text' ? TEXT_TYPES : [planType as ItemType]
  const maxAttempts = 14
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const requestType = planType === 'text'
      ? planTypes[Math.floor(Math.random() * planTypes.length)]
      : planTypes[0]
    const response = await fetchRandom({ types: [requestType] as RandomTypes, lang })
    const candidate = response?.item ?? null
    if (!candidate) continue
    if (planType === 'image' && candidate.type !== 'image') continue
    if (planType === 'video' && candidate.type !== 'video') continue
    if (planType === 'web') {
      if (candidate.type !== 'web') continue
      if (!(candidate as WebItem).ogImage) continue
    }
    if (candidate.type === 'fact' && (candidate as FactItem).variant === 'quiz') continue
    if (planType === 'text' && !TEXT_TYPES.includes(candidate.type as ItemType)) continue
    const key = getItemKey(candidate)
    if (seen.has(key)) continue
    seen.add(key)
    return candidate
  }
  return null
}

export async function buildNoroscopeEntries(lang: Lang): Promise<{ entries: RandomContentItem[]; funPhrase: string }> {
  const plan = shuffleArray(MIX_TEMPLATE)
  const seen = new Set<string>()
  const settled = await Promise.all(
    plan.map((slot) =>
      fetchPlanItem(slot, lang, seen).catch(() => null),
    ),
  )
  const results: RandomContentItem[] = settled.filter((item): item is RandomContentItem => Boolean(item))

  if (!results.length) {
    throw new Error('No noroscope entries generated')
  }

  if (results.length < TARGET_COUNT) {
    const pool = [...results]
    while (results.length < TARGET_COUNT && pool.length) {
      results.push(pool[results.length % pool.length])
    }
  }

  const funPhrase = pickFunPhraseForLang(lang)
  return { entries: results, funPhrase }
}
