/** Who supplies the items the tagger cannot recognise. Read-only. */
import { MongoClient } from 'mongodb'
import { buildSubjectIndex, type SubjectRow } from '@/lib/v3/tagging/subjectIndex'
import { tagItem, type TaggableItem } from '@/lib/v3/tagging/tagItem'
import { SUBJECTS_COLLECTION } from '@/lib/v3/subjects/build'
import { count, percent, table } from './reportFormat'

async function main(): Promise<void> {
  const client = new MongoClient(process.env.MONGODB_URI as string, { serverSelectionTimeoutMS: 20000 })
  await client.connect()
  try {
    const db = client.db(process.env.MONGODB_DB || 'randomdb')
    const rows = (await db.collection(SUBJECTS_COLLECTION).find({}).toArray()) as unknown as SubjectRow[]
    const index = buildSubjectIndex(rows)
    const items = (await db.collection('items')
      .aggregate([{ $sample: { size: 12000 } }], { allowDiskUse: true })
      .toArray()) as unknown as Array<TaggableItem & { provider?: string | null }>

    const stats = new Map<string, { total: number; tagged: number }>()
    for (const item of items) {
      const provider = item.provider ?? '(inconnu)'
      const bucket = stats.get(provider) ?? { total: 0, tagged: 0 }
      bucket.total += 1
      if (tagItem(item, index).subjects.length) bucket.tagged += 1
      stats.set(provider, bucket)
    }

    console.log(table(
      ['Fournisseur', 'Examinés', 'Reconnus', 'Taux'],
      [...stats].sort((a, b) => b[1].total - a[1].total).slice(0, 12).map(([provider, bucket]) => [
        provider, count(bucket.total), count(bucket.tagged), percent(bucket.tagged, bucket.total),
      ]),
    ))
  } finally {
    await client.close()
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
