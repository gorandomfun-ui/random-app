/**
 * Searches Giphy for the subjects the catalogue has videos for and no image.
 *
 *   node --env-file=.env.local --import tsx scripts/v3/fill-subject-gifs.ts --limit=20
 *   node --env-file=.env.local --import tsx scripts/v3/fill-subject-gifs.ts --limit=500 --apply
 *
 * 81% of subjects holding a video hold no image at all, because videos and
 * images have always been collected from separate keyword lists that never
 * spoke to each other. Nobody ever told the image side that the catalogue
 * holds 1,222 Angus Young videos and not one Angus Young GIF.
 *
 * This is what lets a Wave mix formats, which is its weakest measure.
 */

import { MongoClient, type Db } from 'mongodb'

import { ingestImages } from '@/lib/ingest/images'
import { findSubjectsMissingImages } from '@/lib/v3/giphy'
import { count } from './reportFormat'

const PAUSE_MS = 900

/**
 * How many refusals in a row before giving up. A first run marched through
 * 4,378 subjects while Giphy answered "API rate limit exceeded" to every call,
 * and recorded each one as a subject with no GIF.
 */
const REFUSALS_BEFORE_STOPPING = 5

function numericFlag(name: string, fallback: number): number {
  const raw = process.argv.find((argument) => argument.startsWith(`--${name}=`))
  if (!raw) return fallback
  const value = Number(raw.split('=')[1])
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

const pause = () => new Promise((resolve) => setTimeout(resolve, PAUSE_MS))

/** How many images the subject now holds, to tell whether the search worked. */
async function imagesFor(db: Db, subjectId: string): Promise<number> {
  return db.collection('items').countDocuments({ type: 'image', 'v3.subjects.id': subjectId })
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply')
  const limit = numericFlag('limit', 20)

  const client = new MongoClient(process.env.MONGODB_URI as string, { serverSelectionTimeoutMS: 20000 })
  await client.connect()

  try {
    const db = client.db(process.env.MONGODB_DB || 'randomdb')
    const gaps = await findSubjectsMissingImages(db, limit)
    console.log(apply ? 'Mode : INGESTION\n' : 'Mode : rapport à blanc, aucune écriture\n')
    console.log(`${count(gaps.length)} sujets à combler, les mieux fournis en vidéo d_abord :\n`)

    let inserted = 0
    let covered = 0
    let refusedInARow = 0
    let refusedTotal = 0
    let stoppedAt = 0
    const started = Date.now()

    for (const [index, gap] of gaps.entries()) {
      const result = await ingestImages({
        queries: [gap.label],
        perQuery: 25,
        providers: ['giphy'],
        dryRun: !apply,
        insertOnly: true,
      })
      inserted += result.inserted

      const refusal = result.refusals?.[0]
      if (refusal) {
        refusedInARow += 1
        refusedTotal += 1
        console.log(
          `  ${String(index + 1).padStart(3)}. ${gap.label.slice(0, 32).padEnd(32)} ` +
            `refusé par ${refusal.provider} (HTTP ${refusal.status})`,
        )
        if (refusedInARow >= REFUSALS_BEFORE_STOPPING) {
          stoppedAt = index + 1
          console.log(
            `\nArrêt : ${REFUSALS_BEFORE_STOPPING} refus de suite. ` +
              'Les sujets suivants ne sont pas « sans GIF », ils n_ont pas été demandés.',
          )
          break
        }
        await pause()
        continue
      }
      refusedInARow = 0

      const now = apply ? await imagesFor(db, gap.id) : 0
      if (now > 0) covered += 1

      console.log(
        `  ${String(index + 1).padStart(3)}. ${gap.label.slice(0, 32).padEnd(32)} ` +
          `${String(gap.videos).padStart(5)} vidéos · trouvés ${String(result.unique).padStart(3)} · ` +
          `insérés ${String(result.inserted).padStart(3)}` +
          (apply ? ` · images du sujet : ${now}` : ''),
      )
      await pause()
    }

    const minutes = (Date.now() - started) / 60000
    const attempted = stoppedAt || gaps.length
    console.log(`\nInsérés : ${count(inserted)} · sujets désormais couverts : ${count(covered)} / ${count(attempted)} demandés`)
    if (refusedTotal) console.log(`Refusés par le fournisseur : ${count(refusedTotal)}`)
    if (stoppedAt) console.log(`Non demandés : ${count(gaps.length - stoppedAt)} sujets restants.`)
    console.log(`Cadence : ${(gaps.length / minutes).toFixed(1)} sujets par minute.`)
    if (!apply) console.log('\nRelancer avec --apply pour ingérer.')
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
