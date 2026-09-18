/**
 * Writes the v3 labels onto the catalogue.
 *
 *   node --env-file=.env.local --import tsx scripts/v3/tag-all.ts --apply
 *
 * Resumable: a checkpoint is saved after every batch. Stopping it at any
 * moment loses nothing — the next run continues from there.
 *
 * Stock images (Tenor, Pexels, Pixabay) are skipped by decision 1B: their
 * titles are machine descriptions with no subject to find, so spending an
 * hour of writes on them would buy nothing.
 */

import { MongoClient, type Db, type ObjectId } from 'mongodb'

import { buildSubjectIndex, type SubjectRow } from '@/lib/v3/tagging/subjectIndex'
import { tagItem, type TaggableItem } from '@/lib/v3/tagging/tagItem'
import { nearFamilyKey, formatFamilyKey } from '@/lib/v3/families'
import { SUBJECTS_COLLECTION } from '@/lib/v3/subjects/build'
import { count } from './reportFormat'

const CHECKPOINT_COLLECTION = 'v3_repair_checkpoints'
const CHECKPOINT_ID = 'tag-all'
const BATCH = 500

/** Decision 1B: stock imagery is kept but not tagged. */
const SKIPPED_PROVIDERS = ['tenor', 'pexels', 'pixabay']

type Row = TaggableItem & { _id: ObjectId; title?: string | null; lang?: string | null }

const flag = (name: string) => process.argv.includes(`--${name}`)

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI
  if (!uri) throw new Error('MONGODB_URI manquant')
  const dbName = process.env.MONGODB_DB || process.env.MONGO_DB || 'randomdb'
  const apply = flag('apply')

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 20000 })
  await client.connect()

  try {
    const db: Db = client.db(dbName)
    const items = db.collection('items')

    const subjects = (await db.collection(SUBJECTS_COLLECTION).find({}).toArray()) as unknown as SubjectRow[]
    const index = buildSubjectIndex(subjects)
    console.log(`Dictionnaire : ${count(subjects.length)} sujets, ${count(index.aliasCount)} alias`)
    console.log(apply ? 'Mode : ÉCRITURE\n' : 'Mode : rapport à blanc\n')

    const scope = { provider: { $nin: SKIPPED_PROVIDERS } }
    const total = await items.countDocuments(scope)
    console.log(`À étiqueter : ${count(total)} contenus (images de stock exclues)\n`)

    const checkpoint = await db.collection(CHECKPOINT_COLLECTION).findOne({ _id: CHECKPOINT_ID as never })
    let afterId = flag('restart') ? null : ((checkpoint as { lastId?: ObjectId } | null)?.lastId ?? null)
    if (afterId) console.log(`Reprise après ${String(afterId)}\n`)

    let done = 0
    let withSubject = 0
    const started = Date.now()

    for (;;) {
      const rows = (await items
        .find({ ...scope, ...(afterId ? { _id: { $gt: afterId } } : {}) }, { sort: { _id: 1 }, limit: BATCH })
        .toArray()) as unknown as Row[]
      if (!rows.length) break

      const operations = rows.map((row) => {
        const tags = tagItem(row, index)
        if (tags.subjects.length) withSubject += 1
        const labels = tags.subjects
          .map((subject) => index.subjects.get(subject.id)?.label)
          .filter((label): label is string => Boolean(label))
        return {
          updateOne: {
            filter: { _id: row._id },
            update: {
              $set: {
                v3: {
                  ...tags,
                  nearFamily: nearFamilyKey(row.title ?? '', labels),
                  formatFamily: formatFamilyKey({
                    primarySubjectId: tags.subjects[0]?.id,
                    universe: tags.universe,
                    angle: tags.angle,
                    lang: row.lang,
                  }),
                },
              },
            },
          },
        }
      })

      if (apply) {
        await items.bulkWrite(operations, { ordered: false })
        afterId = rows[rows.length - 1]._id
        await db
          .collection(CHECKPOINT_COLLECTION)
          .updateOne({ _id: CHECKPOINT_ID as never }, { $set: { lastId: afterId, updatedAt: new Date() } }, { upsert: true })
      } else {
        afterId = rows[rows.length - 1]._id
      }

      done += rows.length
      if (done % 10000 === 0) {
        const perMinute = Math.round((done / (Date.now() - started)) * 60000)
        const share = ((withSubject / done) * 100).toFixed(1)
        console.log(`  ${count(done)} / ${count(total)} · ${share} % avec sujet · ~${count(perMinute)}/min`)
      }
      if (!apply && done >= 5000) break
    }

    console.log(`\nÉtiquetés : ${count(done)} · avec au moins un sujet : ${count(withSubject)} (${((withSubject / done) * 100).toFixed(1)} %)`)
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
