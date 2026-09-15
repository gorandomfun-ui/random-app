import { ObjectId, type Db } from 'mongodb'
import { randomUUID } from 'node:crypto'
import type { Profile } from './types'
import { SUBJECT_VERSION } from './subjects'
import { createSubjectSearches } from './subjectExploration'
import { enqueue, type SearchSpec, type SubjectScope, type DiscoveryProvider } from './exploration'
import { buildProfile } from './profile'
import { legacySourceSnapshot } from './backfill'

export type PublicSubjectExploration = { _id: string; itemId: string; profile: Profile;
  rotation: Partial<Record<DiscoveryProvider, number>>; requestedAt: Date; expiresAt: Date;
  due: Date; leaseUntil: Date; leaseToken?: string; lastScheduledAt?: Date; lastOutcome?: string }
export const publicSubjects = (db: Db) => db.collection<PublicSubjectExploration>('discovery_public_subjects_v1')
const subjectKey = (profile: Profile) => profile.subject?.primary?.entityId
  ? `wikidata:${profile.subject.primary.entityId}` : profile.subject?.primary?.key

/** Same portfolio as curation; public Waves always keep their original primary subject. */
export function gapSearches(profile: Profile, now: number, rotation = 0): SearchSpec[] {
  const primaryOnly = profile.subject ? { ...profile, subject: { ...profile.subject, secondary: [] } } : profile
  return createSubjectSearches(primaryOnly, { ownerId: '', referenceKey: '' }, now, rotation).flatMap(spec => {
    if (spec.kind !== 'search' || !spec.focus) return []
    const { subject, subjectVersion, branch, angle } = spec.focus
    const subjectScope: SubjectScope = { subject, subjectVersion, branch, angle }
    const rest = { ...spec }; delete rest.focus
    return [{ ...rest, subjectScope }]
  })
}

/** One durable rotation per subject, independent of the particular public item that exposed a gap. */
export async function registerPublicSubject(db: Db, itemId: string, profile: Profile, now: number): Promise<void> {
  const key = subjectKey(profile)
  if (!key || profile.metadataQuality === 'unverified' || profile.subject?.version !== SUBJECT_VERSION) return
  const collection = publicSubjects(db)
  const update = { $set: { itemId, profile, expiresAt: new Date(now + 90 * 86400000) },
    $setOnInsert: { rotation: {}, requestedAt: new Date(now), due: new Date(now), leaseUntil: new Date(0) } }
  try { await collection.updateOne({ _id: key }, update, { upsert: true, maxTimeMS: 700 }) }
  catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error
    await collection.updateOne({ _id: key }, { $set: update.$set }, { maxTimeMS: 700 })
  }
}

/** Schedule <=2 subjects / <=8 searches per pass. No provider requests and no raised quotas.
 * A successful run advances each enabled provider once; a partial write retries the same task IDs. */
export async function schedulePublicSubjects(db: Db, now: number, options: { signal?: AbortSignal; maxMs?: number } = {}) {
  const providers: DiscoveryProvider[] = [
    ...(process.env.YOUTUBE_API_KEY ? ['youtube' as const] : []),
    ...(process.env.RANDOM_DM_DISCOVERY_ENABLED === '1' ? ['dailymotion' as const] : []),
  ]
  const report = { subjects: 0, searches: 0, errors: 0 }
  if (!providers.length || options.signal?.aborted || process.env.RANDOM_SUBJECT_MAINTENANCE_ENABLED === '0') return report
  const deadline = Date.now() + Math.max(0, Math.min(10000, options.maxMs ?? 10000))
  const collection = publicSubjects(db)
  for (let attempts = 0; attempts < 6 && report.subjects < 2 && Date.now() < deadline - 700 && !options.signal?.aborted; attempts++) {
    const leaseToken = randomUUID()
    const job = await collection.findOneAndUpdate({ due: { $lte: new Date(now) }, leaseUntil: { $lte: new Date(now) },
      expiresAt: { $gt: new Date(now) } }, { $set: { leaseUntil: new Date(now + 120000), leaseToken } },
    { sort: { due: 1, _id: 1 }, returnDocument: 'after', maxTimeMS: 700 })
    if (!job) break
    const fence = { _id: job._id, leaseToken }
    try {
      const row = ObjectId.isValid(job.itemId) ? await db.collection('items').findOne({ _id: new ObjectId(job.itemId) }, { timeoutMS: 800 }) : null
      const profile = row ? buildProfile(legacySourceSnapshot(row)) : undefined
      if (!profile || subjectKey(profile) !== job._id || profile.metadataQuality === 'unverified') {
        // Never keep using an identity after its source changed or disappeared.
        await collection.updateOne(fence, { $set: { due: new Date(now + 86400000), leaseUntil: new Date(0),
          lastOutcome: 'source-changed-or-missing' }, $unset: { leaseToken: '' } }, { maxTimeMS: 700 })
        continue
      }
      const rotation = { ...job.rotation }
      let count = 0
      for (const provider of providers) {
        const turn = rotation[provider] ?? 0
        for (const spec of gapSearches(profile, now, turn)) {
          if (Date.now() >= deadline || options.signal?.aborted) throw new Error('scheduling-deadline')
          if (provider === 'youtube') await enqueue(db, spec, 0, false, now)
          else if (spec.kind === 'search') await enqueue(db, { kind: 'dailymotion', query: spec.query,
            after: spec.after, before: spec.before, sort: spec.order === 'date' ? 'recent' : 'relevance',
            subjectScope: spec.subjectScope, coverage: spec.coverage }, 0, false, now)
          count++
        }
        rotation[provider] = turn + 1
      }
      const result = await collection.updateOne(fence, { $set: { profile, rotation, due: new Date(now + 86400000),
        leaseUntil: new Date(0), lastScheduledAt: new Date(now), lastOutcome: 'scheduled' }, $unset: { leaseToken: '' } }, { maxTimeMS: 700 })
      if (result.matchedCount) { report.subjects++; report.searches += count }
    } catch {
      report.errors++
      await collection.updateOne(fence, { $set: { due: new Date(now + 3600000), leaseUntil: new Date(0),
        lastOutcome: 'scheduling-retry' }, $unset: { leaseToken: '' } }, { maxTimeMS: 700 })
    }
  }
  return report
}
