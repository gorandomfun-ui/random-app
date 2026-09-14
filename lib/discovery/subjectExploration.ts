import type { Db } from 'mongodb'
import { ObjectId } from 'mongodb'
import type { Profile } from './types'
import type { OwnerReference } from './editorial'
import { hydrateOwnerReferences } from './ownerStore'
import { enqueue, type SearchSpec, type DiscoveryFocus, type DiscoveryProvider } from './exploration'
import { SUBJECT_VERSION, type Subject } from './subjects'
import { curatorOwnerId } from './curatorAuth'

/** Different treatments of a subject, not a list of hand-picked creators or videos. */
export const SUBJECT_ANGLES = [
  ['open', '', '', '', '', ''],
  ['collection', 'collectionneur', 'collection|memorabilia', 'Sammlung', 'colección', 'コレクション'],
  ['visual-art', 'caricature|dessin|sculpture', 'drawing|painting|sculpture', 'Zeichnung|Skulptur', 'dibujo|escultura', '似顔絵'],
  ['reinterpretation', 'reprise|imitation', 'cover|reenactment', 'Cover|Nachahmung', 'versión|imitación', 'カバー'],
  ['personal', 'souvenir personnel|vidéo de famille', 'home video|personal memories', 'privates Video', 'video casero', 'ホームビデオ'],
  ['interview', 'interview|témoignage', 'interview|memories', 'Interview|Erinnerung', 'entrevista|recuerdos', 'インタビュー'],
  ['fun', 'parodie|drôle', 'parody|funny', 'Parodie|lustig', 'parodia|divertido', 'パロディ'],
  ['unusual', 'insolite|expérimental', 'unusual|experimental', 'ungewöhnlich|experimentell', 'insólito|experimental', '実験'],
  ['archive', 'archive|reportage', 'archive|documentary', 'Archiv|Dokumentation', 'archivo|documental', 'アーカイブ'],
  ['fan', 'fan|amateur', 'fan|amateur', 'Fan|Amateur', 'fan|aficionado', 'ファン'],
  ['behind-scenes', 'coulisses', 'behind the scenes', 'hinter den Kulissen', 'detrás de cámaras', '舞台裏'],
  ['local', 'fête de village', 'local festival|community', 'Dorffest', 'fiesta local', '地域祭り'],
  ['open', '', '', '', '', ''],
  ['craft', 'fabrication artisanale', 'handmade|DIY', 'selbstgemacht', 'hecho a mano', '手作り'],
  ['current', '', '', '', '', ''],
  ['performance', 'performance|spectacle', 'performance|show', 'Aufführung', 'actuación', 'パフォーマンス'],
] as const
const LANGUAGES = ['fr', 'en', 'de', 'es', 'ja'] as const
type OwnerScope = { ownerId: string; referenceKey: string; referenceRevision?: string }

export function createSubjectSearches(profile: Profile, scope: OwnerScope, now: number, rotation: number): SearchSpec[] {
  const analysis = profile.subject
  if (!analysis?.primary || analysis.version !== SUBJECT_VERSION) return []
  const turn = Math.max(0, Math.floor(rotation)), year = new Date(now).getUTCFullYear()
  const nextMonth = Date.UTC(year, new Date(now).getUTCMonth() + 1, 1)
  // Monthly boundaries keep task IDs and pagination stable between daily workers.
  const windows = [
    [Date.UTC(2005, 0, 1), nextMonth], [Date.UTC(year - 1, 0, 1), nextMonth],
    [Date.UTC(2005, 0, 1), Date.UTC(2011, 0, 1)],
    [Date.UTC(2011, 0, 1), Date.UTC(2017, 0, 1)],
    [Date.UTC(2017, 0, 1), Date.UTC(year - 1, 0, 1)],
  ]
  return [0, 1].map(slot => {
    // Across ten rotations: 70% primary searches, 30% explicit secondary topics.
    const secondary = slot === 1 && turn % 10 >= 4 && analysis.secondary.length > 0
    const focusSubject: Subject = secondary ? analysis.secondary[Math.floor(turn / 2) % analysis.secondary.length] : analysis.primary!
    const ordinal = turn * 2 + slot
    const angle = SUBJECT_ANGLES[ordinal % SUBJECT_ANGLES.length]
    const languageIndex = Math.floor(ordinal / SUBJECT_ANGLES.length) % LANGUAGES.length
    const language = LANGUAGES[languageIndex]
    // Use one angle term per search. Requiring several words excludes the very sparse titles we seek.
    const variants = angle[languageIndex + 1].split('|').filter(Boolean)
    const modifier = variants.length ? variants[Math.floor(turn / SUBJECT_ANGLES.length) % variants.length] : ''
    const alias = focusSubject.aliases[Math.floor(ordinal / SUBJECT_ANGLES.length) % focusSubject.aliases.length]
    const query = `${focusSubject.kind === 'entity' ? `"${alias}"` : alias}${modifier ? ` ${modifier}` : ''}`
    const [after, before] = angle[0] === 'current'
      ? [Date.UTC(year, new Date(now).getUTCMonth() - 3, 1), nextMonth]
      : windows[Math.floor(ordinal / 2) % windows.length]
    const focus: DiscoveryFocus = { subject: focusSubject, subjectVersion: SUBJECT_VERSION, ...scope, branch: secondary ? 'secondary' : 'primary', angle: angle[0] }
    return { kind: 'search', query, language, order: ordinal % 5 === 0 ? 'viewCount' : ordinal % 3 === 0 ? 'date' : 'relevance',
      after: new Date(Math.min(after, before - 86400000)).toISOString(), before: new Date(before).toISOString(), focus }
  })
}

export type OwnerSchedulingReport = {
  sampled: number; scheduled: number; needsMetadata: number; needsSubject: number;
  references: { key: string; subject: string | null; state: string; tasks: number }[]
}
/** Fair, resumable owner rotation. The timestamp records scheduling, never a fabricated discovery. */
export async function enqueueOwnerExploration(db: Db, now: number, _rotation: number,
  providers: readonly DiscoveryProvider[] = ['youtube', 'dailymotion'], onReport?: (report: OwnerSchedulingReport) => void): Promise<number> {
  const ownerId = curatorOwnerId()
  const c = db.collection<OwnerReference>('discovery_owner_references_v2')
  const refs = await c.find({ ownerId, active: true }, { timeoutMS: 1000 })
    .sort({ explorationScheduledAt: 1, _id: 1 }).limit(8).maxTimeMS(700).toArray()
  const hydrated = await hydrateOwnerReferences(db, refs)
  const report: OwnerSchedulingReport = { sampled: refs.length, scheduled: 0, needsMetadata: 0, needsSubject: 0, references: [] }
  const used = new Set<string>(); let enqueued = 0
  for (let index = 0; index < hydrated.length; index++) {
    const ref = hydrated[index], original = refs[index], profile = ref.profile
    const subject = profile.subject?.primary
    const state: OwnerReference['explorationState'] = profile.metadataQuality === 'unverified' ? 'needs-metadata'
      : subject ? 'scheduled' : 'needs-subject'
    let count = 0
    const nextRotation = { ...original.explorationRotation }
    if (state === 'scheduled' && subject && !used.has(subject.key)) {
      used.add(subject.key)
      for (const provider of providers) {
        if (provider === 'dailymotion' && process.env.RANDOM_DM_DISCOVERY_ENABLED !== '1') continue
        const turn = nextRotation[provider] ?? 0
        const specs = createSubjectSearches(profile, { ownerId, referenceKey: ref.contentKey,
          referenceRevision: profile.sourceRevision }, now, turn)
        for (const spec of specs) {
          if (provider === 'youtube') { await enqueue(db, spec, 0, true, now); count++ }
          else if (spec.kind === 'search') {
            await enqueue(db, { kind: 'dailymotion', query: spec.query, after: spec.after, before: spec.before,
              sort: spec.order === 'date' ? 'recent' : 'relevance', focus: spec.focus }, 0, true, now)
            count++
          }
        }
        // Known source channel -> uploads uses the other quota bucket even when search is exhausted.
        if (provider === 'youtube' && ref.itemId && ObjectId.isValid(ref.itemId)) {
          const row = await db.collection('items').findOne({ _id: new ObjectId(ref.itemId), provider: 'youtube' },
            { projection: { channelId: 1 }, maxTimeMS: 400, timeoutMS: 650 })
          if (typeof row?.channelId === 'string' && /^UC[\w-]{22}$/.test(row.channelId)) {
            const focus = { subject, subjectVersion: SUBJECT_VERSION, ownerId, referenceKey: ref.contentKey, referenceRevision: profile.sourceRevision,
              branch: 'primary' as const, angle: 'creator' }
            await enqueue(db, { kind: 'channel', channelId: row.channelId, focus }, 0, true, now); count++
          }
        }
        nextRotation[provider] = turn + 1
      }
      report.scheduled++
    } else if (state === 'needs-metadata') report.needsMetadata++
    else if (state === 'needs-subject') report.needsSubject++
    // Unlike/edit racing with the worker must not be undone by this refresh.
    await c.updateOne({ ownerId, contentKey: original.contentKey, active: true, ...(original.updatedAt ? { updatedAt: original.updatedAt } : { updatedAt: { $exists: false } }) },
      { $set: { profile, familyId: ref.familyId, profileRefreshedAt: new Date(now),
        explorationScheduledAt: new Date(now), explorationRotation: nextRotation, explorationState: state } }, { maxTimeMS: 700 })
    report.references.push({ key: ref.contentKey, subject: subject?.key ?? null, state, tasks: count })
    enqueued += count
    if (used.size >= 2) break
  }
  onReport?.(report)
  return enqueued
}
