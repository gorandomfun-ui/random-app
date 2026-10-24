/**
 * Moves Comm's files from Vercel Blob to the bucket, one by one: fetched from
 * Blob (which counts toward Blob's last downloads of the month), put in the
 * bucket under the same key, checked by size, the record pointed at the bucket
 * with the old address kept (`legacyUrl`) until --delete removes the file from
 * Blob. The promo's tracks go the same way, by their keys. Dry run unless --apply.
 *
 *   node --env-file=.env.local --import tsx scripts/comm/migrate-blob-to-gcs.ts                   what remains, by item, newest first
 *   … --apply --max-mb 150              copies: pictures first, then the newest clips, within that many MB of Blob downloads
 *   … --apply --ids <mediaId,mediaId>   these records only (the budget still holds)
 *   … --delete                          removes from Blob every file whose copy checks out, and forgets the old address
 */

import { ObjectId } from 'mongodb'

import { commDb } from '@/lib/comm/auth'
import { legacyBlobUrl } from '@/lib/comm/blob'
import { gcsConfigured, objectMeta, objectUrl, putObject } from '@/lib/comm/gcs'
import { COMM_MEDIA } from '@/lib/comm/model'
import { TRACKS_PREFIX, trackPathOk, trackTypeOf } from '@/lib/comm/tracks'

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(name)
const value = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] ?? '' : '' }
const apply = flag('--apply'), remove = flag('--delete')
const maxBytes = (Number(value('--max-mb')) || 150) * 1_000_000
const onlyIds = value('--ids').split(',').map((s) => s.trim()).filter(Boolean)
const mb = (n: number) => `${(n / 1_000_000).toFixed(1)} MB`

type Row = { _id: ObjectId; queueItemId: string; kind: string; contentType: string; bytes: number; blobUrl: string; blobKey: string; createdAt: Date; legacyUrl?: string }

async function fetchWhole(url: string): Promise<Uint8Array> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`fetch ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}

async function main() {
  if (!gcsConfigured()) throw new Error('COMM_GCS_BUCKET / COMM_GCS_KEY missing')
  const db = await commDb()
  const rows = (await db.collection(COMM_MEDIA).find({}, { sort: { createdAt: -1 } }).toArray()) as unknown as Row[]
  const pending = rows.filter((r) => legacyBlobUrl(r.blobUrl) && (!onlyIds.length || onlyIds.includes(String(r._id))))
  const moved = rows.filter((r) => !legacyBlobUrl(r.blobUrl))
  console.log(`${rows.length} media records: ${moved.length} in the bucket, ${pending.length} still in Blob (${mb(pending.reduce((s, r) => s + r.bytes, 0))})`)

  if (remove) {
    // Only a file whose copy in the bucket is whole leaves Blob.
    const { del } = await import('@vercel/blob')
    let gone = 0
    for (const row of rows.filter((r) => r.legacyUrl && !legacyBlobUrl(r.blobUrl))) {
      const meta = await objectMeta(row.blobKey)
      if (!meta || meta.size !== row.bytes) { console.log(`keep ${row._id}: copy ${meta ? `has ${meta.size} bytes, record says ${row.bytes}` : 'missing'}`); continue }
      if (apply) { await del(row.legacyUrl!); await db.collection(COMM_MEDIA).updateOne({ _id: row._id }, { $unset: { legacyUrl: '' } }) }
      gone += 1
      console.log(`${apply ? 'deleted' : 'would delete'} from Blob ${row.kind} ${mb(row.bytes)} (${row._id})`)
    }
    await deleteTracksFromBlob(apply)
    console.log(`${gone} files ${apply ? 'deleted' : 'to delete'} from Blob`)
    return
  }

  // Pictures first (small, the list looks right at once), then the clips newest first; the budget is Blob's downloads.
  const order = [...pending].sort((a, b) => (a.contentType.startsWith('video/') ? 1 : 0) - (b.contentType.startsWith('video/') ? 1 : 0) || b.createdAt.getTime() - a.createdAt.getTime())
  let spent = 0, done = 0
  for (const row of order) {
    if (spent + row.bytes > maxBytes) { console.log(`skip ${row.kind} ${mb(row.bytes)} (${row._id}): past the budget of ${mb(maxBytes)}`); continue }
    const already = await objectMeta(row.blobKey)
    if (already && already.size === row.bytes) {
      console.log(`${apply ? 'pointed' : 'would point'} ${row.kind} ${mb(row.bytes)} (${row._id}): copy already there`)
      if (apply) await db.collection(COMM_MEDIA).updateOne({ _id: row._id }, { $set: { legacyUrl: row.blobUrl, blobUrl: objectUrl(row.blobKey) } })
      done += 1; continue
    }
    console.log(`${apply ? 'copying' : 'would copy'} ${row.kind} ${mb(row.bytes)} ${row.createdAt.toISOString().slice(0, 10)} (${row._id}) → ${row.blobKey}`)
    spent += row.bytes
    if (!apply) { done += 1; continue }
    const bytes = await fetchWhole(row.blobUrl)
    await putObject(row.blobKey, bytes, row.contentType)
    const meta = await objectMeta(row.blobKey)
    if (!meta || meta.size !== bytes.byteLength) throw new Error(`copy of ${row._id} not whole: ${meta?.size ?? 'missing'} vs ${bytes.byteLength}`)
    // The record says what the file really weighs; the old address stays until --delete.
    await db.collection(COMM_MEDIA).updateOne({ _id: row._id }, { $set: { legacyUrl: row.blobUrl, blobUrl: objectUrl(row.blobKey), bytes: bytes.byteLength } })
    done += 1
  }
  await copyTracks(apply, maxBytes - spent)
  console.log(`${done} records ${apply ? 'moved' : 'to move'}, ${mb(spent)} of Blob downloads ${apply ? 'spent' : 'needed'}`)
}

/** The promo's tracks: every file under the folder in Blob, copied under the same key when the bucket lacks it. */
async function copyTracks(doIt: boolean, budget: number) {
  const { list } = await import('@vercel/blob')
  const { blobs } = await list({ prefix: TRACKS_PREFIX, limit: 200 })
  let spent = 0
  for (const blob of blobs.filter((b) => b.size > 0 && trackPathOk(b.pathname))) {
    const meta = await objectMeta(blob.pathname)
    if (meta && meta.size === blob.size) continue
    if (spent + blob.size > budget) { console.log(`skip track ${blob.pathname}: past the budget`); continue }
    console.log(`${doIt ? 'copying' : 'would copy'} track ${blob.pathname} ${mb(blob.size)}`)
    spent += blob.size
    if (!doIt) continue
    await putObject(blob.pathname, await fetchWhole(blob.url), trackTypeOf(blob.pathname))
  }
}

async function deleteTracksFromBlob(doIt: boolean) {
  const { list, del } = await import('@vercel/blob')
  const { blobs } = await list({ prefix: TRACKS_PREFIX, limit: 200 })
  for (const blob of blobs.filter((b) => trackPathOk(b.pathname))) {
    const meta = await objectMeta(blob.pathname)
    if (!meta || meta.size !== blob.size) { console.log(`keep track ${blob.pathname}: no whole copy`); continue }
    console.log(`${doIt ? 'deleted' : 'would delete'} track from Blob ${blob.pathname}`)
    if (doIt) await del(blob.url)
  }
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1) })
