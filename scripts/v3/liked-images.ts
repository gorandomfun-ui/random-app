/**
 * Fetches images for the subjects the owner liked.
 *
 *   node --env-file=.env.local --import tsx scripts/v3/liked-images.ts --limit=10
 *   node --env-file=.env.local --import tsx scripts/v3/liked-images.ts --limit=10 --apply
 */

import { MongoClient } from 'mongodb'

import { ingestImagesForLikedSubjects, likedSubjectsMissingImages } from '@/lib/v3/ingest/likedImages'
import { count } from './reportFormat'

function numericFlag(name: string, fallback: number): number {
  const raw = process.argv.find((argument) => argument.startsWith(`--${name}=`))
  if (!raw) return fallback
  const value = Number(raw.split('=')[1])
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply')
  const limit = numericFlag('limit', 20)

  const client = new MongoClient(process.env.MONGODB_URI as string, { serverSelectionTimeoutMS: 20000 })
  await client.connect()

  try {
    const db = client.db(process.env.MONGODB_DB || 'randomdb')
    console.log(apply ? 'Mode : INGESTION\n' : 'Mode : rapport à blanc, aucune écriture\n')

    const gaps = await likedSubjectsMissingImages(db, limit)
    console.log(`${count(gaps.length)} sujets issus de vos likes manquent d_images :\n`)
    for (const gap of gaps) {
      console.log(`  ${gap.label.slice(0, 40).padEnd(40)} ${String(gap.images).padStart(3)} image(s)`)
    }

    if (!apply) {
      console.log('\nRelancer avec --apply pour aller les chercher.')
      return
    }

    console.log('')
    const report = await ingestImagesForLikedSubjects(db, { limit, dryRun: false })
    for (const line of report.perSubject) {
      console.log(
        `  ${line.label.slice(0, 40).padEnd(40)} trouvées ${String(line.found).padStart(3)} · insérées ${String(line.inserted).padStart(3)}`,
      )
    }
    console.log(`\nSujets demandés : ${count(report.asked)} sur ${count(report.subjects)}`)
    console.log(`Images insérées : ${count(report.inserted)}`)
    if (report.refused) console.log(`Refus du fournisseur : ${count(report.refused)}`)
    if (report.stoppedEarly) console.log('Arrêté : le fournisseur refusait, le reste n_a pas été demandé.')
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
