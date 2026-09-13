import { appendFileSync } from 'node:fs'
import { githubDiscoveryConfig, acquireDiscoveryRun, releaseDiscoveryRun, runDiscoveryLoop, type ProviderBatch } from '../../lib/discovery/runner'

function writeSummary(reports: ProviderBatch[], status: string) {
  if (!process.env.GITHUB_STEP_SUMMARY) return
  const rows = reports.map(r => `| ${r.provider} | ${r.pages} | ${r.inserted} | ${r.quotaDenied} | ${r.failures} | ${r.ownerSearchesEnqueued ?? 0} | ${r.ownerSchedulingFailed ? 'failed' : 'ok'} | ${Math.round(r.durationMs / 1000)}s | ${r.stopReason} |`)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
    '\n## Exploration directe GitHub', `État : ${status}. Les insertions ci-dessous s’ajoutent à l’ingestion habituelle.`, '',
    '| Fournisseur | Pages | Insérées | Quota refusé | Erreurs | Tâches curation | Planification curation | Durée | Arrêt |',
    '| --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |', ...rows, '',
  ].join('\n'))
}

async function main() {
  // No DB connection, seed, quota reservation or provider request in configuration checks or dry runs.
  if (['1', 'true'].includes(process.env.DRY_RUN ?? '')) { console.log('Discovery skipped: dry run.'); return }
  let config: ReturnType<typeof githubDiscoveryConfig>
  try { config = githubDiscoveryConfig() }
  catch (error) {
    // These validation messages contain setting names only, never their secret values.
    console.error(error instanceof Error ? error.message : 'Invalid runner configuration')
    process.exitCode = 1; return
  }
  if (process.argv.includes('--check')) { console.log(JSON.stringify({ configured: true, providers: config.providers, maxMs: config.maxMs })); return }
  const controller = new AbortController(), reports: ProviderBatch[] = []
  const stop = () => controller.abort()
  process.once('SIGINT', stop); process.once('SIGTERM', stop)
  // Covers a stuck DB/socket/cleanup as well as the normal provider deadlines.
  const hardStop = setTimeout(() => {
    console.error('Discovery stopped at its process deadline; unfinished tasks remain resumable.')
    process.exit(1)
  }, config.maxMs + 30000)
  const softStop = setTimeout(stop, config.maxMs)
  let lock: string | null = null, status = 'failed'
  let database: Awaited<ReturnType<typeof import('../../lib/db')['getDb']>> | undefined
  let connection: Promise<import('mongodb').MongoClient> | undefined
  try {
    const module = await import('../../lib/db')
    connection = module.default
    database = await module.getDb()
    lock = await acquireDiscoveryRun(database, config.maxMs)
    if (!lock) { status = 'already-running'; console.log('Discovery skipped: another direct runner owns the lease.'); return }
    const { runDiscoveryBatch } = await import('../../lib/discovery/worker')
    const result = await runDiscoveryLoop({ ...config, signal: controller.signal,
      runBatch: options => runDiscoveryBatch(database!, options),
      onStage: process.env.RANDOM_DISCOVERY_DEBUG === '1'
        ? event => console.log(JSON.stringify({ discoveryStage: event }))
        : undefined,
      onBatch: report => { reports.push(report); console.log(JSON.stringify(report)) },
    })
    const schedulingFailed = reports.some(r => r.ownerSchedulingFailed)
    const madeProgress = result.pages > 0 || result.inserted > 0
    status = schedulingFailed ? 'partial'
      : result.failures ? madeProgress ? 'completed-with-warnings' : 'failed'
      : 'completed'
    if (result.stopReason === 'cancelled') status = 'cancelled'
    console.log(JSON.stringify({ status, pages: result.pages, inserted: result.inserted, stopReason: result.stopReason }))
    if (['partial', 'failed', 'cancelled'].includes(status)) process.exitCode = 1
  } finally {
    try {
      try { if (lock && database) await releaseDiscoveryRun(database, lock) }
      finally { if (connection) await (await connection).close() }
    } finally {
      clearTimeout(softStop); clearTimeout(hardStop)
      process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop)
      writeSummary(reports, status)
    }
  }
}
main().catch(() => {
  // Do not print exceptions which might embed a MongoDB URI or a provider API key.
  console.error('Discovery failed. Check configuration (--check), database connectivity and the provider counters above.')
  process.exitCode = 1
})
