/**
 * Wikipedia's "Did you know" anecdotes, refreshed every week (server/run-line.sh, anecdotes: Mondays at 12:03 Paris).
 * The import of 20 October read the archives once (35,907 cards); they grow by about 55 anecdotes a month in French,
 * 56 in German and 280 to 380 in English. Each week the line reads the current and the previous month of the three —
 * six pages at most, a second apart — and enters only the anecdotes not stored yet, in one grouped write.
 *
 * The rules of the import (lib/v3/anecdotes): the same sentences, the same ids, the same cards, the sensitive ones
 * kept one in three. What is stored already counts as read before, so a hook entered once is never entered again,
 * nor the same anecdote reworded since.
 *
 * Once, by hand (`catchUpEnglish`): the English months the import did not read — it read 2025 and March of every
 * year — from February 2004 on: about 240 pages a second apart, a hundred thousand cards written a few hundred at a
 * time with a pause between two writes.
 */

import type { Document } from 'mongodb'

import { anecdoteCard, cardInserts, sourceKeyOf } from '../../anecdotes/cards'
import { EN_ARCHIVE, englishCatchUpPages, weeklyPages } from '../../anecdotes/pages'
import { AnecdoteSieve, anecdoteId, readPage, type Anecdote, type AnecdoteLang, type Drop, type Hook } from '../../anecdotes/parse'
import { wikiClient } from '../../anecdotes/wiki'
import type { LineContext, LineResult } from '../context'
import { emptyCounters, type RunCounters } from '../journal'

/** The languages the week reads: Spanish has been dormant since 2008, Japanese has no such section. */
export const WEEKLY_LANGS = ['fr', 'en', 'de'] as const satisfies readonly AnecdoteLang[]
/** The week's cards in one write: a few hundred at most. */
const WEEK_BATCH = 500
/** The catch-up's cards a few hundred at a time, a pause between two writes: the base has one core, two seconds a write. */
const CATCH_UP_BATCH = Number(process.env.RANDOM_ANECDOTES_BATCH ?? 250)
const CATCH_UP_PAUSE_MS = Number(process.env.RANDOM_ANECDOTES_PAUSE_MS ?? 5000)
/**
 * Reading what is stored passes over every card of the language — 10,000 to 13,000 today: no index holds the card's
 * key, only its language (the draw's index). A partial index on `sourceKey` would make it a seek.
 */
const LANG_INDEX = 'discovery_lang_rand_v2'
const STORED_MAX_MS = 120_000
const DEADLINE_MARGIN_MS = 60_000

/** The journal's words for why a hook is set aside. */
const REASONS: Record<Exclude<Drop, 'duplicate'>, string> = {
  notHook: 'pas une accroche',
  noArticle: 'sans article',
  deletedArticle: 'article supprimé',
  leftoverMarkup: 'balisage restant',
  truncated: 'phrase coupée',
  tooShort: 'trop courte',
  tooLong: 'trop longue',
}
const SET_ASIDE = 'sensible, mise de côté (une sur trois gardée)'

export type AnecdotesOptions = {
  now?: Date
  /** Between two requests to Wikipedia; the tests set none. */
  gapMs?: number
  /** Between two of the catch-up's writes. */
  pauseMs?: number
  /** The catch-up only: these months alone ("2010/June"), to try it on a few first. */
  months?: string[]
}

export type AnecdotesCursor = { note: string; byLang: Partial<Record<AnecdoteLang, number>> }

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

function reject(counters: RunCounters, reason: string, count = 1): void {
  counters.rejected[reason] = (counters.rejected[reason] ?? 0) + count
}

function countDrops(counters: RunCounters, dropped: Partial<Record<Drop, number>>): void {
  for (const [drop, count] of Object.entries(dropped) as Array<[Drop, number]>) {
    if (drop === 'duplicate') counters.duplicates += count
    else reject(counters, REASONS[drop], count)
  }
}

type StoredRow = { sourceKey?: unknown; text?: unknown; dyk?: { article?: unknown } }

/** The stored cards read into the sieve, as anecdotes read before; their keys, for the cards whose text was edited since. */
function remember(sieve: AnecdoteSieve, rows: StoredRow[]): Set<string> {
  for (const row of rows) if (typeof row.text === 'string' && typeof row.dyk?.article === 'string') sieve.remember(row.text, row.dyk.article)
  return new Set(rows.map((row) => String(row.sourceKey ?? '')))
}

/** One read for the language: its cards with one of these keys, or about one of these articles. */
async function storedFor(ctx: LineContext, lang: AnecdoteLang, hooks: Hook[]): Promise<StoredRow[]> {
  const keys = [...new Set(hooks.map((hook) => sourceKeyOf(anecdoteId(lang, hook.key))))]
  const articles = [...new Set(hooks.map((hook) => hook.article.title))]
  return (await ctx.db.collection('items').find(
    { type: 'fact', languageScope: 'localized', lang, provider: 'wikipedia', $or: [{ sourceKey: { $in: keys } }, { 'dyk.article': { $in: articles } }] },
    { projection: { _id: 0, sourceKey: 1, text: 1, 'dyk.article': 1 }, hint: LANG_INDEX, maxTimeMS: Math.max(10_000, Math.min(STORED_MAX_MS, ctx.timeLeft() - DEADLINE_MARGIN_MS)) },
  ).toArray()) as StoredRow[]
}

/** The cards of the anecdotes kept: the sensitive ones set aside two in three, never one whose key is stored. */
function cardsOf(anecdotes: Anecdote[], stored: Set<string>, counters: RunCounters): Document[] {
  const cards: Document[] = []
  for (const anecdote of anecdotes) {
    const card = anecdoteCard(anecdote)
    if (!card) {
      reject(counters, SET_ASIDE)
      continue
    }
    if (stored.has(String(card.sourceKey))) {
      counters.duplicates += 1
      continue
    }
    cards.push(card)
  }
  return cards
}

/** Grouped inserts, `batch` at a time; what an unordered write that failed in part still wrote is counted. */
async function insertCards(ctx: LineContext, cards: Document[], batch: number, errors: string[]): Promise<number> {
  let inserted = 0
  for (let start = 0; start < cards.length; start += batch) {
    try {
      const result = await ctx.db.collection('items').bulkWrite(cardInserts(cards.slice(start, start + batch), new Date()), { ordered: false })
      inserted += result.insertedCount
    } catch (error) {
      inserted += (error as { result?: { insertedCount?: number } }).result?.insertedCount ?? 0
      errors.push(`écriture : ${message(error)}`)
    }
  }
  return inserted
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** The week: the current and the previous month in French, English and German, the anecdotes not stored yet. */
export async function run(ctx: LineContext, options: AnecdotesOptions = {}): Promise<LineResult> {
  const now = options.now ?? new Date()
  const counters = emptyCounters()
  const errors: string[] = []
  const wiki = wikiClient({ http: ctx.http, gapMs: options.gapMs, log: ctx.log })

  // The pages, one language after the other, the month before first.
  const hooks = new Map(WEEKLY_LANGS.map((lang): [AnecdoteLang, Hook[]] => [lang, []]))
  for (const page of weeklyPages(now)) {
    if (ctx.timeLeft() < DEADLINE_MARGIN_MS) {
      errors.push(`délai atteint avant « ${page.title} »`)
      break
    }
    try {
      const read = await wiki.page(page.lang, page.title)
      if (!read) {
        ctx.log(`anecdotes : « ${page.title} » n'existe pas (encore)`)
        continue
      }
      const reading = readPage(page.lang, read, { months: page.months, currentYear: now.getUTCFullYear() })
      counters.scanned += reading.raw
      countDrops(counters, reading.dropped)
      hooks.get(page.lang)?.push(...reading.hooks)
    } catch (error) {
      errors.push(`${page.lang} « ${page.title} » : ${message(error)}`)
    }
  }

  // Each language against what is stored of it, then its new cards.
  const cards: Document[] = []
  const byLang: Partial<Record<AnecdoteLang, number>> = {}
  for (const lang of WEEKLY_LANGS) {
    const found = hooks.get(lang) ?? []
    if (!found.length) continue
    const sieve = new AnecdoteSieve()
    let stored: Set<string>
    try {
      stored = remember(sieve, await storedFor(ctx, lang, found))
    } catch (error) {
      // Without knowing what is stored nothing of the language is written: never twice the same card.
      errors.push(`${lang} : lecture de ce qui est déjà là : ${message(error)}`)
      continue
    }
    const fresh = cardsOf(sieve.sift(found), stored, counters)
    counters.duplicates += sieve.duplicates
    byLang[lang] = fresh.length
    cards.push(...fresh)
  }

  if (!ctx.dryRun && cards.length) counters.inserted += await insertCards(ctx, cards, WEEK_BATCH, errors)
  const split = WEEKLY_LANGS.map((lang) => `${lang} ${byLang[lang] ?? 0}`).join(' · ')
  const entered = ctx.dryRun ? cards.length : counters.inserted
  const note = `${plural(entered, 'nouvelle anecdote', 'nouvelles anecdotes')}${ctx.dryRun ? ' à entrer' : ''}${!ctx.dryRun && entered < cards.length ? ` sur ${cards.length} trouvées` : ''} (${split}) · ${counters.duplicates} déjà là`
  ctx.log(`anecdotes : ${note}`)
  return { counters, errors, cursor: { note, byLang } satisfies AnecdotesCursor }
}

/**
 * Once: the English months the import of 20 October did not read, oldest first, against every English card stored.
 * The cards are written as they come, a few hundred at a time with a pause between two writes. Stopped by its
 * deadline, it is run again and carries on: what it wrote counts as stored (its pages are read again).
 */
export async function catchUpEnglish(ctx: LineContext, options: AnecdotesOptions = {}): Promise<LineResult> {
  const counters = emptyCounters()
  const errors: string[] = []
  const wiki = wikiClient({ http: ctx.http, gapMs: options.gapMs, log: ctx.log })
  const pauseMs = options.pauseMs ?? CATCH_UP_PAUSE_MS

  let titles: string[]
  try {
    titles = englishCatchUpPages(await wiki.titles('en', 4, 'Did you know archive/'))
  } catch (error) {
    return { counters, errors: [`liste des mois : ${message(error)}`] }
  }
  if (options.months?.length) titles = titles.filter((title) => options.months!.some((month) => title.endsWith(`/${month}`)))

  const sieve = new AnecdoteSieve()
  let stored: Set<string>
  try {
    stored = remember(sieve, (await ctx.db.collection('items').find(
      { type: 'fact', languageScope: 'localized', lang: 'en', provider: 'wikipedia' },
      { projection: { _id: 0, sourceKey: 1, text: 1, 'dyk.article': 1 }, hint: LANG_INDEX, maxTimeMS: STORED_MAX_MS },
    ).toArray()) as StoredRow[])
  } catch (error) {
    return { counters, errors: [`lecture des cartes anglaises : ${message(error)}`] }
  }

  const pending: Document[] = []
  let found = 0
  let months = 0
  const flush = async (all: boolean) => {
    while (pending.length >= (all ? 1 : CATCH_UP_BATCH)) {
      const batch = pending.splice(0, CATCH_UP_BATCH)
      if (ctx.dryRun) continue
      counters.inserted += await insertCards(ctx, batch, CATCH_UP_BATCH, errors)
      if (pending.length || !all) await wait(pauseMs)
    }
  }
  for (const title of titles) {
    if (ctx.timeLeft() < DEADLINE_MARGIN_MS) {
      errors.push(`délai atteint avant « ${title} » : relancer pour la suite`)
      break
    }
    try {
      const page = await wiki.page('en', title)
      if (!page) continue
      const reading = readPage('en', page)
      counters.scanned += reading.raw
      countDrops(counters, reading.dropped)
      const before = sieve.duplicates
      const cards = cardsOf(sieve.sift(reading.hooks), stored, counters)
      counters.duplicates += sieve.duplicates - before
      months += 1
      found += cards.length
      pending.push(...cards)
      ctx.log(`anecdotes : ${title.slice(EN_ARCHIVE.length + 1)} : ${reading.raw} lues, ${cards.length} cartes`)
    } catch (error) {
      errors.push(`« ${title} » : ${message(error)}`)
    }
    await flush(false)
  }
  await flush(true)

  const entered = ctx.dryRun ? found : counters.inserted
  const note = `${plural(entered, 'anecdote anglaise rattrapée', 'anecdotes anglaises rattrapées')}${ctx.dryRun ? ' à entrer' : ''} sur ${plural(months, 'mois lu', 'mois lus')} (${plural(months ? Math.round(found / months) : 0, 'carte', 'cartes')} par mois) · ${counters.duplicates} déjà là`
  ctx.log(`anecdotes : ${note}`)
  return { counters, errors, cursor: { note, byLang: { en: entered } } satisfies AnecdotesCursor }
}
