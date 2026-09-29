/**
 * The people of a country into the dig's queue, from Wikidata. Run from the
 * owner's computer: the queries are heavy for the small server, and a
 * country is added once.
 *
 *   node --env-file=.env.local --import tsx scripts/v3/dig-people.ts --country=FR
 *   node --env-file=.env.local --import tsx scripts/v3/dig-people.ts --country=US --per=150
 *   node --env-file=.env.local --import tsx scripts/v3/dig-people.ts --country=GH --dry
 *
 * `--per` is how many of each occupation, the most known first (120 by default).
 */

import { MongoClient } from 'mongodb'

import { COUNTRIES, fetchPeople, OCCUPATIONS, personSubject, withAliases, type WikidataPerson } from '@/lib/v3/dig/people'
import { enqueue, installQueueIndexes, type NewSubject } from '@/lib/v3/dig/queue'

const flag = (name: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1]
const country = (flag('country') ?? 'FR').toUpperCase()
const per = Number(flag('per') ?? 120)
const dry = process.argv.includes('--dry')
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function main(): Promise<void> {
  if (!COUNTRIES[country]) throw new Error(`pays inconnu : ${country} (connus : ${Object.keys(COUNTRIES).join(', ')})`)
  const people = new Map<string, WikidataPerson>()
  for (const occupation of OCCUPATIONS) {
    try {
      const found = await fetchPeople(country, occupation, per)
      // The same person under two occupations keeps the first reading.
      for (const person of found) if (!people.has(person.qid)) people.set(person.qid, person)
      console.log(`${occupation.label.padEnd(28)} ${String(found.length).padStart(4)}`)
    } catch (error) {
      console.log(`${occupation.label.padEnd(28)} erreur : ${error instanceof Error ? error.message : String(error)}`)
    }
    await wait(1500)
  }
  console.log(`alias de ${people.size} personnes…`)
  const withNames = await withAliases([...people.values()])
  const found = new Map<string, NewSubject>()
  for (const person of withNames) {
    const subject = personSubject(person, country)
    if (!found.has(subject._id)) found.set(subject._id, subject)
  }
  const subjects = [...found.values()]
  const byFame = { star: 0, known: 0, small: 0 }
  for (const subject of subjects) byFame[subject.fame] += 1
  console.log(`${COUNTRIES[country].label} : ${subjects.length} personnes (${byFame.star} très connues, ${byFame.known} connues, ${byFame.small} petites)`)
  console.log('exemples :', subjects.filter((subject) => subject.fame === 'star').slice(0, 12).map((subject) => subject.label).join(', '))
  if (dry) return
  const client = new MongoClient(process.env.MONGODB_URI as string, { serverSelectionTimeoutMS: 20000 })
  await client.connect()
  try {
    const db = client.db(process.env.MONGODB_DB || 'randomdb')
    await installQueueIndexes(db)
    const result = await enqueue(db, subjects)
    console.log(`file : ${result.inserted} nouveaux, ${result.refreshed} rafraîchis`)
  } finally {
    await client.close()
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
