/**
 * The likes base: the subject of each like the owner confirmed, dug deep.
 *
 * The machine misread what his likes were about ("Globe Theatre" in a cat
 * documentary, 28 September), so the subject is his word: a name or a theme
 * he typed on the curation page, kept on the reference as `digSubject`. A
 * like without one waits. The liked channel is read too, and weighs as much
 * as a star: his curation is meant to weigh "quand même pas mal".
 */

import type { Db, Document } from 'mongodb'
import { ObjectId } from 'mongodb'

import { subjectId } from '../tagging/normalize'
import type { Universe } from '../types'
import { themeAngles } from './angles'
import { enqueue, QUEUE, type NewSubject } from './queue'

export type LikeReference = { itemId: string; digSubject?: { label?: string } | null }
export type LikedItem = { _id: ObjectId; channelId?: string; channelTitle?: string; lang?: string; v3?: { universe?: Universe; channelKey?: string } }

/** A name has a capital somewhere ("Amy Winehouse", "Dr. Mike"); a theme is all lowercase ("pub tv 1994"). */
export function looksLikeName(label: string): boolean {
  return /\p{Lu}/u.test(label)
}

/** The queue entry of one confirmed like: a name dug like a star, a theme with all its angles; the liked channel to read first. */
export function likeSubject(reference: LikeReference, item: LikedItem | undefined): NewSubject | null {
  const label = (reference.digSubject?.label ?? '').trim().replace(/\s+/g, ' ')
  if (label.length < 2 || label.length > 80) return null
  const name = looksLikeName(label)
  const channel = item?.channelId && item.channelTitle ? [{ id: item.channelId, title: item.channelTitle, hits: 5 }] : []
  return {
    _id: subjectId(name ? 'entity' : 'topic', label), label, aliases: [label], kind: name ? 'entity' : 'topic', base: 'likes', fame: name ? 'star' : 'known',
    ...(item?.lang ? { lang: item.lang } : {}), ...(item?.v3?.universe ? { universe: item.v3.universe } : {}),
    ...(name ? {} : { angles: themeAngles() }), priority: 40, channelsToRead: channel, source: { like: reference.itemId },
  }
}

/** The owner's confirmed likes into the queue: new subjects added, known ones refreshed. */
export async function queueLikes(db: Db, ownerId: string, log: (text: string) => void = () => undefined): Promise<number> {
  const references = await db.collection('discovery_owner_references_v2')
    .find({ ownerId, active: true, 'digSubject.label': { $exists: true, $ne: '' } } as Document, { projection: { itemId: 1, digSubject: 1 }, limit: 500, maxTimeMS: 4000 })
    .toArray() as unknown as LikeReference[]
  if (!references.length) return 0
  const ids = references.map((reference) => reference.itemId).filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id))
  const items = await db.collection('items').find({ _id: { $in: ids } }, { projection: { channelId: 1, channelTitle: 1, lang: 1, 'v3.universe': 1, 'v3.channelKey': 1 }, maxTimeMS: 4000 }).toArray() as unknown as LikedItem[]
  const byId = new Map(items.map((item) => [String(item._id), item]))
  const subjects = new Map<string, NewSubject>()
  for (const reference of references) {
    const subject = likeSubject(reference, byId.get(reference.itemId))
    if (subject && !subjects.has(subject._id)) subjects.set(subject._id, subject)
  }
  const result = await enqueue(db, [...subjects.values()])
  // A channel the owner liked is read in the channel pass: remembered on the subject when it is new or has none yet.
  for (const subject of subjects.values()) {
    if (!subject.channelsToRead?.length) continue
    await db.collection(QUEUE).updateOne({ _id: subject._id, channelsToRead: { $size: 0 } } as Document, { $set: { channelsToRead: subject.channelsToRead } }).catch(() => undefined)
  }
  if (result.inserted) log(`likes : ${result.inserted} nouveau(x) sujet(s) sur ${subjects.size} confirmés`)
  return result.inserted
}
