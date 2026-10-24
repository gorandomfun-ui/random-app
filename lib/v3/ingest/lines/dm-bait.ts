/**
 * The night's check for piracy bait on Dailymotion (24 October: account x1cfbdd, thirty-eight stills of 302 seconds
 * with a fake player, four of which had come into the base; the owner wants the kind stopped before it enters).
 *
 * The door refuses the listed accounts on every line at once (lib/ingest/junkStore.ts); this line finds them. Each
 * night, the accounts whose undescribed videos entered in the last twenty-six hours, those with the most such videos
 * first, each asked once of Dailymotion — its hundred latest uploads, one call, two a second at most — and judged on
 * them (lib/v3/bait/rule.ts). The verdict is kept (dm_bait_checks_v1): an account is asked once. With `base`, in the
 * time left, the accounts the base already holds, a bounded number a night, in the order of their key from where the
 * last night stopped (dig_meta_v4, `dm-bait`); the walk reads the key index only.
 *
 * A bait account is listed (dm_bait_accounts_v1), its rows saved as JSON on the server's disk, then deleted; a listed
 * account still holding rows — come in during the door's ten minutes, or a deletion that failed — is set aside the
 * next night. A dry run asks and judges, and writes nothing.
 *
 * Free, no YouTube unit, no model; a few megabytes a night.
 */

import type { Document } from 'mongodb'

import { askUploads, DailymotionRefusal } from '../../bait/ask'
import { baitReason, judgeAccount, SEED_BAIT_ACCOUNTS, type Judgement, type Upload } from '../../bait/rule'
import { BAIT_ACCOUNTS, checkedAmong, listBait, listedAmong, recordChecks, sampleOf, setAsideRows, type CheckRow } from '../../bait/store'
import type { LineContext, LineResult } from '../context'
import { emptyCounters } from '../journal'

/** The night looks back a little over a day, so that a run that starts late misses nothing. */
export const WINDOW_MS = 26 * 3_600_000
/** Two questions a second at most, with a margin for the clock. */
export const SPACING_MS = 510
const DEADLINE_MARGIN_MS = 30_000
/** Verdicts written together; a run that dies loses at most these, asked again the next night. */
const FLUSH_EVERY = 50
/** The night's own accounts asked at most (about 2,000 on 24 October, fewer once the verdicts are kept). */
const WINDOW_ASKS = Number(process.env.RANDOM_DM_BAIT_WINDOW_ASKS ?? 3000)
/** The base's accounts asked a night at most, and walked at most (163,104 accounts on 24 October). */
const BASE_ASKS = Number(process.env.RANDOM_DM_BAIT_BASE_ASKS ?? 1500)
const BASE_WALK = Number(process.env.RANDOM_DM_BAIT_BASE_WALK ?? 20_000)
/** Keys read from the index at a time; an account holds four rows on average. */
const BASE_BATCH = 400
/** Listed accounts looked at for rows left in the base, a night. */
const SWEEP_MAX = 2000
const META = 'dig_meta_v4'
const CURSOR_ID = 'dm-bait'
const PREFIX = 'dailymotion:'
/** The first key past every Dailymotion one: ";" follows ":". */
const PAST_DAILYMOTION = 'dailymotion;'
/** On the ingestion server; a hand on a computer gives its own (RANDOM_BACKUP_DIR). */
export const BACKUP_DIR = process.env.RANDOM_BACKUP_DIR ?? '/home/random/backups'

export type DmBaitDeps = {
  request?: typeof fetch
  now?: number
  /** Also walk the accounts already in the base. */
  base?: boolean
  backupDir?: string
  windowAsks?: number
  baseAsks?: number
  baseWalk?: number
  /** The clock and the wait of the pacing, replaceable in tests. */
  clock?: () => number
  sleep?: (ms: number) => Promise<void>
}

export type DmBaitCursor = { note: string; bait: string[] }

const message = (error: unknown) => (error instanceof Error ? error.message.slice(0, 160) : String(error))
const french = (n: number) => n.toLocaleString('fr-FR')
/** "1 vidéo", "3 vidéos". */
const videos = (n: number) => `${french(n)} vidéo${n > 1 ? 's' : ''}`
const isKey = (value: unknown): value is string => typeof value === 'string' && value.startsWith(PREFIX) && value.length > PREFIX.length

/** The accounts whose videos without a description entered since `since`, those with the most first. */
export async function windowAccounts(ctx: LineContext, since: Date): Promise<Array<{ key: string; videos: number }>> {
  const rows = await ctx.db.collection('items').aggregate<{ _id: unknown; n: number }>([
    { $match: { type: 'video', provider: 'dailymotion', createdAt: { $gte: since }, description: { $not: /\S/ } } },
    { $group: { _id: '$v3.channelKey', n: { $sum: 1 } } },
    { $sort: { n: -1, _id: 1 } },
  ], { hint: 'video_provider_createdAt_lookup', maxTimeMS: 90_000 }).toArray()
  return rows.flatMap((row) => (isKey(row._id) ? [{ key: row._id, videos: row.n }] : []))
}

export async function run(ctx: LineContext, deps: DmBaitDeps = {}): Promise<LineResult> {
  const request = deps.request ?? ctx.http ?? fetch
  const now = deps.now ?? Date.now()
  const clock = deps.clock ?? Date.now
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const backupDir = deps.backupDir ?? BACKUP_DIR
  const items = ctx.db.collection('items')
  const counters = emptyCounters()
  const errors: string[] = []
  const tally = { asked: 0, bait: 0, clean: 0, few: 0, gone: 0, failed: 0, rows: 0, deleted: 0 }
  const found: string[] = []
  const askedTonight = new Set<string>()
  const pending: CheckRow[] = []
  let refused = false
  let lastAsk = Number.NEGATIVE_INFINITY

  const pace = async () => {
    const waitMs = lastAsk + SPACING_MS - clock()
    if (waitMs > 0) await sleep(waitMs)
    lastAsk = clock()
  }
  const flush = async () => {
    const rows = pending.splice(0)
    if (ctx.dryRun || !rows.length) return
    await recordChecks(ctx.db, rows).catch((error) => { errors.push(`verdicts : ${message(error)}`) })
  }
  const timeIsUp = () => ctx.timeLeft() < DEADLINE_MARGIN_MS

  /** Saves and deletes what the base holds of a bait account. */
  const setAside = async (key: string) => {
    try {
      const aside = await setAsideRows(ctx.db, key, backupDir, { dryRun: ctx.dryRun, now: new Date() })
      tally.rows += aside.rows
      tally.deleted += aside.deleted
      if (aside.rows) ctx.log(`${key} : ${videos(aside.rows)} ${ctx.dryRun ? 'à mettre de côté' : `sauvegardée${aside.rows > 1 ? 's' : ''} (${aside.file}), ${aside.deleted} supprimée${aside.deleted > 1 ? 's' : ''}`}`)
    } catch (error) {
      errors.push(`mise de côté ${key} : ${message(error)}`)
    }
  }

  /** Lists a bait account; a listing that fails leaves the account unjudged, to be asked again the next night. */
  const list = async (key: string, judgement: Judgement, total: number | null, uploads: readonly Upload[], reason: string, from: CheckRow['from']): Promise<boolean> => {
    ctx.log(`appât : ${key} — ${reason}${uploads[0]?.title ? ` (« ${uploads[0].title.slice(0, 60)} »…)` : ''}`)
    if (ctx.dryRun) return true
    try {
      await listBait(ctx.db, { _id: key, reason, ...(judgement.seconds ? { seconds: judgement.seconds } : {}), listed: judgement.listed, total, sample: sampleOf(uploads), listedAt: new Date(), from })
      return true
    } catch (error) {
      errors.push(`liste ${key} : ${message(error)}`)
      return false
    }
  }

  /** One account: one question, its verdict kept; a bait account listed and set aside. */
  const check = async (key: string, from: CheckRow['from']): Promise<void> => {
    askedTonight.add(key)
    await pace()
    let answer
    try {
      answer = await askUploads(key.slice(PREFIX.length), request)
    } catch (error) {
      // Dailymotion saying "enough": no more questions tonight, the rest waits for the next night.
      if (error instanceof DailymotionRefusal && (error.status === 403 || error.status === 429)) {
        refused = true
        errors.push(`Dailymotion refuse les questions (HTTP ${error.status}) : la suite demain`)
        return
      }
      tally.failed += 1
      if (tally.failed <= 5) errors.push(`${key} : ${message(error)}`)
      return
    }
    tally.asked += 1
    if (answer.gone) {
      tally.gone += 1
      pending.push({ _id: key, verdict: 'gone', listed: 0, total: null, at: new Date(), from })
      return
    }
    const judgement = judgeAccount(answer.uploads)
    tally[judgement.verdict] += 1
    if (judgement.verdict === 'bait') {
      if (!(await list(key, judgement, answer.total, answer.uploads, baitReason(judgement), from))) return
      found.push(key)
    }
    pending.push({ _id: key, verdict: judgement.verdict, listed: judgement.listed, total: answer.total, ...(judgement.seconds ? { seconds: judgement.seconds } : {}), at: new Date(), from })
    if (judgement.verdict === 'bait') await setAside(key)
    if (pending.length >= FLUSH_EVERY) await flush()
  }

  // The accounts known before the line, listed once with what Dailymotion still shows of them: the door refuses them anyway.
  const seeds = Object.keys(SEED_BAIT_ACCOUNTS)
  let seedsListed = 0
  try {
    const listedSeeds = await listedAmong(ctx.db, seeds)
    for (const key of seeds) {
      if (listedSeeds.has(key)) continue
      askedTonight.add(key)
      await pace()
      const answer = await askUploads(key.slice(PREFIX.length), request).catch(() => null)
      const uploads = answer && !answer.gone ? answer.uploads : []
      const judgement = judgeAccount(uploads)
      const reason = `${SEED_BAIT_ACCOUNTS[key]}${judgement.verdict === 'bait' ? ` : ${baitReason(judgement)}` : ''}`
      if (await list(key, judgement, answer && !answer.gone ? answer.total : null, uploads, reason, 'seed')) seedsListed += 1
    }
  } catch (error) {
    errors.push(`comptes connus d'avance : ${message(error)}`)
  }

  // The listed accounts whose rows are still in the base — come in during the door's ten minutes, a deletion that
  // failed, a seed: a count on the key index each.
  try {
    const listedRows = await ctx.db.collection(BAIT_ACCOUNTS).find({}, { projection: { _id: 1 }, limit: SWEEP_MAX, maxTimeMS: 5000 }).toArray()
    for (const key of new Set([...seeds, ...listedRows.map((row) => String(row._id))])) {
      if (timeIsUp()) break
      const left = await items.countDocuments({ 'v3.channelKey': key } as Document, { hint: 'v3_channel_key', limit: 1, maxTimeMS: 4000 })
      if (left) await setAside(key)
    }
  } catch (error) {
    errors.push(`comptes listés : ${message(error)}`)
  }

  // The night's own accounts.
  let windowTotal = 0
  let windowTodo = 0
  try {
    const accounts = await windowAccounts(ctx, new Date(now - WINDOW_MS))
    const keys = accounts.map((account) => account.key)
    windowTotal = keys.length
    const listed = new Set([...seeds, ...await listedAmong(ctx.db, keys)])
    const checked = await checkedAmong(ctx.db, keys, now)
    const todo = keys.filter((key) => !listed.has(key) && !checked.has(key))
    windowTodo = todo.length
    ctx.log(`${french(windowTotal)} comptes du jour avec une vidéo sans description, ${french(windowTodo)} jamais demandés`)
    for (const key of todo.slice(0, deps.windowAsks ?? WINDOW_ASKS)) {
      if (refused || timeIsUp()) break
      await check(key, 'window')
    }
  } catch (error) {
    errors.push(`comptes du jour : ${message(error)}`)
  }
  await flush()
  const windowAsked = tally.asked + tally.failed

  // The base, walked in the order of the key index from where the last night stopped.
  let walked = 0
  let baseAsked = 0
  let wrapped = false
  if (deps.base && !refused && !timeIsUp()) {
    const meta = ctx.db.collection(META)
    try {
      const cursor = await meta.findOne({ _id: CURSOR_ID } as Document, { maxTimeMS: 4000 })
      const saved: unknown = cursor?.after
      let after = isKey(saved) ? saved : PREFIX
      let cycle = Number(cursor?.cycle ?? 0)
      const askLimit = deps.baseAsks ?? BASE_ASKS
      const walkLimit = deps.baseWalk ?? BASE_WALK
      walk: while (baseAsked < askLimit && walked < walkLimit && !refused && !timeIsUp()) {
        const entries = await items.find({ 'v3.channelKey': { $gt: after, $lt: PAST_DAILYMOTION } } as Document, {
          projection: { _id: 0, 'v3.channelKey': 1 }, sort: { 'v3.channelKey': 1 }, limit: BASE_BATCH, hint: 'v3_channel_key', maxTimeMS: 10_000,
        }).toArray()
        const batch = [...new Set(entries.map((entry) => (entry.v3 as { channelKey?: unknown } | undefined)?.channelKey).filter(isKey))]
        // The end of the base: the next night begins it again, asking only the accounts come in since.
        if (!batch.length) { after = PREFIX; cycle += 1; wrapped = true; break }
        const listed = new Set([...seeds, ...await listedAmong(ctx.db, batch)])
        const checked = await checkedAmong(ctx.db, batch, now)
        for (const key of batch) {
          if (baseAsked >= askLimit || walked >= walkLimit || timeIsUp()) break walk
          if (!listed.has(key) && !checked.has(key) && !askedTonight.has(key)) {
            await check(key, 'base')
            if (refused) break walk
            baseAsked += 1
          }
          after = key
          walked += 1
        }
      }
      await flush()
      if (!ctx.dryRun) await meta.updateOne({ _id: CURSOR_ID } as Document, { $set: { after, cycle, at: new Date() } }, { upsert: true })
    } catch (error) {
      errors.push(`base : ${message(error)}`)
    }
  }
  await flush()

  counters.scanned = tally.asked
  if (tally.bait + seedsListed) counters.rejected['compte appât'] = tally.bait + seedsListed
  if (tally.deleted || (ctx.dryRun && tally.rows)) counters.rejected['vidéos retirées'] = ctx.dryRun ? tally.rows : tally.deleted
  if (tally.few) counters.rejected['trop peu de vidéos pour juger'] = tally.few
  if (tally.gone) counters.rejected['compte disparu'] = tally.gone

  const listedNow = [...new Set(found)]
  const parts = [
    `${french(windowTotal)} comptes du jour avec une vidéo sans description, ${french(windowTodo)} jamais demandés`,
    `${french(windowAsked)} demandés`,
    `${tally.bait} appât${tally.bait > 1 ? 's' : ''}${listedNow.length ? ` (${listedNow.slice(0, 5).join(', ')}${listedNow.length > 5 ? '…' : ''})` : ''}`,
    ...(seedsListed ? [`${seedsListed} connu${seedsListed > 1 ? 's' : ''} d'avance listé${seedsListed > 1 ? 's' : ''}`] : []),
    ...(tally.rows ? [ctx.dryRun ? `${videos(tally.rows)} à sauvegarder puis supprimer` : `${videos(tally.deleted)} supprimée${tally.deleted > 1 ? 's' : ''} sur ${french(tally.rows)}, sauvegardée${tally.rows > 1 ? 's' : ''} dans ${backupDir}/dm-bait`] : []),
    `${french(tally.clean)} sains · ${french(tally.few)} trop petits · ${french(tally.gone)} disparus${tally.failed ? ` · ${tally.failed} sans réponse` : ''}`,
    ...(deps.base ? [`base : ${french(walked)} comptes parcourus, ${french(baseAsked)} demandés${wrapped ? ', fin de la base atteinte' : ''}`] : []),
  ]
  const note = `${ctx.dryRun ? 'à blanc : ' : ''}${parts.join(' · ')}`
  ctx.log(`appâts Dailymotion : ${note}`)
  return { counters, errors, cursor: { note, bait: listedNow } satisfies DmBaitCursor }
}
