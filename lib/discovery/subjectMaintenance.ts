import { ObjectId, type Db } from 'mongodb'
import { legacySourceSnapshot } from './backfill'
import { buildProfile } from './profile'
import { resolveSourceEntity } from './entityResolver'
import { repairMetadataBatch } from './metadataRepair'
import { claimSubjectWork, requestSubjectWork, subjectWorkCollection } from './subjectWork'
import { curatorOwnerId } from './curatorAuth'
import { registerPublicSubject, schedulePublicSubjects } from './publicSubjectExploration'
export { gapSearches } from './publicSubjectExploration'
import type { CatalogueRow } from './catalog'

export type MaintenanceReport = { claimed: number; repaired: number; resolved: number; profiled: number; searches: number; publicSubjects: number; retry: number; unresolved: number; errors: number }

/** Max 12 content jobs and 60 seconds by default. All provider calls occur in GitHub, never in Random. */
export async function maintainSubjects(db: Db, options: { signal?: AbortSignal; maxMs?: number; maxItems?: number;
  now?: () => number; request?: typeof fetch; repair?: typeof repairMetadataBatch; resolve?: typeof resolveSourceEntity } = {}): Promise<MaintenanceReport> {
  const now = options.now ?? Date.now, deadline = now() + Math.min(60000, options.maxMs ?? 60000)
  const maxItems = Math.max(1, Math.min(12, options.maxItems ?? 12))
  const report: MaintenanceReport = { claimed: 0, repaired: 0, resolved: 0, profiled: 0, searches: 0, publicSubjects: 0, retry: 0, unresolved: 0, errors: 0 }
  const refs = await db.collection('discovery_owner_references_v2').find({ ownerId: curatorOwnerId(), active: true },
    { projection: { itemId: 1 }, timeoutMS: 800 }).sort({ subjectMaintenanceAt: 1, _id: 1 }).limit(6).toArray()
  for (const ref of refs) {
    if (typeof ref.itemId === 'string') await requestSubjectWork(db, ref.itemId, 'curation-reference', now(), true)
    await db.collection('discovery_owner_references_v2').updateOne({ _id: ref._id, active: true },
      { $set: { subjectMaintenanceAt: new Date(now()) } }, { maxTimeMS: 400 })
  }
  const jobs = []
  while (jobs.length < maxItems && now() < deadline - 1000 && !options.signal?.aborted) {
    const job = await claimSubjectWork(db, now()); if (!job) break
    jobs.push(job)
  }
  report.claimed = jobs.length
  const ids = jobs.map(job => new ObjectId(job._id))
  let rows: CatalogueRow[] = await db.collection('items').find({ _id: { $in: ids } }, { timeoutMS: 800 }).toArray()
  const failed = new Set<string>()
  // Targeted real titles repair the old Dailymotion query-as-title data. A repair is an ID lookup,
  // in batches of <=50; it consumes no YouTube search quota. Existing opt-out remains respected.
  if (process.env.RANDOM_METADATA_REPAIR_ENABLED === '1') {
    for (const provider of ['youtube', 'dailymotion'] as const) {
      const stale = rows.filter(row => row.provider === provider && (legacySourceSnapshot(row).legacyUnverified || !buildProfile(legacySourceSnapshot(row)).subject?.primary))
      if (!stale.length || now() > deadline - 21000 || options.signal?.aborted) continue
      try {
        const outcome = await (options.repair ?? repairMetadataBatch)(db, provider, stale, { signal: options.signal, request: options.request, now: now() })
        report.repaired += outcome.updated
      } catch { report.errors++; stale.forEach(row => failed.add(String(row._id))) }
    }
    rows = await db.collection('items').find({ _id: { $in: ids } }, { timeoutMS: 800 }).toArray()
  }
  for (const job of jobs) {
    const fence = { _id: job._id, leaseToken: job.leaseToken }
    const finish = async (outcome: string, retry: boolean, subject?: string) => {
      if (retry) report.retry++
      await subjectWorkCollection(db).updateOne(fence, { $set: { status: retry ? 'pending' : 'done',
        due: new Date(now() + Math.min(24, 2 ** Math.min(5, job.attempts)) * 3600000), leaseUntil: new Date(0),
        lastOutcome: outcome, subject: subject ?? null }, $inc: { attempts: 1 }, $unset: { leaseToken: '' } }, { maxTimeMS: 700 })
    }
    // Reserve time for the existing public rotations even during a metadata-repair backlog.
    if (now() > deadline - 11000 || options.signal?.aborted) { await finish('deferred-deadline', true); continue }
    const row = rows.find(row => String(row._id) === job._id)
    if (!row) { await finish('item-missing', false); continue }
    try {
      const source = legacySourceSnapshot(row)
      if (source.legacyUnverified) { await finish(failed.has(job._id) ? 'provider-failed' : 'needs-provider-metadata', true); continue }
      let hint: Awaited<ReturnType<typeof resolveSourceEntity>>, resolverFailed = false
      try { hint = await (options.resolve ?? resolveSourceEntity)(db, source, { signal: options.signal, request: options.request, now: now(), maxMs: deadline - now() - 1000 }) }
      catch { resolverFailed = true; report.errors++ }
      const enriched = hint ? { ...source, primarySubject: hint } : source
      const profile = buildProfile(enriched)
      const update = await db.collection('items').updateOne({ _id: row._id as ObjectId,
        sourceMetadata: row.sourceMetadata ?? null, metadataRefreshedAt: row.metadataRefreshedAt ?? null,
        title: row.title ?? null, description: row.description ?? null,
      }, { $set: { sourceMetadata: enriched, discoveryProfile: profile, discoveryFamily: profile.family,
        discoveryVersion: 2, subjectCheckedAt: new Date(now()) } }, { maxTimeMS: 700 })
      if (!update.matchedCount) { await finish('source-changed', true); continue }
      report.profiled++; if (hint) report.resolved++
      const primary = profile.subject?.primary
      if (!primary) { report.unresolved++; await finish(resolverFailed ? 'entity-service-unavailable' : 'subject-unresolved', resolverFailed); continue }
      if (job.reason !== 'curation-reference') await registerPublicSubject(db, job._id, profile, now())
      await finish(resolverFailed ? 'entity-service-unavailable' : hint ? 'canonical-subject' : 'source-subject', resolverFailed, primary.key)
    } catch { report.errors++; await finish('maintenance-error', true) }
  }
  // This also runs when no NEW Wave gap was queued: exploration must continue by itself.
  const publicReport = await schedulePublicSubjects(db, now(), { signal: options.signal, maxMs: deadline - now() })
  report.publicSubjects = publicReport.subjects; report.searches += publicReport.searches; report.errors += publicReport.errors
  return report
}
