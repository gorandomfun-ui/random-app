/**
 * Putting the real uploader back on Dailymotion videos.
 *
 * Dailymotion's API calls a *category* a "channel" — `news`, `music`,
 * `shortfilms` — and files the uploader under `owner`. Items ingested before
 * 2026-09-13 stored the category, so 307,633 videos claim to come from about
 * twenty "channels". Every per-author rule in the plan reads that field.
 *
 * Free: no key, 50 videos per call.
 */

import type { AnyBulkWriteOperation, Collection, Db, Document, ObjectId } from 'mongodb'

const API = 'https://api.dailymotion.com/videos'
const FIELDS = 'id,owner.id,owner.screenname'
export const BATCH_SIZE = 50

/** A genuine Dailymotion owner id. Anything else is a category slug. */
export const REAL_OWNER_ID = /^x[a-z0-9]+$/i

export const CHECKPOINT_COLLECTION = 'v3_repair_checkpoints'
export const CHECKPOINT_ID = 'dailymotion-authors'

export type Owner = { videoId: string; ownerId: string; ownerName: string | null }

type ApiResponse = { list?: Array<Record<string, unknown>> }

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Strips the `dailymotion:` prefix the catalogue stores. */
export function bareVideoId(videoId: string | null | undefined): string | null {
  if (!videoId) return null
  const bare = videoId.replace(/^dailymotion:/, '').trim()
  return /^[a-z0-9]+$/i.test(bare) ? bare : null
}

/**
 * Asks Dailymotion who uploaded these videos.
 *
 * Throws on a rate limit after retrying rather than returning an empty list:
 * a silent empty result looks exactly like "these videos have no owner" and
 * would quietly skip thousands of repairs.
 */
export async function fetchOwners(ids: string[], attempt = 0): Promise<Owner[]> {
  if (!ids.length) return []
  const params = new URLSearchParams({ ids: ids.join(','), limit: String(BATCH_SIZE), fields: FIELDS })
  const response = await fetch(`${API}?${params}`, {
    headers: { 'User-Agent': 'gorandom.fun author repair (contact: github.com/gorandomfun-ui)' },
  })

  if (response.status === 429 || response.status === 503) {
    if (attempt >= 4) throw new Error(`Dailymotion HTTP ${response.status} après ${attempt + 1} essais`)
    const header = Number(response.headers.get('retry-after'))
    const backoff = Number.isFinite(header) && header > 0 ? header * 1000 : Math.min(60_000, 2_000 * 2 ** attempt)
    await wait(backoff)
    return fetchOwners(ids, attempt + 1)
  }
  if (!response.ok) throw new Error(`Dailymotion HTTP ${response.status}`)

  const payload = (await response.json()) as ApiResponse
  const owners: Owner[] = []
  for (const row of payload.list ?? []) {
    const videoId = typeof row.id === 'string' ? row.id : null
    const ownerId = typeof row['owner.id'] === 'string' ? row['owner.id'] : null
    if (!videoId || !ownerId || !REAL_OWNER_ID.test(ownerId)) continue
    const ownerName = typeof row['owner.screenname'] === 'string' ? row['owner.screenname'] : null
    owners.push({ videoId, ownerId, ownerName })
  }
  return owners
}

export type BrokenVideo = { _id: ObjectId; videoId?: string | null; channelId?: string | null; title?: string | null }

/** The videos still carrying a category, oldest id first so a rerun resumes. */
export async function findBroken(db: Db, afterId: ObjectId | null, limit: number): Promise<BrokenVideo[]> {
  const filter: Document = {
    type: 'video',
    provider: 'dailymotion',
    channelId: { $not: REAL_OWNER_ID },
    ...(afterId ? { _id: { $gt: afterId } } : {}),
  }
  return db
    .collection('items')
    .find(filter, { projection: { videoId: 1, channelId: 1, title: 1 }, sort: { _id: 1 }, limit })
    .toArray() as unknown as Promise<BrokenVideo[]>
}

export type BatchResult = { repaired: number; missing: number }

/** Writes the real author. Videos Dailymotion no longer knows are left alone. */
export async function applyOwners(
  items: Collection<Document>,
  videos: BrokenVideo[],
  owners: Owner[],
): Promise<BatchResult> {
  const byVideoId = new Map(owners.map((owner) => [owner.videoId, owner]))
  const operations: AnyBulkWriteOperation<Document>[] = []

  for (const video of videos) {
    const bare = bareVideoId(video.videoId)
    const owner = bare ? byVideoId.get(bare) : undefined
    if (!owner) continue
    operations.push({
      updateOne: {
        filter: { _id: video._id },
        update: {
          $set: {
            channelId: owner.ownerId,
            ...(owner.ownerName ? { channelTitle: owner.ownerName } : {}),
            authorRepairedAt: new Date(),
          },
        },
      },
    })
  }

  if (operations.length) await items.bulkWrite(operations, { ordered: false })
  return { repaired: operations.length, missing: videos.length - operations.length }
}

export async function readCheckpoint(db: Db): Promise<ObjectId | null> {
  const row = await db.collection(CHECKPOINT_COLLECTION).findOne({ _id: CHECKPOINT_ID as never })
  return (row as { lastId?: ObjectId } | null)?.lastId ?? null
}

export async function writeCheckpoint(db: Db, lastId: ObjectId): Promise<void> {
  await db
    .collection(CHECKPOINT_COLLECTION)
    .updateOne({ _id: CHECKPOINT_ID as never }, { $set: { lastId, updatedAt: new Date() } }, { upsert: true })
}
