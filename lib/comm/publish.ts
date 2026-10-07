/**
 * The direct publication, in three calls the browser makes: start (the
 * containers, under a lock), status (polled; publishes when every container
 * is ready; posts the first comment; cleans up), and the record of it all on
 * the post. A failure leaves the draft intact with its reason; never two
 * publications of one draft.
 */

import { ObjectId, type Db } from 'mongodb'

import { COMM_MEDIA, COMM_POSTS, type PostDoc } from './model'
import { formatSpec } from './destinations'
import { blobPathnameOf, deleteBlobs, keyBelongsTo } from './blob'
import { postById } from './posts'
import { removeFromQueue } from './queue'
import { igComment, igConfig, igContainerStatus, igCreateCarousel, igCreateContainer, igPermalink, igPublish, IgError, type IgFetch, type IgFormat } from './instagram'

const QUERY_MS = 2500
/** A lock older than this is a publication that died: the next try may take over. */
export const LOCK_MS = 15 * 60 * 1000

export type PublishAsset = { slideIndex: number; url: string; kind: 'image' | 'video' }

export type StartResult = { ok: true; containers: string[]; carousel: string | null } | { ok: false; status: number; reason: string }

function igFormatOf(post: PostDoc): IgFormat | null {
  return post.format === 'post' || post.format === 'carousel' || post.format === 'reel' || post.format === 'story' ? post.format : null
}

/** The assets must sit in the folders of the post's own items: nothing else goes to Instagram. */
export function assetsBelong(assets: PublishAsset[], post: PostDoc): boolean {
  return assets.every((asset) => {
    const pathname = blobPathnameOf(asset.url)
    return Boolean(pathname) && post.queueItemIds.some((id) => keyBelongsTo(pathname!, id))
  })
}

export async function startInstagram(db: Db, fetchImpl: IgFetch, postId: string, assets: PublishAsset[], keep: string[]): Promise<StartResult> {
  const config = igConfig()
  if (!config) return { ok: false, status: 503, reason: 'Instagram n’est pas configuré : INSTAGRAM_ACCESS_TOKEN et INSTAGRAM_ACCOUNT_ID manquent.' }
  const post = await postById(db, postId)
  if (!post) return { ok: false, status: 404, reason: 'Brouillon introuvable.' }
  if (post.destination !== 'instagram') return { ok: false, status: 400, reason: 'Ce brouillon ne vise pas Instagram.' }
  if (post.status === 'published') return { ok: false, status: 409, reason: 'Déjà publié.' }
  const format = igFormatOf(post)
  const spec = formatSpec('instagram', post.format)
  if (!format || !spec) return { ok: false, status: 400, reason: 'Format inconnu.' }
  if (!assets.length || assets.length !== post.slides.length || assets.length < spec.slides.min || assets.length > spec.slides.max) return { ok: false, status: 400, reason: `Il faut un fichier par slide, ${spec.slides.min} à ${spec.slides.max}.` }
  if (!assetsBelong(assets, post)) return { ok: false, status: 400, reason: 'Un fichier ne vient pas de la file.' }
  if (format === 'reel' && assets.some((a) => a.kind !== 'video')) return { ok: false, status: 400, reason: 'Un reel est une vidéo.' }
  if ((format === 'post' || format === 'carousel') && assets.some((a) => a.kind !== 'image')) return { ok: false, status: 400, reason: 'Un post ou un carrousel prend des images.' }
  if (format === 'story' && assets.length !== 1) return { ok: false, status: 400, reason: 'Une story se publie une slide à la fois par l’API : publie-les une par une.' }
  // The lock: one publication of this draft at a time; a dead one may be taken over after a while.
  const now = new Date()
  const locked = await db.collection(COMM_POSTS).findOneAndUpdate(
    { _id: new ObjectId(postId), $or: [{ 'publishing.lockedAt': { $exists: false } }, { 'publishing.lockedAt': null }, { 'publishing.lockedAt': { $lt: new Date(now.getTime() - LOCK_MS) } }] },
    { $set: { 'publishing.lockedAt': now, 'publishing.assets': assets, 'publishing.keep': keep, 'publishing.containers': [], 'publishing.carousel': null, status: 'draft', error: null, updatedAt: now } },
    { returnDocument: 'after', maxTimeMS: QUERY_MS },
  )
  if (!locked) return { ok: false, status: 409, reason: 'Une publication de ce brouillon est déjà en cours.' }
  try {
    const containers: string[] = []
    const ordered = [...assets].sort((a, b) => a.slideIndex - b.slideIndex)
    for (const asset of ordered) containers.push(await igCreateContainer(fetchImpl, config, { kind: asset.kind, url: asset.url, format, caption: post.caption, child: format === 'carousel' }))
    const carousel = format === 'carousel' ? await igCreateCarousel(fetchImpl, config, containers, post.caption) : null
    await db.collection(COMM_POSTS).updateOne({ _id: new ObjectId(postId) }, { $set: { 'publishing.containers': containers, 'publishing.carousel': carousel, updatedAt: new Date() } })
    return { ok: true, containers, carousel }
  } catch (error) {
    const reason = error instanceof IgError ? error.message : 'Instagram n’a pas répondu.'
    await db.collection(COMM_POSTS).updateOne({ _id: new ObjectId(postId) }, { $set: { status: 'failed', error: reason, 'publishing.lockedAt': null, updatedAt: new Date() } })
    return { ok: false, status: 502, reason }
  }
}

export type StatusResult =
  | { state: 'waiting'; statuses: string[] }
  | { state: 'published'; remoteId: string; remoteUrl: string | null; commented: boolean; removed: number }
  | { state: 'failed'; reason: string }
  | { state: 'idle' }

/**
 * Polled by the browser. While a container is in progress, says so; when all
 * are finished, publishes, comments, records, and cleans. Any error ends the
 * attempt with its reason and frees the draft for another try.
 */
export async function statusInstagram(db: Db, fetchImpl: IgFetch, postId: string): Promise<StatusResult> {
  const config = igConfig()
  const post = await postById(db, postId) as (PostDoc & { publishing?: { lockedAt?: Date | null; containers?: string[]; carousel?: string | null; assets?: PublishAsset[]; keep?: string[] } }) | null
  if (!config || !post) return { state: 'idle' }
  if (post.status === 'published' && post.remoteId) return { state: 'published', remoteId: post.remoteId, remoteUrl: post.remoteUrl, commented: true, removed: 0 }
  if (post.status === 'failed') return { state: 'failed', reason: post.error ?? 'échec' }
  const containers = post.publishing?.containers ?? []
  if (!post.publishing?.lockedAt || !containers.length) return { state: 'idle' }
  const fail = async (reason: string): Promise<StatusResult> => {
    await db.collection(COMM_POSTS).updateOne({ _id: new ObjectId(postId) }, { $set: { status: 'failed', error: reason, 'publishing.lockedAt': null, updatedAt: new Date() } })
    return { state: 'failed', reason }
  }
  try {
    const toCheck = post.publishing.carousel ? [...containers, post.publishing.carousel] : containers
    const statuses: string[] = []
    for (const id of toCheck) {
      const { status, detail } = await igContainerStatus(fetchImpl, config, id)
      if (status === 'ERROR' || status === 'EXPIRED') return fail(`Instagram a refusé le média (${status}${detail ? ` : ${detail}` : ''}).`)
      statuses.push(status)
    }
    if (statuses.some((s) => s === 'IN_PROGRESS')) return { state: 'waiting', statuses }
    const target = post.publishing.carousel ?? containers[0]
    const remoteId = await igPublish(fetchImpl, config, target)
    const remoteUrl = await igPermalink(fetchImpl, config, remoteId)
    const commented = await igComment(fetchImpl, config, remoteId, `Source : ${post.sourceUrl}`)
    await db.collection(COMM_POSTS).updateOne({ _id: new ObjectId(postId) }, { $set: { status: 'published', publishedAt: new Date(), remoteId, remoteUrl, error: null, 'publishing.lockedAt': null, 'publishing.commented': commented, updatedAt: new Date() } })
    // The files that served the publication leave the store; the items leave the queue unless kept.
    const assets = post.publishing.assets ?? []
    const renders = await db.collection(COMM_MEDIA).find({ kind: 'render', queueItemId: { $in: post.queueItemIds } }, { projection: { blobUrl: 1 }, maxTimeMS: QUERY_MS }).toArray()
    await deleteBlobs([...assets.map((a) => a.url), ...renders.map((r) => String(r.blobUrl))])
    await db.collection(COMM_MEDIA).deleteMany({ kind: 'render', queueItemId: { $in: post.queueItemIds } })
    let removed = 0
    for (const itemId of post.queueItemIds) if (!(post.publishing.keep ?? []).includes(itemId)) { const r = await removeFromQueue(db, itemId); if (r.removed) removed += 1 }
    return { state: 'published', remoteId, remoteUrl, commented, removed }
  } catch (error) {
    return fail(error instanceof IgError ? error.message : 'Instagram n’a pas répondu.')
  }
}
