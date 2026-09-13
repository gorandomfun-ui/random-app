import type { Db } from 'mongodb'
import { ObjectId } from 'mongodb'
import type { Profile } from './types'
import type { OwnerReference } from './editorial'
import { profileFromRow } from './catalog'
import { enqueue, type SearchSpec, type DiscoveryFocus, type DiscoveryProvider } from './exploration'
import { SUBJECT_VERSION, type Subject } from './subjects'
import { curatorOwnerId } from './curatorAuth'
import { seeded } from './random'

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
type OwnerScope = { ownerId: string; referenceKey: string }

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
    const focus: DiscoveryFocus = { subject: focusSubject, ...scope, branch: secondary ? 'secondary' : 'primary', angle: angle[0] }
    return { kind: 'search', query, language, order: ordinal % 5 === 0 ? 'viewCount' : ordinal % 3 === 0 ? 'date' : 'relevance',
      after: new Date(Math.min(after, before - 86400000)).toISOString(), before: new Date(before).toISOString(), focus }
  })
}

/** Called only by the existing worker. At most two references and four new search tasks. */
export async function enqueueOwnerExploration(db: Db, now: number, rotation: number,
  providers: readonly DiscoveryProvider[] = ['youtube', 'dailymotion']): Promise<number> {
  const ownerId = curatorOwnerId(), point = seeded(rotation + 0x17ad)()
  const c = db.collection<OwnerReference>('discovery_owner_references_v2')
  const match = { ownerId, active: true }
  const refs = await c.find({ ...match, rand: { $gte: point } }).sort({ rand: 1 }).limit(8).maxTimeMS(500).toArray()
  if (refs.length < 8) refs.push(...await c.find({ ...match, $or: [{ rand: { $lt: point } }, { rand: { $exists: false } }] })
    .sort({ rand: 1 }).limit(8 - refs.length).maxTimeMS(500).toArray())
  const stale = refs.filter(r => r.profile.subject?.version !== SUBJECT_VERSION && r.itemId && ObjectId.isValid(r.itemId))
  const rows = stale.length ? await db.collection('items').find({ _id: { $in: stale.map(r => new ObjectId(r.itemId!)) } })
    .limit(8).maxTimeMS(500).toArray() : []
  const hydrated = new Map(rows.map(row => [String(row._id), profileFromRow(row)]))
  const used = new Set<string>(); let enqueued = 0
  for (const ref of refs) {
    const profile = hydrated.get(ref.itemId ?? '') ?? ref.profile
    const subject = profile.subject?.primary
    if (!subject || used.has(subject.key)) continue
    used.add(subject.key)
    for (const spec of createSubjectSearches(profile, { ownerId, referenceKey: ref.contentKey }, now, rotation)) {
      if (providers.includes('youtube')) { await enqueue(db, spec, 0, true, now); enqueued++ }
      if (providers.includes('dailymotion') && process.env.RANDOM_DM_DISCOVERY_ENABLED === '1' && spec.kind === 'search') {
        await enqueue(db, { kind: 'dailymotion', query: spec.query, after: spec.after, before: spec.before,
          sort: spec.order === 'date' ? 'recent' : 'relevance', focus: spec.focus }, 0, true, now)
        enqueued++
      }
    }
    if (used.size >= 2) break
  }
  return enqueued
}
