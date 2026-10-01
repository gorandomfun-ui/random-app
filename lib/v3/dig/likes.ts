/**
 * The likes base: what the owner liked, read by the machine, dug around.
 *
 * Nothing to type (the owner, 29 September: "c'est d'avoir un algo qui
 * arrive quand même à chercher assez proche des éléments que je vais ajouter
 * à mes likes"). A like gives up to three subjects on its own:
 *   - the names the tagger read in its title, checked against the title
 *     itself ("Globe Theatre" in a cat documentary is not one of them);
 *   - the author's channel, read like any channel met on the way;
 *   - what the title says it is, when it says so: "commercial 1994",
 *     "archive footage 1973", "live 1982" — the owner's likes are full of
 *     retro ads, archives and concerts; failing that, its telling words.
 * A subject the owner wrote himself on the curation page still wins.
 */

import type { Db, Document } from 'mongodb'
import { ObjectId } from 'mongodb'

import { SUBJECTS_COLLECTION } from '../subjects/build'
import { containsAlias, normalize } from '../tagging/normalize'
import type { Universe } from '../types'
import { themeAngles } from './angles'
import { tellingWords } from './door'
import { enqueue, QUEUE, type NewSubject } from './queue'

export type LikeReference = { itemId: string; digSubject?: { label?: string } | null }
export type LikedItem = {
  _id: ObjectId; title?: string; provider?: string; channelId?: string; channelTitle?: string; lang?: string
  v3?: { universe?: Universe; channelKey?: string; subjects?: Array<{ id: string; role?: string; evidence?: string }> }
}
export type KnownSubject = { _id: string; label: string; kind: string }

/** A name has a capital somewhere ("Amy Winehouse", "Dr. Mike"); a theme is all lowercase ("pub tv 1994"). */
export function looksLikeName(label: string): boolean {
  return /\p{Lu}/u.test(label)
}

const PRACTICES: Array<[RegExp, string, string[]]> = [
  [/\b(?:commercials?|adverts?|ads?|pubs?|publicit[ée]s?|werbung|anuncios?|spot)\b/iu, 'commercial', ['commercial', 'commercials', 'advert', 'ad', 'pub', 'publicité', 'werbung', 'anuncio']],
  [/\b(?:archives?|footage|home (?:video|movie)s?|vhs|8mm|super 8|kodachrome|newsreel|actualit[ée]s)\b/iu, 'archive footage', ['archive', 'archives', 'footage', 'home video', 'home movie', 'vhs', 'super 8', '8mm', 'newsreel']],
  [/\b(?:live|concert|festival|en direct|tour)\b/iu, 'live', ['live', 'concert', 'festival', 'en direct', 'en concert']],
  [/\b(?:stop[ -]?motion|claymation|animation image par image)\b/iu, 'stop motion', ['stop motion', 'stop-motion', 'claymation']],
  [/\b(?:intro|opening|générique|generique|idents?|jingles?)\b/iu, 'tv intro', ['intro', 'opening', 'générique', 'ident', 'jingle']],
]
const YEAR = /\b(19[2-9]\d|20[0-2]\d)\b/

/** What the title says the like is, with its year when it has one: "commercial 1994", "archive footage 1973". */
export function practiceTheme(title: string): { label: string; aliases: string[] } | null {
  for (const [pattern, label, aliases] of PRACTICES) {
    if (!pattern.test(title)) continue
    const year = YEAR.exec(title)?.[1]
    return year ? { label: `${label} ${year}`, aliases: [...aliases, year] } : { label, aliases }
  }
  return null
}

/** The three longest telling words of a title, a last resort: "abandoned hospital windows". */
export function wordsTheme(title: string): string | null {
  const words = [...tellingWords(title, { label: '', aliases: [] })].filter((word) => /^\p{L}+$/u.test(word)).sort((left, right) => right.length - left.length).slice(0, 3)
  return words.length >= 2 ? words.join(' ') : null
}

function entitySubject(label: string, item: LikedItem, priority: number, source: Document): NewSubject {
  return {
    _id: `entity:${normalize(label).replace(/ /g, '-')}`, label, aliases: [label], kind: 'entity', base: 'likes', fame: 'known',
    ...(item.lang ? { lang: item.lang } : {}), ...(item.v3?.universe ? { universe: item.v3.universe } : {}), priority, source,
  }
}

function topicSubject(label: string, aliases: string[], item: LikedItem, fame: 'known' | 'small', priority: number, source: Document): NewSubject {
  return {
    _id: `topic:${normalize(label).replace(/ /g, '-')}`, label, aliases: [...new Set([label, ...aliases])], kind: 'topic', base: 'likes', fame,
    ...(item.lang ? { lang: item.lang } : {}), ...(item.v3?.universe ? { universe: item.v3.universe } : {}), angles: themeAngles(), priority, source,
  }
}

/** The subjects one like gives on its own, the owner's own word first when he wrote one. */
export function likeSubjects(reference: LikeReference, item: LikedItem | undefined, known: Map<string, KnownSubject>): NewSubject[] {
  if (!item) return []
  const source = { like: reference.itemId }
  const typed = (reference.digSubject?.label ?? '').trim().replace(/\s+/g, ' ')
  if (typed.length >= 2 && typed.length <= 80) {
    return [looksLikeName(typed) ? { ...entitySubject(typed, item, 40, source), fame: 'star' } : topicSubject(typed, [], item, 'known', 40, source)]
  }
  const title = item.title ?? ''
  const subjects: NewSubject[] = []
  // The names the tagger read, only when the title or the author's name carries them ("Brother" live, on Amy Winehouse's channel).
  const carried = `${title} ${item.channelTitle ?? ''}`
  for (const ref of (item.v3?.subjects ?? []).slice(0, 4)) {
    const subject = known.get(ref.id)
    if (!subject || subject.kind !== 'entity' || subject.label.length < 3 || !containsAlias(carried, subject.label)) continue
    subjects.push(entitySubject(subject.label, item, 35, source))
    if (subjects.length >= 2) break
  }
  // What the title says it is.
  const practice = practiceTheme(title)
  if (practice) subjects.push(topicSubject(practice.label, practice.aliases, item, 'known', 30, source))
  // The author's channel, read as a channel met on the way.
  const channel = item.provider === 'youtube' && item.channelId && item.channelTitle
    ? { _id: `channel:youtube:${item.channelId}`, label: item.channelTitle, aliases: [], kind: 'channel' as const, base: 'likes' as const, fame: 'small' as const, ...(item.lang ? { lang: item.lang } : {}), ...(item.v3?.universe ? { universe: item.v3.universe } : {}), priority: 30, source }
    : null
  if (channel) subjects.push(channel)
  // Never its words: "The Walk" as a subject caught anything called The Walk (the owner, 1 October). A like without a name gives its channel, or nothing.
  return subjects
}

/** The owner's likes into the queue, read by the machine: new subjects added, known ones refreshed. */
export async function queueLikes(db: Db, ownerId: string, log: (text: string) => void = () => undefined): Promise<number> {
  const references = await db.collection('discovery_owner_references_v2')
    .find({ ownerId, active: true } as Document, { projection: { itemId: 1, digSubject: 1 }, limit: 500, maxTimeMS: 4000 })
    .toArray() as unknown as LikeReference[]
  if (!references.length) return 0
  const ids = references.map((reference) => reference.itemId).filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id))
  const items = await db.collection('items').find({ _id: { $in: ids }, type: 'video' }, { projection: { title: 1, provider: 1, channelId: 1, channelTitle: 1, lang: 1, 'v3.universe': 1, 'v3.channelKey': 1, 'v3.subjects': 1 }, maxTimeMS: 4000 }).toArray() as unknown as LikedItem[]
  const subjectIds = [...new Set(items.flatMap((item) => (item.v3?.subjects ?? []).map((subject) => subject.id)))]
  const known = new Map<string, KnownSubject>((subjectIds.length
    ? await db.collection(SUBJECTS_COLLECTION).find({ _id: { $in: subjectIds } } as Document, { projection: { label: 1, kind: 1 }, maxTimeMS: 4000 }).toArray()
    : []).map((row) => [String(row._id), { _id: String(row._id), label: String(row.label ?? ''), kind: String(row.kind ?? 'topic') }]))
  const byId = new Map(items.map((item) => [String(item._id), item]))
  const subjects = new Map<string, NewSubject>()
  for (const reference of references) {
    for (const subject of likeSubjects(reference, byId.get(reference.itemId), known)) if (!subjects.has(subject._id)) subjects.set(subject._id, subject)
  }
  if (!subjects.size) return 0
  const result = await enqueue(db, [...subjects.values()])
  // A subject the owner's likes name keeps the likes base, whichever base met it first: his curation weighs.
  await db.collection(QUEUE).updateMany({ _id: { $in: [...subjects.keys()] }, base: { $ne: 'likes' } } as Document, { $set: { base: 'likes', priority: 35 } }).catch(() => undefined)
  if (result.inserted) log(`likes : ${result.inserted} nouveau(x) sujet(s), ${subjects.size} en tout pour ${references.length} likes`)
  return result.inserted
}
