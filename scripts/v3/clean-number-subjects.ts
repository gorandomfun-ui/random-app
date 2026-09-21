/**
 * Removes the subjects that are only numbers or dates, and the letterless
 * aliases of the others.
 *
 *   node --env-file=.env.local --import tsx scripts/v3/clean-number-subjects.ts           # counts only
 *   node --env-file=.env.local --import tsx scripts/v3/clean-number-subjects.ts --apply
 *
 * "March 1" answered to "1/3" and "1-3": every episode part and every score
 * became one subject, and the Wave linked "House on Haunted Hill (1959) 1/3"
 * to a football match. A subject with no letter in its name, or a bare date,
 * is not a subject; an alias with no letter ("007", "0 0") names nothing on
 * its own. The rule is also applied in the tagger, so nothing comes back.
 */

import { MongoClient, type Document } from 'mongodb'

import { SUBJECTS_COLLECTION } from '@/lib/v3/subjects/build'
import { count } from './reportFormat'

const MONTHS =
  'january|february|march|april|may|june|july|august|september|october|november|december|' +
  'janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre'
const DATE_LABEL = new RegExp(`^(?:(?:${MONTHS})\\s+\\d{1,2}|\\d{1,2}\\s+(?:${MONTHS}))$`, 'i')
const NO_LETTER = /^[^\p{L}]*$/u

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI
  if (!uri) throw new Error('MONGODB_URI manquant')
  const apply = process.argv.includes('--apply')
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 20000 })
  await client.connect()
  try {
    const db = client.db(process.env.MONGODB_DB || process.env.MONGO_DB || 'randomdb')
    const subjects = db.collection(SUBJECTS_COLLECTION)
    const items = db.collection('items')
    console.log(apply ? 'Mode : ÉCRITURE\n' : 'Mode : rapport à blanc, aucune écriture\n')

    const all = await subjects.find({}, { projection: { label: 1, aliases: 1 }, maxTimeMS: 120_000 }).toArray()
    const junk = all.filter((s) => NO_LETTER.test(String(s.label ?? '')) || DATE_LABEL.test(String(s.label ?? '')))
    const junkIds = junk.map((s) => String(s._id))
    const withBadAlias = all.filter((s) => !junkIds.includes(String(s._id)) && (s.aliases as string[] | undefined)?.some((a) => NO_LETTER.test(a)))
    console.log(`Sujets qui ne sont qu_un nombre ou une date : ${count(junk.length)} — ex. ${junk.slice(0, 8).map((s) => s.label).join(', ')}`)
    console.log(`Sujets légitimes avec un alias sans lettre : ${count(withBadAlias.length)} — ex. ${withBadAlias.slice(0, 5).map((s) => `${s.label} (${(s.aliases as string[]).filter((a) => NO_LETTER.test(a)).slice(0, 2).join(', ')})`).join(' · ')}`)

    const carrying = await items.countDocuments({ 'v3.subjects.id': { $in: junkIds } }, { hint: 'v3_subject_type_rand', maxTimeMS: 300_000 })
    console.log(`Contenus portant un de ces sujets : ${count(carrying)}`)
    if (!apply) { console.log('\nRelancer avec --apply pour nettoyer.'); return }

    const started = Date.now()
    const pulled = await items.updateMany(
      { 'v3.subjects.id': { $in: junkIds } },
      { $pull: { 'v3.subjects': { id: { $in: junkIds } } } } as Document,
    )
    console.log(`Références retirées des contenus : ${count(pulled.modifiedCount)} en ${Math.round((Date.now() - started) / 1000)} s`)
    const aliases = await subjects.updateMany(
      { _id: { $in: withBadAlias.map((s) => s._id) } },
      { $pull: { aliases: { $regex: '^[^\\p{L}]*$', $options: 'u' } } } as Document,
    )
    console.log(`Alias sans lettre retirés : sur ${count(aliases.modifiedCount)} sujets`)
    const deleted = await subjects.deleteMany({ _id: { $in: junk.map((s) => s._id) } })
    console.log(`Sujets supprimés du dictionnaire : ${count(deleted.deletedCount)}`)
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
