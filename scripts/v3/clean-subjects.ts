/**
 * Removes the subjects that turned out to be noise rather than subjects.
 *
 * Reports by default; needs --apply to delete.
 *   node --env-file=.env.local --import tsx scripts/v3/clean-subjects.ts
 *
 * Trying the tagger on the real catalogue showed two families of bad entries:
 * generic notions Wikipedia happens to have an article for ("Video recording",
 * "Design", "Game"), and pure numbers or dates ("2019", "April 23"). Both
 * match constantly and link unrelated things together.
 */

import { MongoClient, type Filter, type Document } from 'mongodb'

import { SUBJECTS_COLLECTION } from '@/lib/v3/subjects/build'
import { count } from './reportFormat'

// A rule removing every entity Wikidata did not give a recognised type to was
// written and then dropped: the dry run showed it would also delete Santa
// Claus and Björn Ironside. Matching those was a problem of short aliases, not
// of the subjects existing, and that is fixed in the index instead.

/**
 * Labels that are only a number or a calendar date.
 *
 * Deliberately narrow: a first attempt matched "<word> <digit>" and would have
 * deleted Deadpool 2, Race 3 and Baaghi 2, which are films. Only bare numbers
 * and real month names qualify.
 */
const MONTHS =
  'january|february|march|april|may|june|july|august|september|october|november|december'
const NUMERIC_LABEL: Filter<Document> = {
  kind: 'entity',
  label: {
    $regex: new RegExp(
      `^(?:\\d+(?:\\s*(?:ad|ce|bc))?|(?:${MONTHS})\\s+\\d{1,2}|\\d{1,2}\\s+(?:${MONTHS}))$`,
      'i',
    ),
  },
}

const RULES: Array<{ name: string; reason: string; filter: Filter<Document> }> = [
  {
    name: 'nombres et dates',
    reason: '"2019", "19", "April 23" ne sont pas des sujets',
    filter: NUMERIC_LABEL,
  },
]

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI
  if (!uri) throw new Error('MONGODB_URI manquant')
  const dbName = process.env.MONGODB_DB || process.env.MONGO_DB || 'randomdb'
  const apply = process.argv.includes('--apply')

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 20000 })
  await client.connect()

  try {
    const subjects = client.db(dbName).collection(SUBJECTS_COLLECTION)
    const before = await subjects.estimatedDocumentCount()
    console.log(apply ? 'Mode : SUPPRESSION\n' : 'Mode : rapport à blanc, rien n_est supprimé\n')
    console.log(`Sujets avant : ${count(before)}\n`)

    let removed = 0
    for (const rule of RULES) {
      const matching = await subjects.countDocuments(rule.filter)
      console.log(`${rule.name} — ${count(matching)} sujets`)
      console.log(`  ${rule.reason}`)
      const samples = await subjects.find(rule.filter).limit(8).toArray()
      console.log(`  exemples : ${samples.map((row) => row.label).join(', ')}`)

      if (apply) {
        const result = await subjects.deleteMany(rule.filter)
        removed += result.deletedCount
        console.log(`  → ${count(result.deletedCount)} supprimés`)
      }
      console.log('')
    }

    if (!apply) {
      const total = await subjects.countDocuments({ $or: RULES.map((rule) => rule.filter) })
      console.log(`Au total ${count(total)} sujets seraient supprimés, il en resterait ${count(before - total)}.`)
      console.log('\nRelancer avec --apply pour supprimer.')
      return
    }

    const after = await subjects.estimatedDocumentCount()
    console.log(`Supprimés : ${count(removed)} · restants : ${count(after)}`)
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
