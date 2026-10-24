/**
 * The card an anecdote becomes: a fact card crediting Wikipedia, linking its article and naming its licence (CC BY-SA
 * 4.0, adapted: the hooks were turned into sentences) — the line under the card shows them. Its `sourceKey` is the
 * anecdote's id, the hash of its words: the same hook read twice is the same card.
 *
 * The anecdotes about deaths, wars and politics are tagged, and one in three of them is kept: limited, never excluded
 * (the owner's rule for politics). The card's own hash picks the third, so a second reading keeps the same ones.
 *
 * Written by the import of 20 October (scripts/v3/import-anecdotes.ts) and by the weekly line (lib/v3/ingest/lines/anecdotes.ts).
 */

import { createHash } from 'node:crypto'

import type { AnyBulkWriteOperation, Document } from 'mongodb'

import { createFactDocument } from '@/lib/random/facts'
import type { Anecdote, AnecdoteLang } from './parse'

const SOURCE_NAME: Record<AnecdoteLang, string> = { fr: 'Wikipédia', en: 'Wikipedia', de: 'Wikipedia', es: 'Wikipedia' }
/** The word for "adapted", shown after the licence: the hooks were turned into sentences. */
const ADAPTED: Record<AnecdoteLang, string> = { fr: 'adapté', en: 'adapted', de: 'bearbeitet', es: 'adaptado' }
/** One sensitive anecdote in this many is kept. */
export const SENSITIVE_KEEP_ONE_IN = 3

/** What a card is made of: the anecdote as the fetcher's files keep it. */
export type CardSource = Pick<Anecdote, 'id' | 'lang' | 'text' | 'article' | 'date' | 'year' | 'form' | 'sensitive'> & {
  source: Pick<Anecdote['source'], 'page' | 'pageUrl'>
}

const sha1 = (value: string) => createHash('sha1').update(value).digest('hex')

/** The card's key: the anecdote's id (lib/v3/anecdotes/parse.ts, `anecdoteId`). */
export const sourceKeyOf = (anecdoteId: string) => `wikipedia-dyk:${anecdoteId}`

/** The card a stored anecdote becomes, or null when it is one of the sensitive ones set aside. */
export function anecdoteCard(anecdote: CardSource): Document | null {
  const hash = sha1(`fact:${anecdote.text.toLowerCase()}`)
  if (anecdote.sensitive && Number.parseInt(hash.slice(0, 6), 16) % SENSITIVE_KEEP_ONE_IN !== 0) return null
  const base = createFactDocument({ text: anecdote.text, provider: 'wikipedia', source: { name: SOURCE_NAME[anecdote.lang], url: anecdote.article.url } })
  if (!base) return null
  return {
    ...base,
    lang: anecdote.lang,
    languageScope: 'localized',
    hash,
    sourceKey: sourceKeyOf(anecdote.id),
    externalId: sourceKeyOf(anecdote.id),
    license: { name: 'CC BY-SA 4.0', url: `https://creativecommons.org/licenses/by-sa/4.0/deed.${anecdote.lang}`, note: ADAPTED[anecdote.lang] },
    sensitive: anecdote.sensitive,
    dyk: { article: anecdote.article.title, page: anecdote.source.page, pageUrl: anecdote.source.pageUrl, year: anecdote.year, date: anecdote.date, form: anecdote.form },
  }
}

/** The import's writes: one upsert per card on its source key, so a second run updates instead of doubling. */
export function cardUpserts(cards: Document[], now: Date): AnyBulkWriteOperation[] {
  return cards.map((card) => ({
    updateOne: { filter: { type: 'fact', sourceKey: card.sourceKey }, update: { $set: { ...card, updatedAt: now }, $setOnInsert: { createdAt: now, rand: Math.random() } }, upsert: true },
  }))
}

/**
 * The line's writes: the cards it found new, as the import's upserts would have created them. Inserted, not upserted:
 * no index holds `sourceKey`, so each upsert would read every fact to find its own; the line asked first, once.
 */
export function cardInserts(cards: Document[], now: Date): AnyBulkWriteOperation[] {
  return cards.map((card) => ({ insertOne: { document: { ...card, updatedAt: now, createdAt: now, rand: Math.random() } } }))
}
