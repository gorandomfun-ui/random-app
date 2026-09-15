import { ObjectId, type Db } from 'mongodb'
import { profileFromRow } from './catalog'
import { SIGNAL_VERSION } from './profile'
import { subjectWorkCollection } from './subjectWork'
import { SUBJECT_VERSION } from './subjects'
import { loadOwnerReferences } from './ownerStore'
import type { OwnerReference } from './editorial'

export type CurationInspection = {
  active: boolean; itemId: string; title: string; subject: string | null;
  tentative: boolean; evidence: string | null; canonicalId?: string | null; maintenance?: string | null;
  state: 'inactive' | 'needs-metadata' | 'needs-subject' | 'waiting' | 'scheduled';
  sampledTasks: number; measuredTasks: number; outdatedTasks: number;
  taskSampleCapped: boolean; inserted: number; matched: number;
  lastAttemptAt: string | null;
  recentTasks: { provider: string; query: string; angle: string; outcome: string; inserted: number | null }[];
}

/** Private, bounded, read-only observations. A scheduled query is never called an insertion. */
export async function inspectCuration(db: Db, ownerId: string, itemId: string): Promise<CurationInspection | null> {
  if (!ownerId || !/^[a-f\d]{24}$/i.test(itemId)) return null
  const [row, ref] = await Promise.all([
    db.collection('items').findOne({ _id: new ObjectId(itemId) }, { timeoutMS: 800 }),
    db.collection<OwnerReference>('discovery_owner_references_v2').findOne({ ownerId, itemId }, { timeoutMS: 800 }),
  ])
  if (!row) return null
  const work = await subjectWorkCollection(db).findOne({ _id: itemId }, { timeoutMS: 300 }).catch(() => null)
  const profile = profileFromRow(row), subject = profile.subject?.primary
  const tasks = ref ? await db.collection('discovery_tasks_v2').find({
    'spec.focus.ownerId': ownerId, 'spec.focus.referenceKey': ref.contentKey,
  }, { projection: { spec: 1, insertedTotal: 1, matchedTotal: 1, lastAttemptAt: 1, lastOutcome: 1 }, timeoutMS: 1000 })
    .limit(120).toArray() : []
  const current = tasks.filter(t => t.spec?.focus?.subjectVersion === SUBJECT_VERSION &&
    (!t.spec?.focus?.referenceRevision || t.spec.focus.referenceRevision === profile.sourceRevision))
  const refreshed = ref?.profile.signalVersion === SIGNAL_VERSION && ref.profile.subject?.version === SUBJECT_VERSION &&
    ref.profile.sourceRevision === profile.sourceRevision
  const ordered = [...current].sort((a, b) => Number(b.lastAttemptAt ?? 0) - Number(a.lastAttemptAt ?? 0))
  const last = ordered[0]?.lastAttemptAt
  return { active: Boolean(ref?.active), itemId, title: String(row.title ?? row.text ?? profile.subject?.title ?? '').slice(0, 500),
    subject: subject?.label ?? null, canonicalId: subject?.entityId ?? null, maintenance: work?.lastOutcome ?? (work ? 'pending' : null), tentative: Boolean(subject?.tentative), evidence: subject?.evidence ?? null,
    state: !ref?.active ? 'inactive' : profile.metadataQuality === 'unverified' ? 'needs-metadata' : !subject ? 'needs-subject'
      : refreshed && ref.explorationState === 'scheduled' ? 'scheduled' : 'waiting',
    sampledTasks: current.length, measuredTasks: current.filter(t => t.insertedTotal != null).length,
    outdatedTasks: tasks.length - current.length, taskSampleCapped: tasks.length === 120,
    inserted: current.reduce((n, t) => n + Number(t.insertedTotal ?? 0), 0),
    matched: current.reduce((n, t) => n + Number(t.matchedTotal ?? 0), 0),
    lastAttemptAt: last instanceof Date ? last.toISOString() : null,
    recentTasks: ordered.slice(0, 6).map(t => ({ provider: t.spec?.kind === 'dailymotion' ? 'Dailymotion' : 'YouTube',
      query: String(t.spec?.query ?? t.spec?.channelId ?? t.spec?.playlistId ?? ''),
      angle: String(t.spec?.focus?.angle ?? ''), outcome: String(t.lastOutcome ?? 'queued'),
      inserted: typeof t.insertedTotal === 'number' ? t.insertedTotal : null })),
  }
}

export async function listCurationInspection(db: Db, ownerId: string) {
  const refs = await loadOwnerReferences(db, ownerId)
  return refs.slice(0, 20).map(ref => ({ itemId: ref.itemId, title: ref.profile.subject?.title ?? ref.contentKey,
    subject: ref.profile.subject?.primary?.label ?? null }))
}
