/**
 * Creates the v3 indexes.
 *
 * Without --apply it only reports what it would do, and writes nothing.
 *   node --env-file=.env.local --import tsx scripts/v3/install-indexes.ts
 *   node --env-file=.env.local --import tsx scripts/v3/install-indexes.ts --apply
 */

import { MongoClient } from 'mongodb'

import { installIndexes, planIndexes } from '@/lib/v3/indexes'

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI
  if (!uri) throw new Error('MONGODB_URI manquant')
  const dbName = process.env.MONGODB_DB || process.env.MONGO_DB || 'randomdb'
  const apply = process.argv.includes('--apply')

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 20000 })
  await client.connect()

  try {
    const db = client.db(dbName)
    const plan = await planIndexes(db)

    console.log(`Base : ${dbName}`)
    console.log(apply ? 'Mode : CRÉATION\n' : 'Mode : rapport à blanc, aucune écriture\n')

    for (const index of plan) {
      const mark = index.alreadyPresent ? 'déjà présent' : 'à créer'
      console.log(`  [${mark}] ${index.collection}.${index.name}`)
      console.log(`      clé    : ${index.key}`)
      console.log(`      raison : ${index.purpose}`)
    }

    const missing = plan.filter((index) => !index.alreadyPresent)
    console.log(`\n${missing.length} index à créer, ${plan.length - missing.length} déjà en place.`)

    if (!apply) {
      console.log('\nRelancer avec --apply pour créer.')
      return
    }

    const result = await installIndexes(db)
    console.log(`\nCréés  : ${result.created.join(', ') || 'aucun'}`)
    console.log(`Ignorés: ${result.skipped.join(', ') || 'aucun'}`)
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
