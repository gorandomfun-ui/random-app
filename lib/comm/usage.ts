/**
 * What the store costs, kept under Google's free band by the tool itself,
 * since Google only mails when a budget is crossed (and its cut would take
 * the ingestion server with it, hours late). Two counters: the bytes handed
 * out this month — a clip opened in the composer, a file given to a platform —
 * against 90 GB of the free 100; the bytes stored against 4.5 GB of the free
 * 5. At the line, the tool refuses (a clip to open, a file to send) and says
 * when it opens again: the first of next month, or when the list is emptied.
 * Pictures and tracks are the small change and are not counted.
 */

import type { Db } from 'mongodb'

import { COMM_MEDIA } from './model'
import { TRACKS_PREFIX } from './tracks'
import { gcsConfigured, listObjects } from './gcs'

export const COMM_USAGE = 'comm_usage'
const QUERY_MS = 2500
const GB = 1_000_000_000

const capOf = (name: string, fallback: number) => { const n = Number(process.env[name]); return Number.isFinite(n) && n > 0 ? n * GB : fallback * GB }
/** Bytes handed out a month before the tool refuses: 90 of Google's free 100 GB. */
export const egressCap = () => capOf('COMM_EGRESS_CAP_GB', 90)
/** Bytes stored before the tool refuses a file: 4.5 of Google's free 5 GB. */
export const storageCap = () => capOf('COMM_STORAGE_CAP_GB', 4.5)

/** The month's key, UTC: Google counts its free band by the calendar month. */
export function monthKey(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

/** The first moment of next month, when the egress counter starts again. */
export function nextMonthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
}

export async function monthEgress(db: Db, now = new Date()): Promise<number> {
  const row = await db.collection(COMM_USAGE).findOne({ _id: `egress:${monthKey(now)}` } as never, { maxTimeMS: QUERY_MS })
  return typeof row?.bytes === 'number' ? row.bytes : 0
}

/** True when handing out that many bytes stays under the month's cap. */
export function egressAllowed(soFar: number, bytes: number, cap = egressCap()): boolean {
  return soFar + Math.max(0, bytes) <= cap
}

/** Adds to the month's count; returns the new total. */
export async function countEgress(db: Db, bytes: number, now = new Date()): Promise<number> {
  if (!(bytes > 0)) return monthEgress(db, now)
  const result = await db.collection(COMM_USAGE).findOneAndUpdate({ _id: `egress:${monthKey(now)}` } as never, { $inc: { bytes: Math.round(bytes), count: 1 }, $set: { updatedAt: now } }, { upsert: true, returnDocument: 'after', maxTimeMS: QUERY_MS })
  return typeof result?.bytes === 'number' ? result.bytes : bytes
}

/** The bytes in the store: every media record, plus the promo's tracks. */
export async function storedBytes(db: Db): Promise<number> {
  const [row] = await db.collection(COMM_MEDIA).aggregate([{ $group: { _id: null, bytes: { $sum: '$bytes' } } }], { maxTimeMS: QUERY_MS }).toArray()
  let total = typeof row?.bytes === 'number' ? row.bytes : 0
  if (gcsConfigured()) { try { for (const track of await listObjects(TRACKS_PREFIX)) total += track.size } catch { /* the tracks' weight is small; counted next time */ } }
  return total
}

/** True when storing that many more bytes stays under the cap. */
export function storageAllowed(soFar: number, bytes: number, cap = storageCap()): boolean {
  return soFar + Math.max(0, bytes) <= cap
}

export type Usage = { month: string; egressBytes: number; egressCap: number; storedBytes: number; storageCap: number; resetAt: string }

export async function usageOf(db: Db, now = new Date()): Promise<Usage> {
  const [egressBytes, stored] = await Promise.all([monthEgress(db, now), storedBytes(db)])
  return { month: monthKey(now), egressBytes, egressCap: egressCap(), storedBytes: stored, storageCap: storageCap(), resetAt: nextMonthStart(now).toISOString() }
}

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
/** What the tool says at the month's line. */
export function egressFullMessage(now = new Date()): string {
  const next = nextMonthStart(now)
  return `Plafond du mois atteint (${Math.round(egressCap() / GB)} Go téléchargés) : les clips se rouvrent le 1er ${MONTHS[next.getUTCMonth()]}.`
}
/** What the tool says when the store is full. */
export function storageFullMessage(): string {
  return `Stockage plein (${(storageCap() / GB).toFixed(1).replace('.0', '').replace('.', ',')} Go) : supprime des éléments de la file pour faire de la place.`
}
