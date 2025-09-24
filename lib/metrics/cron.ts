import { getDb } from '@/lib/db'

export type CronStatus = 'success' | 'failure'
export type CronTrigger = 'cron' | 'manual' | 'unknown'

const CRON_COLLECTION = process.env.REPORT_CRON_COLLECTION || 'cron_runs'

export type CronRunEntry = {
  name: string
  status: CronStatus
  startedAt: Date
  finishedAt: Date
  triggeredBy?: CronTrigger
  durationMs?: number
  details?: Record<string, unknown>
  error?: string | null
}

function safeDetails(details: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!details) return undefined
  try {
    const result: Record<string, unknown> = {}
    const entries = Object.entries(details)
    for (const [key, value] of entries.slice(0, 20)) {
      if (typeof value === 'object' && value !== null) {
        try {
          const json = JSON.parse(JSON.stringify(value))
          result[key] = json
        } catch {
          result[key] = String(value)
        }
      } else {
        result[key] = value
      }
    }
    if (entries.length > 20) result._truncated = entries.length - 20
    return result
  } catch {
    return undefined
  }
}

export async function logCronRun(entry: CronRunEntry): Promise<void> {
  try {
    const db = await getDb()
    const coll = db.collection(CRON_COLLECTION)
    const safeEntry: Record<string, unknown> = {
      name: entry.name,
      status: entry.status,
      startedAt: entry.startedAt,
      finishedAt: entry.finishedAt,
      durationMs: entry.durationMs ?? Math.max(0, entry.finishedAt.getTime() - entry.startedAt.getTime()),
      triggeredBy: entry.triggeredBy || 'unknown',
      createdAt: new Date(),
    }
    if (entry.details) safeEntry.details = safeDetails(entry.details)
    if (entry.error) safeEntry.error = entry.error
    await coll.insertOne(safeEntry)
  } catch (error) {
    console.error('logCronRun failed', error)
  }
}

export async function getCronRunsBetween(start: Date, end: Date, names?: string[]) {
  try {
    const db = await getDb()
    const coll = db.collection(CRON_COLLECTION)
    const query: Record<string, unknown> = {
      startedAt: { $gte: start, $lt: end },
    }
    if (names && names.length) query.name = { $in: names }
    return coll
      .find(query)
      .sort({ startedAt: 1 })
      .toArray()
  } catch (error) {
    console.error('getCronRunsBetween failed', error)
    return []
  }
}
