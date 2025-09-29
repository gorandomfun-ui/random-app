import type { RawVideo } from '@/lib/ingest/videos'
import type { FetchWarning } from '@/lib/ingest/videos'

export type IngestResult = {
  scanned: number
  unique: number
  inserted: number
  updated: number
  dryRun?: boolean
  sample?: RawVideo[]
  providerCounts?: Record<string, number>
  warnings?: FetchWarning[]
  skippedInvalid?: number
  providers?: string[]
}
