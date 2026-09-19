/**
 * Fills subjects_v3.counts and angleCounts.
 *
 * The Wave button must appear instantly, without querying the catalogue: the
 * draw decides from these counts whether a subject has enough neighbours to
 * build a Wave. Recomputed after every tagging pass.
 *
 *   node --env-file=.env.local --import tsx scripts/v3/count-subjects.ts --apply
 */

import { MongoClient, type AnyBulkWriteOperation, type Document } from 'mongodb'

import { SUBJECTS_COLLECTION } from '@/lib/v3/subjects/build'
import { count } from './reportFormat'

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI
  if (!uri) throw new Error('MONGODB_URI manquant')
  const apply = process.argv.includes('--apply')

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 20000 })
  await client.connect()

  try {
    const db = client.db(process.env.MONGODB_DB || 'randomdb')
    console.log(apply ? 'Mode : ÉCRITURE\n' : 'Mode : rapport à blanc\n')

    console.log('Comptage par sujet et par type…')
    const byType = await db
      .collection('items')
      .aggregate(
        [
          { $match: { 'v3.subjects.0': { $exists: true } } },
          { $unwind: '$v3.subjects' },
          { $group: { _id: { subject: '$v3.subjects.id', type: '$type' }, n: { $sum: 1 } } },
        ],
        { allowDiskUse: true },
      )
      .toArray()

    console.log('Comptage par sujet et par angle…')
    const byAngle = await db
      .collection('items')
      .aggregate(
        [
          { $match: { 'v3.subjects.0': { $exists: true } } },
          { $unwind: '$v3.subjects' },
          { $group: { _id: { subject: '$v3.subjects.id', angle: '$v3.angle' }, n: { $sum: 1 } } },
        ],
        { allowDiskUse: true },
      )
      .toArray()

    const counts = new Map<string, Record<string, number>>()
    const angles = new Map<string, Record<string, number>>()

    for (const row of byType) {
      const key = String(row._id.subject)
      const bucket = counts.get(key) ?? {}
      bucket[String(row._id.type)] = row.n as number
      counts.set(key, bucket)
    }
    for (const row of byAngle) {
      const key = String(row._id.subject)
      const bucket = angles.get(key) ?? {}
      bucket[String(row._id.angle)] = row.n as number
      angles.set(key, bucket)
    }

    const total = (bucket: Record<string, number>) => Object.values(bucket).reduce((sum, n) => sum + n, 0)
    const withContent = [...counts.values()].filter((bucket) => total(bucket) > 0).length
    const waveable = [...counts.values()].filter((bucket) => total(bucket) >= 2).length
    const rich = [...counts.values()].filter((bucket) => Object.keys(bucket).length >= 2).length

    console.log(`\nSujets ayant au moins un contenu : ${count(withContent)}`)
    console.log(`  dont au moins deux contenus (Wave possible) : ${count(waveable)}`)
    console.log(`  dont au moins deux formats différents        : ${count(rich)}`)

    if (!apply) {
      console.log('\nRelancer avec --apply pour écrire.')
      return
    }

    const operations: AnyBulkWriteOperation<Document>[] = []
    for (const [subjectId, bucket] of counts) {
      operations.push({
        updateOne: {
          filter: { _id: subjectId as never },
          update: { $set: { counts: bucket, angleCounts: angles.get(subjectId) ?? {}, countsUpdatedAt: new Date() } },
        },
      })
    }

    for (let index = 0; index < operations.length; index += 1000) {
      await db.collection(SUBJECTS_COLLECTION).bulkWrite(operations.slice(index, index + 1000), { ordered: false })
    }
    console.log(`\n${count(operations.length)} sujets mis à jour.`)
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
