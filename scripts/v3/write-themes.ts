/** Writes only the hand-written themes into subjects_v3, without touching Wikipedia. */
import { MongoClient } from 'mongodb'
import { buildThemeSubjects, writeSubjects } from '@/lib/v3/subjects/build'
import { duplicateThemeSlugs } from '@/lib/v3/subjects/themes'

async function main(): Promise<void> {
  const duplicates = duplicateThemeSlugs()
  if (duplicates.length) throw new Error(`Thèmes en double : ${duplicates.join(', ')}`)

  const client = new MongoClient(process.env.MONGODB_URI as string, { serverSelectionTimeoutMS: 20000 })
  await client.connect()
  try {
    const themes = buildThemeSubjects()
    const result = await writeSubjects(client.db(process.env.MONGODB_DB || 'randomdb'), themes)
    console.log(`Thèmes : ${themes.length} · créés ${result.inserted} · mis à jour ${result.updated}`)
  } finally {
    await client.close()
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
