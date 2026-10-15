/**
 * The night's check of the pictures and GIFs (14 October; the owner: "il faut pour les images… mais surtout ne pas niquer le
 * truc des 2 euros"). 1,055,447 pictures, 965,267 never checked, the last checks four months old: the ones a visitor's page
 * reported first, then the whole stock in turn by id, each picture once a month — thirty-five thousand a night, a HEAD each
 * (lib/v3/obsolete/images.ts), some 20 MB sent. A dead one is hidden from nothing yet: it waits for the owner's button
 * (public/erase-obsolete-videos.html), which checks it once more before deleting it.
 */

import type { AnyBulkWriteOperation, Document, ObjectId } from 'mongodb'

import { checkImages, ensureDeadImagesIndex, imageOutcomeUpdate, imageStatus } from '../../obsolete/images'
import type { LineContext, LineResult } from '../context'
import { emptyCounters } from '../journal'

/** Pictures a night, the reported ones apart: the stock once a month. */
export const NIGHT_IMAGES = Number(process.env.RANDOM_IMAGE_OBSOLETE_NIGHT ?? 35_000)
/** A picture checked this recently waits. */
export const EVERY_DAYS = 30
const PAGE = 1000
const SUSPECTS = 2000
const CONCURRENCY = 16
const DEADLINE_MARGIN_MS = 60_000
const DAY_MS = 86_400_000
/** Where the walk through the stock stands, between nights. */
export const WALK = 'image_obsolete_walk_v1'

export type ImageObsoleteCursor = { checked: number; dead: number; again: number; note: string }

export async function run(ctx: LineContext, deps: { request?: typeof fetch; now?: number } = {}): Promise<LineResult> {
  const items = ctx.db.collection('items')
  const now = deps.now ?? Date.now()
  const counters = emptyCounters()
  const errors: string[] = []
  const deadBy: Record<string, number> = {}
  let checked = 0, dead = 0, again = 0, reported = 0
  if (!ctx.dryRun) await ensureDeadImagesIndex(ctx.db as never)

  const checkAndWrite = async (rows: Document[]): Promise<void> => {
    if (!rows.length) return
    const outcomes = await checkImages(rows as Array<{ _id: ObjectId; url?: unknown }>, { concurrency: CONCURRENCY, request: deps.request ?? ctx.http })
    const at = new Date()
    const writes: AnyBulkWriteOperation<Document>[] = []
    for (const row of rows) {
      const outcome = outcomes.get(String(row._id))
      if (!outcome) continue
      const status = imageStatus(outcome)
      if (status === 'obsolete') { dead += 1; const provider = String(row.provider ?? '?'); deadBy[provider] = (deadBy[provider] ?? 0) + 1 }
      else if (status !== 'ok') again += 1
      writes.push({ updateOne: { filter: { _id: row._id, type: 'image' }, update: imageOutcomeUpdate(outcome, at) } })
    }
    checked += rows.length
    if (!ctx.dryRun && writes.length) await items.bulkWrite(writes, { ordered: false }).catch((error) => { errors.push(`écriture : ${error instanceof Error ? error.message : String(error)}`) })
  }

  // The pictures a visitor's page failed on, first.
  const suspects = await items.find({ type: 'image', obsoleteImageSuspect: true } as Document, { projection: { url: 1, provider: 1 }, hint: 'idx_image_obsolete_suspects', limit: SUSPECTS, maxTimeMS: 30_000 }).toArray().catch(() => [] as Document[])
  reported = suspects.length
  await checkAndWrite(suspects)

  // Then the stock by id, from where the last night stopped; past the end, from the start again.
  const walk = ctx.db.collection<{ _id: string; lastId?: ObjectId | null; at?: Date }>(WALK)
  let lastId = (await walk.findOne({ _id: 'walk' }).catch(() => null))?.lastId ?? null
  let wrapped = false
  const due = { $or: [{ obsoleteImageCheckedAt: { $exists: false } }, { obsoleteImageCheckedAt: null }, { obsoleteImageCheckedAt: { $lt: new Date(now - EVERY_DAYS * DAY_MS) } }] }
  while (checked - reported < NIGHT_IMAGES && ctx.timeLeft() > DEADLINE_MARGIN_MS) {
    const rows = await items.find({ type: 'image', isSuppressed: { $ne: true }, obsoleteImageStatus: { $ne: 'obsolete' }, ...due, ...(lastId ? { _id: { $gt: lastId } } : {}) } as Document,
      { projection: { url: 1, provider: 1 }, sort: { _id: 1 }, limit: Math.min(PAGE, NIGHT_IMAGES - (checked - reported)), hint: 'idx_image_scan_by_type_id', maxTimeMS: 60_000 }).toArray()
      .catch((error) => { errors.push(`lecture : ${error instanceof Error ? error.message : String(error)}`); return null })
    if (rows === null) break
    if (!rows.length) {
      if (wrapped || !lastId) break
      lastId = null
      wrapped = true
      continue
    }
    await checkAndWrite(rows)
    lastId = rows[rows.length - 1]._id as ObjectId
    if (!ctx.dryRun) await walk.updateOne({ _id: 'walk' }, { $set: { lastId, at: new Date() } }, { upsert: true }).catch(() => undefined)
  }
  if (ctx.timeLeft() <= DEADLINE_MARGIN_MS) errors.push('échéance atteinte')

  counters.scanned = checked
  for (const [provider, n] of Object.entries(deadBy)) counters.rejected[`morte (${provider})`] = n
  if (again) counters.rejected['à revoir'] = again
  const detail = Object.entries(deadBy).map(([provider, n]) => `${provider} ${n}`).join(', ')
  const note = `${checked.toLocaleString('fr-FR')} images vérifiées · ${dead.toLocaleString('fr-FR')} mortes${detail ? ` (${detail})` : ''} · ${again.toLocaleString('fr-FR')} à revoir${reported ? ` · ${reported} signalées par le site` : ''}`
  ctx.log(`images : ${note}`)
  return { counters, cursor: { checked, dead, again, note } satisfies ImageObsoleteCursor, errors }
}
