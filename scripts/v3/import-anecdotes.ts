/**
 * Wikipedia's "Did you know" anecdotes as fact cards, in place of the Wikidata facts the owner had removed on
 * 20 October ("Pays — capitale : Ville.", "on les enlève complètement"). Written by people to surprise:
 * French "Le saviez-vous ?", English "Did you know", German "Schon gewusst?", Spanish "¿Sabías que…?";
 * Japanese has nothing of the kind.
 *
 * The anecdotes come from the fetcher's JSON (docs/reports/anecdotes/full-<lang>.json, made by
 * dyk-anecdotes.mts beside it: Wikipedia's archive pages read through its API, the hooks turned into
 * sentences, the article each one is about). Each card credits Wikipedia, links its article and names its
 * licence (CC BY-SA 4.0, adapted): the line under the card shows them (lib/v3/anecdotes/cards.ts, which the
 * weekly line writes its cards with too).
 *
 * The anecdotes about deaths, wars and politics are tagged, and one in three of them is kept: limited, never
 * excluded (the owner's rule for politics). Writes in batches; a second run updates instead of doubling.
 *
 *   node --env-file=.env.local --import tsx scripts/v3/import-anecdotes.ts --dir=docs/reports/anecdotes --dry
 *   node --env-file=.env.local --import tsx scripts/v3/import-anecdotes.ts --dir=docs/reports/anecdotes
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Document } from 'mongodb'

import { getDb } from '@/lib/db'
import { anecdoteCard, cardUpserts, SENSITIVE_KEEP_ONE_IN, type CardSource } from '@/lib/v3/anecdotes/cards'

const LANGS = ['fr', 'en', 'de', 'es'] as const
const BATCH = 500

const arg = (name: string) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3)
const DIR = arg('dir') ?? 'docs/reports/anecdotes'
const DRY = process.argv.includes('--dry')
const ONLY = (arg('langs') ?? LANGS.join(',')).split(',').filter((lang): lang is (typeof LANGS)[number] => (LANGS as readonly string[]).includes(lang))

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function main() {
  const db = DRY ? null : await getDb()
  const items = db?.collection('items')
  let written = 0
  for (const lang of ONLY) {
    const anecdotes = JSON.parse(readFileSync(join(DIR, `full-${lang}.json`), 'utf8')) as CardSource[]
    const cards = anecdotes.map(anecdoteCard).filter((card): card is Document => card !== null)
    const sensitive = cards.filter((card) => card.sensitive).length
    console.log(`${lang} : ${anecdotes.length} anecdotes, ${cards.length} cartes (dont ${sensitive} sensibles gardées, une sur ${SENSITIVE_KEEP_ONE_IN})`)
    if (DRY) {
      for (const card of cards.slice(0, 3)) console.log(`   « ${card.text} » → ${card.source.url}`)
      continue
    }
    const now = new Date()
    for (let start = 0; start < cards.length; start += BATCH) {
      const result = await items!.bulkWrite(cardUpserts(cards.slice(start, start + BATCH), now), { ordered: false })
      written += (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0)
      await wait(500)
    }
  }
  if (!DRY) console.log(`écrites : ${written}`)
  process.exit(0)
}

main().catch((error) => { console.error(String(error).replace(/mongodb(\+srv)?:\/\/\S+/g, '[uri]').slice(0, 400)); process.exit(1) })
