/**
 * Tries the tagger on a random sample of the real catalogue.
 *
 * Reads only — nothing is written. Its job is to answer one question before
 * the full pass runs: how much of the catalogue does the free alias tagging
 * actually cover, and does what it produces look right?
 *
 *   node --env-file=.env.local --import tsx scripts/v3/tag-sample.ts --size=3000
 */

import { MongoClient, type Db } from 'mongodb'

import { buildSubjectIndex, type SubjectRow } from '@/lib/v3/tagging/subjectIndex'
import { tagItem, type TaggableItem } from '@/lib/v3/tagging/tagItem'
import { SUBJECTS_COLLECTION } from '@/lib/v3/subjects/build'
import type { ItemTags, ItemType } from '@/lib/v3/types'
import { count, percent, table } from './reportFormat'

type ItemRow = TaggableItem & { _id: unknown; title?: string | null }

function numericFlag(name: string, fallback: number): number {
  const raw = process.argv.find((argument) => argument.startsWith(`--${name}=`))
  if (!raw) return fallback
  const value = Number(raw.split('=')[1])
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

async function loadIndex(db: Db) {
  const rows = (await db.collection(SUBJECTS_COLLECTION).find({}).toArray()) as unknown as SubjectRow[]
  const index = buildSubjectIndex(rows)
  console.log(`Dictionnaire : ${count(rows.length)} sujets, ${count(index.aliasCount)} alias`)
  console.log(`  indexés par premier mot : ${count(index.byFirstWord.size)} entrées`)
  console.log(`  écritures sans espaces  : ${count(index.unspaced.length)}\n`)
  return index
}

function tally<T extends string>(values: T[]): Array<[T, number]> {
  const counts = new Map<T, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts].sort((left, right) => right[1] - left[1])
}

function report(tagged: Array<{ item: ItemRow; tags: ItemTags }>): void {
  const total = tagged.length
  const usable = tagged.filter((entry) => entry.tags.usable)
  const withSubject = tagged.filter((entry) => entry.tags.subjects.length > 0)
  const withUniverse = tagged.filter((entry) => entry.tags.universe !== 'other')
  const withChannel = tagged.filter((entry) => entry.tags.channelKey)

  console.log('=== COUVERTURE ===\n')
  console.log(
    table(
      ['Mesure', 'Nombre', 'Part'],
      [
        ['Contenus examinés', count(total), '100 %'],
        ['Exploitables (titre correct)', count(usable.length), percent(usable.length, total)],
        ['**Avec au moins un sujet**', `**${count(withSubject.length)}**`, `**${percent(withSubject.length, total)}**`],
        ['Avec un univers autre que « other »', count(withUniverse.length), percent(withUniverse.length, total)],
        ['Avec une clé d_auteur fiable', count(withChannel.length), percent(withChannel.length, total)],
      ],
    ),
  )

  const byType = new Map<ItemType, { total: number; tagged: number }>()
  for (const entry of tagged) {
    const bucket = byType.get(entry.item.type) ?? { total: 0, tagged: 0 }
    bucket.total += 1
    if (entry.tags.subjects.length) bucket.tagged += 1
    byType.set(entry.item.type, bucket)
  }

  console.log('\n=== COUVERTURE PAR TYPE ===\n')
  console.log(
    table(
      ['Type', 'Examinés', 'Avec sujet', 'Part'],
      [...byType].sort((a, b) => b[1].total - a[1].total).map(([type, bucket]) => [
        type,
        count(bucket.total),
        count(bucket.tagged),
        percent(bucket.tagged, bucket.total),
      ]),
    ),
  )

  console.log('\n=== ANGLES DÉTECTÉS ===\n')
  console.log(
    table(
      ['Angle', 'Nombre', 'Part'],
      tally(tagged.map((entry) => entry.tags.angle)).slice(0, 12).map(([angle, n]) => [angle, count(n), percent(n, total)]),
    ),
  )

  console.log('\n=== POPULARITÉ ET ÉPOQUE ===\n')
  console.log(
    table(
      ['Popularité', 'Part', 'Époque', 'Part'],
      (() => {
        const pop = tally(tagged.map((entry) => entry.tags.popularity))
        const era = tally(tagged.map((entry) => entry.tags.era))
        const rows: Array<Array<string | number>> = []
        for (let index = 0; index < Math.max(pop.length, era.length); index += 1) {
          rows.push([
            pop[index]?.[0] ?? '',
            pop[index] ? percent(pop[index][1], total) : '',
            era[index]?.[0] ?? '',
            era[index] ? percent(era[index][1], total) : '',
          ])
        }
        return rows
      })(),
    ),
  )
}

function showExamples(tagged: Array<{ item: ItemRow; tags: ItemTags }>, wanted: number): void {
  const withSubject = tagged.filter((entry) => entry.tags.subjects.length > 0)
  console.log(`\n=== ${wanted} CONTENUS ÉTIQUETÉS, TIRÉS AU HASARD ===\n`)
  for (const entry of withSubject.slice(0, wanted)) {
    const title = (entry.item.title ?? '').slice(0, 78)
    const subjects = entry.tags.subjects.map((subject) => subject.id).join(', ')
    console.log(`• ${title}`)
    console.log(`  sujets : ${subjects}`)
    console.log(`  ${entry.tags.universe} · ${entry.tags.angle} · ${entry.tags.popularity} · ${entry.tags.era}\n`)
  }

  const without = tagged.filter((entry) => entry.tags.usable && entry.tags.subjects.length === 0)
  console.log(`\n=== 12 CONTENUS QUE LE DICTIONNAIRE N_A PAS RECONNUS ===\n`)
  for (const entry of without.slice(0, 12)) {
    console.log(`• ${(entry.item.title ?? '').slice(0, 78)}   [${entry.item.type}]`)
  }
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI
  if (!uri) throw new Error('MONGODB_URI manquant')
  const dbName = process.env.MONGODB_DB || process.env.MONGO_DB || 'randomdb'
  const size = numericFlag('size', 2000)

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 20000 })
  await client.connect()

  try {
    const db = client.db(dbName)
    const index = await loadIndex(db)

    console.log(`Tirage de ${count(size)} contenus au hasard…\n`)
    const items = (await db
      .collection('items')
      .aggregate([{ $sample: { size } }], { allowDiskUse: true })
      .toArray()) as unknown as ItemRow[]

    const started = Date.now()
    const tagged = items.map((item) => ({ item, tags: tagItem(item, index) }))
    const elapsed = Date.now() - started

    report(tagged)
    console.log(
      `\nÉtiquetage de ${count(items.length)} contenus en ${elapsed} ms ` +
        `(~${count(Math.round((items.length / elapsed) * 1000))} par seconde).`,
    )
    console.log(
      `Extrapolation sur 1 665 257 contenus : ~${Math.round((1_665_257 / (items.length / elapsed)) / 1000 / 60)} minutes de calcul.`,
    )

    showExamples(tagged, 20)
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
