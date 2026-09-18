/**
 * Looks at what the tagger did NOT recognise, so the next themes are written
 * from the catalogue rather than invented.
 *
 *   node --env-file=.env.local --import tsx scripts/v3/analyse-untagged.ts --size=12000
 */

import { MongoClient } from 'mongodb'

import { buildSubjectIndex, type SubjectRow } from '@/lib/v3/tagging/subjectIndex'
import { tagItem, type TaggableItem } from '@/lib/v3/tagging/tagItem'
import { normalize } from '@/lib/v3/tagging/normalize'
import { SUBJECTS_COLLECTION } from '@/lib/v3/subjects/build'
import { count } from './reportFormat'

const STOPWORDS = new Set(
  ('the a an and or of in on at to for with from by is are was were be been this that it its his her ' +
    'their our your my de la le les des du et un une pour dans sur avec par est sont au aux ce ces qui ' +
    'que il elle nous vous ils der die das und ist von mit den dem el los las y en con por para se lo ' +
    'del al no si ya mas como todo esta este you your what how why when who all new best top full video')
    .split(' '),
)

function numericFlag(name: string, fallback: number): number {
  const raw = process.argv.find((argument) => argument.startsWith(`--${name}=`))
  if (!raw) return fallback
  const value = Number(raw.split('=')[1])
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI
  if (!uri) throw new Error('MONGODB_URI manquant')
  const dbName = process.env.MONGODB_DB || process.env.MONGO_DB || 'randomdb'
  const size = numericFlag('size', 12000)

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 20000 })
  await client.connect()

  try {
    const db = client.db(dbName)
    const rows = (await db.collection(SUBJECTS_COLLECTION).find({}).toArray()) as unknown as SubjectRow[]
    const index = buildSubjectIndex(rows)

    const items = (await db
      .collection('items')
      .aggregate([{ $sample: { size } }], { allowDiskUse: true })
      .toArray()) as unknown as Array<TaggableItem & { title?: string | null }>

    const words = new Map<string, number>()
    const pairs = new Map<string, number>()
    let untagged = 0

    for (const item of items) {
      const tags = tagItem(item, index)
      if (tags.subjects.length || !tags.usable) continue
      untagged += 1

      const tokens = normalize(item.title ?? '')
        .split(' ')
        .filter((token) => token.length >= 4 && !STOPWORDS.has(token) && !/^\d+$/.test(token))

      for (const token of new Set(tokens)) words.set(token, (words.get(token) ?? 0) + 1)
      for (let index2 = 0; index2 < tokens.length - 1; index2 += 1) {
        const pair = `${tokens[index2]} ${tokens[index2 + 1]}`
        pairs.set(pair, (pairs.get(pair) ?? 0) + 1)
      }
    }

    console.log(`Contenus examinés : ${count(items.length)} · non reconnus : ${count(untagged)}\n`)

    const top = (map: Map<string, number>, limit: number) =>
      [...map].sort((left, right) => right[1] - left[1]).slice(0, limit)

    console.log('=== MOTS les plus fréquents dans les titres non reconnus ===')
    console.log(top(words, 60).map(([word, n]) => `${word}(${n})`).join('  '))

    console.log('\n=== EXPRESSIONS de deux mots ===')
    console.log(top(pairs, 40).map(([pair, n]) => `${pair}(${n})`).join('  |  '))
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
