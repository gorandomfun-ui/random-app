/**
 * Where piracy bait touches the database: the list of bait accounts the door refuses, the verdicts that keep an account
 * from being asked twice, and the setting aside of a bait account's rows — saved to a file first, deleted after.
 *
 * The door's read never stops an ingestion: a list that cannot be read leaves the accounts known before it.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { BSON, type Db, type Document, type ObjectId } from 'mongodb'

import { SEED_BAIT_ACCOUNTS, type BaitVerdict, type Upload } from './rule'

/** The bait accounts, one row each: `_id` the channel key (`dailymotion:x1cfbdd`), the reason, a sample of their uploads. */
export const BAIT_ACCOUNTS = 'dm_bait_accounts_v1'
/** Every account asked, one row each, its verdict: an account is asked once. */
export const BAIT_CHECKS = 'dm_bait_checks_v1'

/** The list changes once a night; ten minutes of cache is plenty, and a line's run sees a listing within ten minutes. */
const CACHE_MS = 10 * 60_000
/** A list that could not be read is asked again a minute later, not ten. */
const FAILED_CACHE_MS = 60_000
/** An account too small to judge is asked again when it comes back a month later: it may have grown. */
export const FEW_RECHECK_MS = 30 * 86_400_000
/** The rows of one account set aside in one go, at most: a bait account rarely brings more than a few dozen. */
const SET_ASIDE_MAX = 5000
const SAMPLE_SIZE = 5
const TITLE_MAX = 200

let cache: { at: number; ttl: number; keys: Set<string> } | null = null

export function resetBaitAccountsCache(): void {
  cache = null
}

/** The accounts the door refuses: the list, and the ones known before it (lib/v3/bait/rule.ts). */
export async function baitAccounts(db: Db, now = Date.now()): Promise<Set<string>> {
  if (cache && now - cache.at < cache.ttl) return cache.keys
  let ttl = CACHE_MS
  let rows: Document[] = []
  try {
    rows = await db.collection(BAIT_ACCOUNTS).find({}, { projection: { _id: 1 }, maxTimeMS: 2000 }).toArray()
  } catch {
    ttl = FAILED_CACHE_MS
  }
  cache = { at: now, ttl, keys: new Set([...Object.keys(SEED_BAIT_ACCOUNTS), ...rows.map((row) => String(row._id))]) }
  return cache.keys
}

/** The listed accounts among these keys, read fresh (the line's own view, not the door's cache). */
export async function listedAmong(db: Db, keys: readonly string[]): Promise<Set<string>> {
  const listed = new Set<string>()
  for (let at = 0; at < keys.length; at += 500) {
    const rows = await db.collection(BAIT_ACCOUNTS).find({ _id: { $in: keys.slice(at, at + 500) } } as Document, { projection: { _id: 1 }, maxTimeMS: 5000 }).toArray()
    for (const row of rows) listed.add(String(row._id))
  }
  return listed
}

/** The verdict kept for an account. `gone`: Dailymotion no longer knows it. */
export type CheckRow = {
  _id: string
  verdict: BaitVerdict | 'gone'
  listed: number
  total: number | null
  seconds?: number
  at: Date
  /** How the account came to be asked: its videos of the day, the walk through the base, or the list of those found by hand. */
  from: 'window' | 'base' | 'seed'
}

/** Whether an account's verdict still holds: every verdict does, but a `few` one past a month. */
export function verdictHolds(row: Pick<CheckRow, 'verdict' | 'at'>, now: number): boolean {
  if (row.verdict !== 'few') return true
  return row.at instanceof Date && now - row.at.getTime() < FEW_RECHECK_MS
}

/** The keys among these that were already asked and whose verdict holds. */
export async function checkedAmong(db: Db, keys: readonly string[], now: number): Promise<Set<string>> {
  const checked = new Set<string>()
  for (let at = 0; at < keys.length; at += 500) {
    const rows = await db.collection(BAIT_CHECKS).find({ _id: { $in: keys.slice(at, at + 500) } } as Document, { projection: { verdict: 1, at: 1 }, maxTimeMS: 5000 }).toArray()
    for (const row of rows) if (verdictHolds(row as unknown as CheckRow, now)) checked.add(String(row._id))
  }
  return checked
}

/** The verdicts of a batch of accounts, in one write. */
export async function recordChecks(db: Db, rows: readonly CheckRow[]): Promise<void> {
  if (!rows.length) return
  await db.collection(BAIT_CHECKS).bulkWrite(
    rows.map(({ _id, ...row }) => ({ updateOne: { filter: { _id } as Document, update: { $set: row }, upsert: true } })),
    { ordered: false },
  )
}

export type BaitSample = { id: string; title: string; seconds: number | null; uploadedAt: Date | null }

export type BaitListing = {
  _id: string
  reason: string
  seconds?: number
  listed: number
  total: number | null
  sample: BaitSample[]
  listedAt: Date
  from: CheckRow['from']
}

/** What the list keeps of a bait account's uploads: a few, enough to see what it was. */
export function sampleOf(uploads: readonly Upload[]): BaitSample[] {
  return uploads.slice(0, SAMPLE_SIZE).map((upload) => ({
    id: String(upload.id ?? ''),
    title: (upload.title ?? '').slice(0, TITLE_MAX),
    seconds: typeof upload.duration === 'number' ? upload.duration : null,
    uploadedAt: typeof upload.created_time === 'number' ? new Date(upload.created_time * 1000) : null,
  }))
}

/** Lists the account for the door; listed again, it gets the new sample and keeps its first date. */
export async function listBait(db: Db, listing: BaitListing): Promise<void> {
  const { _id, listedAt, ...rest } = listing
  await db.collection(BAIT_ACCOUNTS).updateOne({ _id } as Document, { $set: rest, $setOnInsert: { listedAt } }, { upsert: true })
  resetBaitAccountsCache()
}

/** What became of a bait account's rows: how many the base held, the file they were saved to, how many were deleted. */
export type SetAside = { rows: number; file: string | null; deleted: number }

/** "20261025T031702Z": a file name that sorts by time. */
const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/**
 * Saves the account's rows to `<dir>/dm-bait/<owner>-<time>.json` — canonical extended JSON, every type kept, an array
 * `mongoimport --collection items --jsonArray --file …` puts back — reads the file again, and only then deletes those
 * very rows. Nothing is deleted when the file cannot be written or does not read back whole. A dry run only reads.
 */
export async function setAsideRows(db: Db, key: string, dir: string, options: { dryRun: boolean; now: Date }): Promise<SetAside> {
  const items = db.collection('items')
  const rows = await items.find({ 'v3.channelKey': key } as Document, { hint: 'v3_channel_key', limit: SET_ASIDE_MAX, maxTimeMS: 30_000 }).toArray()
  if (!rows.length || options.dryRun) return { rows: rows.length, file: null, deleted: 0 }
  const folder = join(dir, 'dm-bait')
  await mkdir(folder, { recursive: true })
  const owner = key.replace(/^dailymotion:/, '').replace(/[^\w-]/g, '_')
  const file = join(folder, `${owner}-${stamp(options.now)}.json`)
  await writeFile(file, BSON.EJSON.stringify(rows, { relaxed: false }), { flag: 'wx' })
  const saved = BSON.EJSON.parse(await readFile(file, 'utf8'), { relaxed: false }) as Document[]
  const ids = rows.map((row) => row._id as ObjectId)
  const savedIds = new Set(saved.map((row) => String(row._id)))
  if (saved.length !== rows.length || ids.some((id) => !savedIds.has(String(id)))) throw new Error(`sauvegarde de ${key} incomplète : rien n'est supprimé`)
  const result = await items.deleteMany({ _id: { $in: ids }, 'v3.channelKey': key } as Document)
  return { rows: rows.length, file, deleted: result.deletedCount ?? 0 }
}
