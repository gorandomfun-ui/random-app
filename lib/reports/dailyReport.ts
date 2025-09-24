import { getDb } from '@/lib/db'
import { getCronRunsBetween } from '@/lib/metrics/cron'
import { DEFAULT_USAGE_TZ, formatDayKey, getUsageForDay } from '@/lib/metrics/usage'

const DAY_MS = 24 * 60 * 60 * 1000

type ZonedInput = { year: number; month: number; day: number; hour?: number; minute?: number; second?: number }

type CountEntry = { _id: string | null; count: number }

type CronRunDoc = {
  name: string
  status: 'success' | 'failure'
  startedAt: Date
  finishedAt: Date
  durationMs?: number
  details?: Record<string, unknown>
  error?: string
}

function getTimeZoneOffset(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = dtf.formatToParts(date)
  const map: Record<string, string> = {}
  for (const part of parts) map[part.type] = part.value
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second)
  )
  return asUTC - date.getTime()
}

function zonedDate(input: ZonedInput, timeZone: string): Date {
  const base = new Date(Date.UTC(input.year, input.month - 1, input.day, input.hour ?? 0, input.minute ?? 0, input.second ?? 0))
  const offset = getTimeZoneOffset(base, timeZone)
  return new Date(base.getTime() - offset)
}

function getPreviousDayRange(reference: Date, timeZone: string) {
  const prev = new Date(reference.getTime() - DAY_MS)
  const key = formatDayKey(prev, timeZone)
  const [year, month, day] = key.split('-').map((value) => Number(value))

  const nextDayDate = new Date(Date.UTC(year, month - 1, day))
  nextDayDate.setUTCDate(nextDayDate.getUTCDate() + 1)

  const start = zonedDate({ year, month, day }, timeZone)
  const end = zonedDate({
    year: nextDayDate.getUTCFullYear(),
    month: nextDayDate.getUTCMonth() + 1,
    day: nextDayDate.getUTCDate(),
  }, timeZone)

  return { key, start, end }
}

async function aggregateByType(field: 'createdAt' | 'updatedAt', start: Date, end: Date) {
  const db = await getDb()
  const cursor = db.collection('items').aggregate<CountEntry>([
    { $match: { [field]: { $gte: start, $lt: end } } },
    { $group: { _id: '$type', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ])

  const list = await cursor.toArray()
  const map: Record<string, number> = {}
  let total = 0
  for (const row of list) {
    if (!row?._id) continue
    map[row._id] = row.count
    total += row.count
  }
  return { list, map, total }
}

async function aggregateInventory() {
  const db = await getDb()
  const list = await db.collection('items').aggregate<CountEntry>([
    { $group: { _id: '$type', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]).toArray()
  const map: Record<string, number> = {}
  let total = 0
  for (const row of list) {
    if (!row?._id) continue
    map[row._id] = row.count
    total += row.count
  }
  return { list, map, total }
}

type CronSummaryEntry = {
  name: string
  total: number
  success: number
  failure: number
  lastRun: CronRunDoc | null
}

function summarizeCronRuns(runs: CronRunDoc[]): CronSummaryEntry[] {
  const byName = new Map<string, {
    name: string
    total: number
    success: number
    failure: number
    lastRun: CronRunDoc | null
  }>()

  for (const run of runs) {
    const bucket = byName.get(run.name) || { name: run.name, total: 0, success: 0, failure: 0, lastRun: null }
    bucket.total += 1
    if (run.status === 'success') bucket.success += 1
    else bucket.failure += 1
    bucket.lastRun = run
    byName.set(run.name, bucket)
  }

  return Array.from(byName.values())
}

export type CronSummary = CronSummaryEntry[]

export type DailyReportData = {
  dayKey: string
  timeZone: string
  range: { start: Date; end: Date }
  ingestion: {
    created: { total: number; map: Record<string, number>; list: CountEntry[] }
    updated: { total: number; map: Record<string, number>; list: CountEntry[] }
  }
  cron: {
    runs: CronRunDoc[]
    summary: CronSummary
  }
  usage: any
  inventory: { total: number; map: Record<string, number>; list: CountEntry[] }
}

export async function buildDailyReport(reference: Date = new Date(), timeZone = DEFAULT_USAGE_TZ): Promise<DailyReportData> {
  const { key, start, end } = getPreviousDayRange(reference, timeZone)

  const [created, updated, cronRaw, usage, inventory] = await Promise.all([
    aggregateByType('createdAt', start, end),
    aggregateByType('updatedAt', start, end),
    getCronRunsBetween(start, end),
    getUsageForDay(key),
    aggregateInventory(),
  ])

  const cronRuns: CronRunDoc[] = (cronRaw || []).map((raw: unknown) => {
    const run = (raw as Record<string, unknown>) || {}
    const startedAtRaw = run.startedAt
    const finishedAtRaw = run.finishedAt
    return {
      name: typeof run.name === 'string' ? run.name : 'unknown',
      status: run.status === 'success' ? 'success' : 'failure',
      startedAt: startedAtRaw instanceof Date ? startedAtRaw : new Date(startedAtRaw ?? start),
      finishedAt: finishedAtRaw instanceof Date ? finishedAtRaw : new Date(finishedAtRaw ?? start),
      durationMs: typeof run.durationMs === 'number' ? run.durationMs : undefined,
      details: typeof run.details === 'object' && run.details ? run.details as Record<string, unknown> : undefined,
      error: typeof run.error === 'string' ? run.error : undefined,
    }
  })

  return {
    dayKey: key,
    timeZone,
    range: { start, end },
    ingestion: {
      created,
      updated,
    },
    cron: {
      runs: cronRuns,
      summary: summarizeCronRuns(cronRuns),
    },
    usage: usage || null,
    inventory,
  }
}
