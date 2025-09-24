import { getDb } from '@/lib/db'

export type ItemType = 'image' | 'quote' | 'fact' | 'joke' | 'video' | 'web'
export type Lang = 'en' | 'fr' | 'de' | 'jp' | 'unknown'

const ALLOWED_TYPES = new Set<ItemType>(['image', 'quote', 'fact', 'joke', 'video', 'web'])
const ALLOWED_LANGS = new Set<Lang>(['en', 'fr', 'de', 'jp', 'unknown'])
const USAGE_COLLECTION = process.env.REPORT_USAGE_COLLECTION || 'daily_usage'
export const DEFAULT_USAGE_TZ = process.env.REPORT_TIMEZONE || 'Europe/Paris'

type UsageEvent = {
  type?: string | null
  lang?: string | null
  provider?: string | null
  source?: string | null
}

export type UsageCounts = {
  total?: number
  byType?: Record<string, number>
  byLang?: Record<string, number>
  byProvider?: Record<string, number>
}

export type UsageDocument = {
  date: string
  createdAt?: Date
  updatedAt?: Date
  counts?: UsageCounts
}

export function formatDayKey(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(date) // en-CA => YYYY-MM-DD
}

function sanitizeFieldKey(value: string): string {
  const cleaned = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^[_-]+/, '')
    .replace(/[_-]+$/, '')
  return cleaned || 'unknown'
}

export async function recordDailyUsage(event: UsageEvent = {}): Promise<void> {
  try {
    const typeRaw = (event.type || '').toLowerCase()
    const type = (ALLOWED_TYPES.has(typeRaw as ItemType) ? typeRaw : 'unknown') as ItemType | 'unknown'
    const langRaw = (event.lang || 'unknown').toLowerCase()
    const lang = (ALLOWED_LANGS.has(langRaw as Lang) ? langRaw : 'unknown') as Lang
    const providerRaw = event.provider || event.source || ''
    const provider = providerRaw ? sanitizeFieldKey(providerRaw) : 'unknown'

    const now = new Date()
    const dayKey = formatDayKey(now, DEFAULT_USAGE_TZ)

    const db = await getDb()
    const coll = db.collection(USAGE_COLLECTION)

    const inc: Record<string, number> = {
      'counts.total': 1,
      [`counts.byLang.${lang}`]: 1,
      [`counts.byProvider.${provider}`]: 1,
    }

    if (type !== 'unknown') inc[`counts.byType.${type}`] = 1
    else inc['counts.byType.unknown'] = 1

    await coll.updateOne(
      { date: dayKey },
      {
        $setOnInsert: { date: dayKey, createdAt: now },
        $set: { updatedAt: now },
        $inc: inc,
      },
      { upsert: true }
    )
  } catch (error) {
    console.error('recordDailyUsage failed', error)
  }
}

export async function getUsageForDay(dayKey: string): Promise<UsageDocument | null> {
  try {
    const db = await getDb()
    const coll = db.collection<UsageDocument>(USAGE_COLLECTION)
    return coll.findOne({ date: dayKey })
  } catch (error) {
    console.error('getUsageForDay failed', error)
    return null
  }
}
