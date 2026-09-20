import type { Db } from 'mongodb'
import { ObjectId } from 'mongodb'
import type { Profile } from './types'
import type { OwnerReference } from './editorial'
import { hydrateOwnerReferences } from './ownerStore'
import { enqueue, taskId, type SearchSpec, type DiscoveryFocus, type DiscoveryProvider, type DiscoveryTask } from './exploration'
import { baseSteps, planLikeTurn, LIKES_PER_PASS, type LikeSeed } from './likePlan'
import { SUBJECT_VERSION, type Subject } from './subjects'
import { curatorOwnerId } from './curatorAuth'
import { geographicSearch } from './searchGeography'

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

/** An era is a search hypothesis, never an assertion about when a video was filmed.
 * Years mentioned in the real title are also explored, even when the upload is recent. */
export function subjectEraTerm(profile: Profile, rotation: number, now: number): string {
  const ordinal = Math.max(0, Math.floor(rotation)), year = new Date(now).getUTCFullYear()
  const sourceYears = [...new Set((profile.titleYearHints ?? []).filter(token => /^(?:19|20)\d{2}$/.test(token) && Number(token) <= year))]
  if (sourceYears.length && ordinal % 2 === 0) return sourceYears[Math.floor(ordinal / 2) % sourceYears.length]
  const decades = [1960, 1970, 1980, 1990, 2000, 2010, 2020, 1950, 1940].filter(value => value <= year)
  return String(decades[Math.floor(ordinal / (sourceYears.length ? 2 : 1)) % decades.length])
}

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
    const angle = slot === 0 ? SUBJECT_ANGLES[0] : SUBJECT_ANGLES[1 + turn % (SUBJECT_ANGLES.length - 1)]
    const geography = slot === 1 && turn % 4 === 3 ? geographicSearch(Math.floor(turn / 4)).coverage : undefined
    const era = slot === 1 && turn % 4 === 2 ? subjectEraTerm(profile, Math.floor(turn / 4), now) : undefined
    // Angles and languages rotate independently. Previously every reference
    // spent its first eight turns in French before trying a second language.
    const languageIndex = turn % LANGUAGES.length
    const language = geography?.language ?? LANGUAGES[languageIndex]
    // Use one angle term per search. Requiring several words excludes the very sparse titles we seek.
    const variants = angle[languageIndex + 1].split('|').filter(Boolean)
    const modifier = geography?.place ?? era ?? (variants.length ? variants[Math.floor(turn / SUBJECT_ANGLES.length) % variants.length] : '')
    const alias = focusSubject.aliases[Math.floor(ordinal / SUBJECT_ANGLES.length) % focusSubject.aliases.length]
    const query = `${focusSubject.kind === 'entity' ? `"${alias}"` : alias}${modifier ? ` ${modifier}` : ''}`
    // The era belongs in the query. An old performance uploaded yesterday must remain eligible.
    const [after, before] = era ? windows[0] : slot === 0 ? windows[turn % 3 === 2 ? 1 : 0] : angle[0] === 'current'
      ? [Date.UTC(year, new Date(now).getUTCMonth() - 3, 1), nextMonth]
      : windows[Math.floor(ordinal / 2) % windows.length]
    const focus: DiscoveryFocus = { subject: focusSubject, subjectVersion: SUBJECT_VERSION, ...scope, branch: secondary ? 'secondary' : 'primary', angle: geography ? 'geographic' : era ? `era-${era}` : slot === 0 ? 'open' : angle[0] }
    return { kind: 'search', query, language, order: slot === 0 ? (['viewCount', 'relevance', 'date'] as const)[turn % 3] : ordinal % 3 === 0 ? 'date' : 'relevance',
      after: new Date(Math.min(after, before - 86400000)).toISOString(), before: new Date(before).toISOString(), focus, ...(geography ? { coverage: geography } : {}) }
  })
}

export type OwnerSchedulingReport = {
  sampled: number; scheduled: number; waiting: number; done: number; images: number; needsMetadata: number; needsSubject: number;
  references: { key: string; subject: string | null; state: string; tasks: number; label?: string }[]
}

/** A queued task older than this no longer holds its like back: its provider may simply be off. */
const PENDING_GRACE_MS = 3 * 86400000

/** Whether the tasks of the previous turn have all run, and whether they brought anything. */
async function previousTurn(tasks: import('mongodb').Collection<DiscoveryTask>, ids: string[], now: number): Promise<'none' | 'pending' | 'dry' | 'productive'> {
  if (!ids.length) return 'none'
  const rows = await tasks.find({ _id: { $in: ids } }, { projection: { lastAttemptAt: 1, insertedTotal: 1, due: 1 }, maxTimeMS: 700 }).toArray()
  if (rows.some(row => !row.lastAttemptAt && now - new Date(row.due).getTime() < PENDING_GRACE_MS)) return 'pending'
  return rows.reduce((sum, row) => sum + (row.insertedTotal ?? 0), 0) > 0 ? 'productive' : 'dry'
}

/**
 * The words that recur around the content in the catalogue, read from its
 * Wave: what a person would search next after looking at the results.
 *
 * Only titles that carry one of the seed's own words are read — a Pioneer
 * LaserDisc player led to "CLD" from other Pioneer players, and to "India"
 * from a spare that had nothing to do with it. And only words seen at least
 * three times count; fewer is a coincidence of captions.
 */
async function wordsAround(db: Db, itemId: string, seedWords: Set<string>): Promise<string[]> {
  const { loadAnchor, composeWave, wordsOfTitle } = await import('../v3/wave/find')
  const oid = new ObjectId(itemId)
  const loaded = await loadAnchor(db, oid)
  if (!loaded) return []
  const wave = await composeWave(db, loaded.anchor, oid)
  const counts = new Map<string, number>()
  for (const candidate of [...wave.items, ...wave.spares]) {
    const words = wordsOfTitle(candidate.title)
    if (!words.some(word => seedWords.has(word))) continue
    for (const word of words) {
      if (seedWords.has(word)) continue
      counts.set(word, (counts.get(word) ?? 0) + 1)
    }
  }
  return [...counts].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).map(([word]) => word)
}

/**
 * Fair, resumable owner rotation, following the like plan.
 *
 * A like advances one turn per pass, and only once the tasks of its previous
 * turn have run: a like whose searches are still queued is not handed more.
 * Past the first steps a like that brought nothing is done. The timestamp
 * records scheduling, never a fabricated discovery.
 *
 * A step is queued for both providers whatever this run is allowed to fetch.
 * The job runs the worker once per provider in turn, and queuing only the
 * provider of the moment advanced a like's turn with its YouTube searches and
 * never its Dailymotion ones. A task for a provider that is off simply waits.
 */
export async function enqueueOwnerExploration(db: Db, now: number, _rotation: number,
  _providers: readonly DiscoveryProvider[] = ['youtube', 'dailymotion'], onReport?: (report: OwnerSchedulingReport) => void): Promise<number> {
  const ownerId = curatorOwnerId()
  const c = db.collection<OwnerReference>('discovery_owner_references_v2')
  const tasks = db.collection<DiscoveryTask>('discovery_tasks_v2')
  const refs = await c.find({ ownerId, active: true, explorationDone: { $exists: false } }, { timeoutMS: 1000 })
    .sort({ explorationScheduledAt: 1, _id: 1 }).limit(8).maxTimeMS(700).toArray()
  const hydrated = await hydrateOwnerReferences(db, refs)
  const report: OwnerSchedulingReport = { sampled: refs.length, scheduled: 0, waiting: 0, done: 0, images: 0, needsMetadata: 0, needsSubject: 0, references: [] }
  let enqueued = 0, served = 0

  for (let index = 0; index < hydrated.length; index++) {
    const ref = hydrated[index], original = refs[index], profile = ref.profile
    const subject = profile.subject?.primary
    let state: OwnerReference['explorationState'] = profile.metadataQuality === 'unverified' ? 'needs-metadata'
      : subject ? 'scheduled' : 'needs-subject'
    let count = 0, label: string | undefined
    const set: Partial<OwnerReference> = { profile, familyId: ref.familyId, profileRefreshedAt: new Date(now) }

    if (state === 'scheduled' && subject) {
      const turn = original.explorationPlanTurn ?? 0
      const previous = await previousTurn(tasks, original.explorationLastTaskIds ?? [], now)
      if (served >= LIKES_PER_PASS || previous === 'pending') {
        state = 'waiting'
      } else if (previous === 'dry' && turn >= 2) {
        state = 'done'
        set.explorationDone = 'dry'
        set.explorationDoneAt = new Date(now)
      } else {
        const row = ref.itemId && ObjectId.isValid(ref.itemId)
          ? await db.collection('items').findOne({ _id: new ObjectId(ref.itemId) },
              { projection: { title: 1, keywords: 1, tags: 1, channelId: 1, provider: 1 }, maxTimeMS: 700 })
          : null
        const { tellingWordsOf } = await import('../v3/wave/find')
        const words = row ? tellingWordsOf(row as { title?: string | null; keywords?: unknown; tags?: unknown }) : []
        const scope = { ownerId, referenceKey: ref.contentKey, referenceRevision: profile.sourceRevision }
        const seed: LikeSeed = { subject, words, title: typeof row?.title === 'string' ? row.title : null, scope }
        if (turn >= baseSteps(seed, now).length && ref.itemId) {
          const seedWords = new Set([...words, ...subject.aliases.flatMap(alias => alias.toLowerCase().split(/\s+/))])
          seed.expansion = await wordsAround(db, ref.itemId, seedWords).catch(() => [])
        }
        const step = planLikeTurn(seed, turn, now)
        if (!step) {
          state = 'done'
          set.explorationDone = 'exhausted'
          set.explorationDoneAt = new Date(now)
        } else {
          const ids: string[] = []
          for (const spec of [...step.youtube, ...step.dailymotion]) { await enqueue(db, spec, 0, true, now); ids.push(taskId(spec)); count++ }
          // The uploader's own channel, on the first turn only: the surest "more like this".
          if (turn === 0 && row?.provider === 'youtube'
            && typeof row.channelId === 'string' && /^UC[\w-]{22}$/.test(row.channelId)) {
            const focus = { subject, subjectVersion: SUBJECT_VERSION, ...scope, branch: 'primary' as const, angle: 'creator' }
            const spec: SearchSpec = { kind: 'channel', channelId: row.channelId, focus }
            await enqueue(db, spec, 0, true, now); ids.push(taskId(spec)); count++
          }
          if (step.images.length) {
            // Images are direct: one Giphy question per step, tagged as they are stored.
            try {
              const { ingestImages } = await import('../ingest/images')
              const result = await ingestImages({ queries: step.images, perQuery: 25, providers: ['giphy'], insertOnly: true })
              report.images += result.inserted
            } catch { /* the provider refused or is down; the videos still go ahead */ }
          }
          set.explorationScheduledAt = new Date(now)
          set.explorationPlanTurn = turn + 1
          set.explorationLastTaskIds = ids
          set.explorationLastLabel = step.label
          label = step.label
          served++
        }
      }
    }

    if (state === 'scheduled') report.scheduled++
    else if (state === 'waiting') report.waiting++
    else if (state === 'done') report.done++
    else if (state === 'needs-metadata') report.needsMetadata++
    else if (state === 'needs-subject') report.needsSubject++

    // Unlike/edit racing with the worker must not be undone by this refresh.
    await c.updateOne({ ownerId, contentKey: original.contentKey, active: true, ...(original.updatedAt ? { updatedAt: original.updatedAt } : { updatedAt: { $exists: false } }) },
      { $set: { ...set, explorationState: state } }, { maxTimeMS: 700 })
    report.references.push({ key: ref.contentKey, subject: subject?.key ?? null, state: state ?? 'scheduled', tasks: count, label })
    enqueued += count
  }
  onReport?.(report)
  return enqueued
}
