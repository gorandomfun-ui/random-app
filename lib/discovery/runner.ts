import { randomUUID } from 'node:crypto'
import type { Db } from 'mongodb'
import { quotaConfigFromEnv, withAbortDeadline, type DiscoveryProvider, type ExplorationReport } from './exploration'
import type { DiscoveryBatchOptions, DiscoveryStage } from './worker'

export function githubDiscoveryConfig() {
  if (process.env.RANDOM_DISCOVERY_WORKER_ENABLED !== '1') throw new Error('RANDOM_DISCOVERY_WORKER_ENABLED must be 1')
  if (!process.env.MONGODB_URI && !process.env.MONGO_URI) throw new Error('Missing MongoDB URI secret')
  if (!process.env.MONGODB_DB && !process.env.MONGO_DB) throw new Error('Missing explicit MongoDB database name')
  const minutes = Number(process.env.RANDOM_DISCOVERY_GITHUB_MINUTES || 5)
  if (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > 10) throw new Error('RANDOM_DISCOVERY_GITHUB_MINUTES must be between 1 and 10')
  const providers: DiscoveryProvider[] = []
  if (process.env.RANDOM_YOUTUBE_QUOTA_ENABLED === '1') {
    if (!process.env.YOUTUBE_API_KEY) throw new Error('Missing YOUTUBE_API_KEY secret')
    const quota = quotaConfigFromEnv()
    for (const [daily, reserve] of [[quota.searchDailyLimit, quota.searchBaseReserve], [quota.otherDailyLimit, quota.otherBaseReserve]]) {
      if (!Number.isSafeInteger(daily) || !Number.isSafeInteger(reserve) || daily <= 0 || reserve < 0 || reserve > daily) throw new Error('Invalid explicit YouTube quota values')
    }
    if (!Number.isSafeInteger(quota.extraSearchLimit) || quota.extraSearchLimit < 0) throw new Error('Invalid YouTube extra search limit')
    providers.push('youtube')
  }
  if (process.env.RANDOM_DM_DISCOVERY_ENABLED === '1') {
    const limit = Number(process.env.RANDOM_DM_DISCOVERY_DAILY_LIMIT ?? 60)
    if (!Number.isSafeInteger(limit) || limit < 0 || limit > 200) throw new Error('Invalid Dailymotion daily limit')
    if (limit > 0) providers.push('dailymotion')
  }
  if (!providers.length) throw new Error('No enabled discovery provider')
  return { providers, maxMs: minutes * 60000 }
}

type RunLease = { _id: string; token: string; leaseUntil: Date }
const LOCK_ID = 'github-discovery-run'

/** The existing scheduler collection and its _id index suffice; no catalogue migration. */
export async function acquireDiscoveryRun(db: Db, maxMs: number, now = Date.now()): Promise<string | null> {
  const token = randomUUID()
  try {
    const lock = await db.collection<RunLease>('discovery_scheduler_v2').findOneAndUpdate(
      { _id: LOCK_ID, leaseUntil: { $lte: new Date(now) } },
      { $set: { token, leaseUntil: new Date(now + maxMs + 120000) } },
      { upsert: true, returnDocument: 'after', maxTimeMS: 1000 },
    )
    return lock?.token === token ? token : null
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return null
    throw error
  }
}

export async function releaseDiscoveryRun(db: Db, token: string) {
  await db.collection<RunLease>('discovery_scheduler_v2').deleteOne({ _id: LOCK_ID, token }, { maxTimeMS: 1000 })
}

export type BatchReport = ExplorationReport & { ownerSearchesEnqueued?: number; ownerSchedulingFailed?: boolean }
export type ProviderBatch = BatchReport & { provider: DiscoveryProvider; durationMs: number }

/** Providers take turns. An empty, exhausted or failing provider yields to the other. */
export async function runDiscoveryLoop(options: {
  providers: readonly DiscoveryProvider[]; maxMs: number; signal?: AbortSignal; now?: () => number; batchDeadlineMs?: number;
  runBatch: (options: DiscoveryBatchOptions) => Promise<BatchReport>;
  onBatch?: (report: ProviderBatch) => void;
  onStage?: (event: { provider: DiscoveryProvider; stage: DiscoveryStage }) => void;
}) {
  const now = options.now ?? Date.now, deadline = now() + Math.min(600000, options.maxMs)
  const active = [...new Set(options.providers)], seededProviders = new Set<DiscoveryProvider>()
  const reports: ProviderBatch[] = []
  while (active.length && reports.length < 8 && now() < deadline - 20000 && !options.signal?.aborted) {
    const provider = active.shift()!, started = now()
    // Divide a short remaining budget so the second provider still gets a turn.
    const maxMs = Math.min(90000, Math.floor((deadline - started) / (active.length + 1)))
    if (maxMs < 20000) break
    const batchDeadlineMs = Math.min(maxMs, Math.max(1, options.batchDeadlineMs ?? maxMs))
    let result: BatchReport
    try {
      result = await withAbortDeadline(batchDeadlineMs, options.signal, signal => options.runBatch({
        provider, seed: !seededProviders.has(provider), maxMs: batchDeadlineMs, signal,
        onStage: stage => options.onStage?.({ provider, stage }),
      }))
    } catch (error) {
      if (options.signal?.aborted) break
      if (!(error instanceof DOMException) || error.name !== 'TimeoutError') throw error
      result = { pages: 0, inserted: 0, failures: 1, quotaDenied: 0,
        errors: { timeout: 1, rateLimit: 0, http: 0, other: 0 }, stopReason: 'provider-errors' }
    }
    seededProviders.add(provider)
    const report = { ...result, provider, durationMs: now() - started }
    reports.push(report); options.onBatch?.(report)
    if (result.pages > 0 && !['quota', 'provider-errors', 'cancelled', 'idle'].includes(result.stopReason)) active.push(provider)
  }
  return { reports, pages: reports.reduce((n, r) => n + r.pages, 0), inserted: reports.reduce((n, r) => n + r.inserted, 0),
    failures: reports.reduce((n, r) => n + r.failures, 0),
    stopReason: options.signal?.aborted ? 'cancelled' : !active.length ? 'providers-finished' : reports.length >= 8 ? 'batch-budget' : 'time-budget' }
}
