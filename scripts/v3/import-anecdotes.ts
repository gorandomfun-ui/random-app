/**
 * Wikipedia's "Did you know" anecdotes as fact cards, in place of the Wikidata facts the owner had removed on
 * 20 October ("Pays — capitale : Ville.", "on les enlève complètement"). Written by people to surprise:
 * French "Le saviez-vous ?", English "Did you know", German "Schon gewusst?", Spanish "¿Sabías que…?";
 * Japanese has nothing of the kind.
 *
 * The anecdotes come from the fetcher's JSON (docs/reports/anecdotes/full-<lang>.json, made by
 * dyk-anecdotes.mts beside it: Wikipedia's archive pages read through its API, the hooks turned into
 * sentences, the article each one is about). Each card credits Wikipedia, links its article and names its
 * licence (CC BY-SA 4.0, adapted): the line under the card shows them.
 *
 * The anecdotes about deaths, wars and politics are tagged, and one in three of them is kept: limited, never
 * excluded (the owner's rule for politics). Writes in batches; a second run updates instead of doubling.
 *
 *   node --env-file=.env.local --import tsx scripts/v3/import-anecdotes.ts --dir=docs/reports/anecdotes --dry
 *   node --env-file=.env.local --import tsx scripts/v3/import-anecdotes.ts --dir=docs/reports/anecdotes
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { AnyBulkWriteOperation, Document } from 'mongodb'

import { getDb } from '@/lib/db'
import { createFactDocument } from '@/lib/random/facts'

type Anecdote = {
  id: string
  lang: 'fr' | 'en' | 'de' | 'es'
  text: string
  article: { title: string; url: string }
  date: string | null
  year: number | null
  source: { name: string; page: string; pageUrl: string }
  form: 'statement' | 'question'
  sensitive: boolean
}

const LANGS = ['fr', 'en', 'de', 'es'] as const
const SOURCE_NAME: Record<(typeof LANGS)[number], string> = { fr: 'Wikipédia', en: 'Wikipedia', de: 'Wikipedia', es: 'Wikipedia' }
/** The word for "adapted", shown after the licence: the hooks were turned into sentences. */
const ADAPTED: Record<(typeof LANGS)[number], string> = { fr: 'adapté', en: 'adapted', de: 'bearbeitet', es: 'adaptado' }
/** One sensitive anecdote in this many is kept. */
const SENSITIVE_KEEP_ONE_IN = 3
const BATCH = 500

const arg = (name: string) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3)
const DIR = arg('dir') ?? 'docs/reports/anecdotes'
const DRY = process.argv.includes('--dry')
const ONLY = (arg('langs') ?? LANGS.join(',')).split(',').filter((lang): lang is (typeof LANGS)[number] => (LANGS as readonly string[]).includes(lang))

const sha1 = (value: string) => createHash('sha1').update(value).digest('hex')
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** The card a stored anecdote becomes, or null when it is one of the sensitive ones set aside. */
export function anecdoteCard(anecdote: Anecdote): Document | null {
  const hash = sha1(`fact:${anecdote.text.toLowerCase()}`)
  if (anecdote.sensitive && Number.parseInt(hash.slice(0, 6), 16) % SENSITIVE_KEEP_ONE_IN !== 0) return null
  const base = createFactDocument({ text: anecdote.text, provider: 'wikipedia', source: { name: SOURCE_NAME[anecdote.lang], url: anecdote.article.url } })
  if (!base) return null
  return {
    ...base,
    lang: anecdote.lang,
    languageScope: 'localized',
    hash,
    sourceKey: `wikipedia-dyk:${anecdote.id}`,
    externalId: `wikipedia-dyk:${anecdote.id}`,
    license: { name: 'CC BY-SA 4.0', url: `https://creativecommons.org/licenses/by-sa/4.0/deed.${anecdote.lang}`, note: ADAPTED[anecdote.lang] },
    sensitive: anecdote.sensitive,
    dyk: { article: anecdote.article.title, page: anecdote.source.page, pageUrl: anecdote.source.pageUrl, year: anecdote.year, date: anecdote.date, form: anecdote.form },
  }
}

async function main() {
  const db = DRY ? null : await getDb()
  const items = db?.collection('items')
  let written = 0
  for (const lang of ONLY) {
    const anecdotes = JSON.parse(readFileSync(join(DIR, `full-${lang}.json`), 'utf8')) as Anecdote[]
    const cards = anecdotes.map(anecdoteCard).filter((card): card is Document => card !== null)
    const sensitive = cards.filter((card) => card.sensitive).length
    console.log(`${lang} : ${anecdotes.length} anecdotes, ${cards.length} cartes (dont ${sensitive} sensibles gardées, une sur ${SENSITIVE_KEEP_ONE_IN})`)
    if (DRY) {
      for (const card of cards.slice(0, 3)) console.log(`   « ${card.text} » → ${card.source.url}`)
      continue
    }
    const now = new Date()
    for (let start = 0; start < cards.length; start += BATCH) {
      const operations: AnyBulkWriteOperation[] = cards.slice(start, start + BATCH).map((card) => ({
        updateOne: { filter: { type: 'fact', sourceKey: card.sourceKey }, update: { $set: { ...card, updatedAt: now }, $setOnInsert: { createdAt: now, rand: Math.random() } }, upsert: true },
      }))
      const result = await items!.bulkWrite(operations, { ordered: false })
      written += (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0)
      await wait(500)
    }
  }
  if (!DRY) console.log(`écrites : ${written}`)
  process.exit(0)
}

main().catch((error) => { console.error(String(error).replace(/mongodb(\+srv)?:\/\/\S+/g, '[uri]').slice(0, 400)); process.exit(1) })
