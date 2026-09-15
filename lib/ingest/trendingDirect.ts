/** Sequential, independently reported provider/region batches. Never retries a write. */
export type TrendBatch = { provider: 'youtube' | 'dailymotion'; region: string }
export type TrendResult = { inserted: number; updated: number; scanned: number; existingSkipped?: number;
  warnings?: { label: string; message?: string }[] }
export async function runTrendingBatches(
  regions: string[], ingest: (batch: TrendBatch) => Promise<TrendResult>,
  report: (event: Record<string, unknown>, snapshot: TrendSummary) => void = () => {},
) {
  const result = { inserted: 0, updated: 0, scanned: 0, existingSkipped: 0,
    providerCounts: {} as Record<string, number>, batches: [] as Record<string, unknown>[] }
  for (const region of [...new Set(regions)].slice(0, 2)) for (const provider of ['youtube', 'dailymotion'] as const) {
    const started = Date.now()
    try {
      const batch = await ingest({ provider, region })
      result.inserted += batch.inserted; result.updated += batch.updated; result.scanned += batch.scanned
      result.existingSkipped += batch.existingSkipped ?? 0
      result.providerCounts[provider] = (result.providerCounts[provider] ?? 0) + batch.scanned
      // Messages can contain upstream URLs: report labels, never free-form provider errors.
      const event = { provider, region, status: batch.warnings?.length ? 'warning' : 'completed',
        fetched: batch.scanned, inserted: batch.inserted, updated: batch.updated,
        duplicates: batch.existingSkipped ?? 0, warnings: batch.warnings?.map(w => w.label) ?? [], elapsedMs: Date.now() - started }
      result.batches.push(event); report(event, result)
    } catch {
      const event = { provider, region, status: 'failed', elapsedMs: Date.now() - started }
      result.batches.push(event); report(event, result)
    }
  }
  return result
}
export type TrendSummary = { inserted: number; updated: number; scanned: number; existingSkipped: number;
  providerCounts: Record<string, number>; batches: Record<string, unknown>[] }
