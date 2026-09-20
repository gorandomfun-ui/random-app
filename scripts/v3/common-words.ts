/**
 * Writes the words too common to link anything, read from the catalogue.
 *
 *   node --env-file=.env.local --import tsx scripts/v3/common-words.ts
 *
 * The Wave links contents by the words they share. A word that a third of the
 * catalogue carries — "man", "red", "close" — links everything to everything,
 * so it links nothing. This measures which words those are rather than guessing.
 */

import { MongoClient } from 'mongodb'
import { writeFileSync } from 'node:fs'

const SAMPLE = 40_000
/** A word carried by more than this share of contents says nothing about them. */
const TOO_COMMON = 0.004
const OUT = 'lib/v3/wave/commonWords.json'

async function main(): Promise<void> {
  const client = new MongoClient(process.env.MONGODB_URI as string)
  await client.connect()
  const items = client.db(process.env.MONGODB_DB || 'randomdb').collection('items')

  const rows = await items.aggregate<{ _id: string; n: number }>([
    { $sample: { size: SAMPLE } },
    { $project: { words: { $concatArrays: [{ $ifNull: ['$keywords', []] }, { $ifNull: ['$tags', []] }] } } },
    { $unwind: '$words' },
    { $project: { word: { $toLower: { $trim: { input: '$words' } } } } },
    { $group: { _id: '$word', n: { $sum: 1 } } },
    { $match: { n: { $gte: Math.ceil(SAMPLE * TOO_COMMON) } } },
    { $sort: { n: -1 } },
  ], { maxTimeMS: 600_000, allowDiskUse: true }).toArray()

  const words = rows.map((row) => row._id).filter((word) => word.length >= 2)
  writeFileSync(OUT, JSON.stringify(words, null, 0) + '\n')
  console.log(`${words.length} mots trop courants écrits dans ${OUT}`)
  console.log('les 40 premiers :', words.slice(0, 40).join(', '))
  console.log('les 20 derniers :', words.slice(-20).join(', '))
  await client.close()
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
