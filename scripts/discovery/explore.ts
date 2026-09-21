import { appendFileSync } from 'node:fs'
import type { Db } from 'mongodb'
import { quotaConfigFromEnv } from '../../lib/discovery/exploration'
import { youtubeBudget } from '../../lib/discovery/youtubeBudget'
import { githubDiscoveryConfig, acquireDiscoveryRun, releaseDiscoveryRun, runDiscoveryLoop, type ProviderBatch } from '../../lib/discovery/runner'
import { judge, recordRun } from '../../lib/v3/ingest/journal'

/** The journal's view of one provider's batch: judged on what it inserted, never asserted. */
async function journalBatch(db: Db, report: ProviderBatch, finishedAt: Date): Promise<void> {
  const errors = Object.entries(report.errors ?? {}).filter(([, n]) => n > 0).map(([kind, n]) => `${kind} ×${n}`)
  const counters = {
    scanned: Math.max(report.pages, report.curation?.fetched ?? 0),
    inserted: report.inserted,
    duplicates: report.curation?.duplicates ?? 0,
    rejected: { 'no-source-match': report.curation?.rejected ?? 0, ...(report.quotaDenied ? { quota: report.quotaDenied } : {}) },
  }
  await recordRun(db, {
    line: 'like-dig', startedAt: new Date(finishedAt.getTime() - report.durationMs), finishedAt,
    status: judge(counters, errors, report.stopReason === 'time-budget'), counters, errors, host: 'github',
  }).catch(() => console.warn('Journal unavailable for this batch; the batch itself is unaffected.'))
}

function writeSummary(reports: ProviderBatch[], status: string) {
  if (!process.env.GITHUB_STEP_SUMMARY) return
  const rows = reports.map(r => `| ${r.provider} | ${r.pages} | ${r.inserted} | ${r.quotaDenied} | ${r.failures} | ${r.ownerSearchesEnqueued ?? 0} | ${r.ownerSchedulingFailed ? 'failed' : 'ok'} | ${Math.round(r.durationMs / 1000)}s | ${r.stopReason} |`)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
    '\n## Exploration directe GitHub', `État : ${status}. Les insertions ci-dessous s’ajoutent à l’ingestion habituelle.`, '',
    '| Fournisseur | Pages | Insérées | Quota refusé | Erreurs | Tâches curation | Planification curation | Durée | Arrêt |',
    '| --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |', ...rows, '',
    '### Recherches issues des likes privés', '',
    '| Fournisseur | Résultats examinés | Liés au sujet | Nouvelles vidéos | Déjà présents | Rejetés |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...reports.map(r => `| ${r.provider} | ${r.curation?.fetched ?? 0} | ${r.curation?.matched ?? 0} | ${r.curation?.inserted ?? 0} | ${r.curation?.duplicates ?? 0} | ${r.curation?.rejected ?? 0} |`), '',
    '### Destinations des recherches géographiques',
    'Ce tableau mesure les recherches effectuées, pas le pays réel des vidéos obtenues.', '',
    '| Fournisseur | Destination | Pages | Résultats | Insertions |', '| --- | --- | ---: | ---: | ---: |',
    ...reports.flatMap(r => Object.entries(r.searchCoverage ?? {}).map(([area, c]) =>
      `| ${r.provider} | ${area} | ${c.pages} | ${c.fetched} | ${c.inserted} |`)), '',
  ].join('\n'))
}

async function writeQuotaSummary(db: Db) {
  if (!process.env.GITHUB_STEP_SUMMARY || process.env.RANDOM_YOUTUBE_QUOTA_ENABLED !== '1') return
  const config = quotaConfigFromEnv(), now = Date.now()
  const budgets = (['search', 'other'] as const).map(bucket => ({ bucket,
    ...youtubeBudget(config, bucket, now, process.env.RANDOM_DISCOVERY_WORKER_ENABLED === '1') }))
  const rows = await db.collection<{ _id: string; spent: number; retro?: number; trends?: number; remoteExhausted?: boolean }>('discovery_quota_v2')
    .find({ _id: { $in: budgets.map(b => `${b.day}:youtube:${b.bucket}`) } }, { timeoutMS: 1000 }).maxTimeMS(700).toArray()
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
    '\n### Budget YouTube partagé',
    'Plafonds internes du projet, pas nombre de vidéos. Le refus peut correspondre à une réserve pour le soir ou pour une autre phase.', '',
    '| Compteur | Jour Pacifique | Plafond jour | Libéré maintenant | Consommé | Réserve rétro/tendances libérée | Consommation rétro/tendances | Épuisement signalé par YouTube |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |',
    ...budgets.map(b => {
      const row = rows.find(r => r._id === `${b.day}:youtube:${b.bucket}`)
      return `| ${b.bucket} | ${b.day} | ${b.daily} | ${b.released} | ${row?.spent ?? 0} | ${b.protectedReleased} | ${row?.[b.protectedCounter] ?? 0} | ${row?.remoteExhausted ? 'oui' : 'non observé'} |`
    }), '',
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
  const controller = new AbortController(), reports: ProviderBatch[] = [], journalWrites: Promise<void>[] = []
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
    const databaseModule = await import('../../lib/db')
    connection = databaseModule.default
    database = await databaseModule.getDb()
    lock = await acquireDiscoveryRun(database, config.maxMs)
    if (!lock) { status = 'already-running'; console.log('Discovery skipped: another direct runner owns the lease.'); return }
    const { runDiscoveryBatch } = await import('../../lib/discovery/worker')
    const result = await runDiscoveryLoop({ ...config, signal: controller.signal,
      runBatch: options => runDiscoveryBatch(database!, options),
      onStage: process.env.RANDOM_DISCOVERY_DEBUG === '1'
        ? event => console.log(JSON.stringify({ discoveryStage: event }))
        : undefined,
      onBatch: report => { reports.push(report); console.log(JSON.stringify(report)); journalWrites.push(journalBatch(database!, report, new Date())) },
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
      try {
        await Promise.allSettled(journalWrites)
        if (database) await writeQuotaSummary(database).catch(() => console.warn('Quota summary unavailable; no quota value was changed.'))
        if (lock && database) await releaseDiscoveryRun(database, lock)
      }
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
