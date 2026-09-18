/**
 * Puts the real uploader back on the Dailymotion videos that store a category.
 *
 *   node --env-file=.env.local --import tsx scripts/v3/repair-dailymotion-authors.ts
 *   node --env-file=.env.local --import tsx scripts/v3/repair-dailymotion-authors.ts --apply
 *
 * Resumable: a checkpoint is written after every batch, so an interrupted run
 * continues where it stopped instead of starting over.
 */

import { MongoClient } from 'mongodb'

import {
  BATCH_SIZE,
  applyOwners,
  bareVideoId,
  fetchOwners,
  findBroken,
  readCheckpoint,
  writeCheckpoint,
  type BrokenVideo,
} from '@/lib/v3/repair/dailymotionAuthors'
import { count } from './reportFormat'

const PAUSE_MS = 250

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

function numericFlag(name: string, fallback: number): number {
  const raw = process.argv.find((argument) => argument.startsWith(`--${name}=`))
  if (!raw) return fallback
  const value = Number(raw.split('=')[1])
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

const pause = () => new Promise((resolve) => setTimeout(resolve, PAUSE_MS))

async function dryRun(client: MongoClient, dbName: string): Promise<void> {
  const db = client.db(dbName)
  const remaining = await db.collection('items').countDocuments({
    type: 'video',
    provider: 'dailymotion',
    channelId: { $not: /^x[a-z0-9]+$/i },
  })
  console.log(`À réparer : ${count(remaining)} vidéos\n`)

  const sample = await findBroken(db, null, 20)
  const ids = sample.map((video) => bareVideoId(video.videoId)).filter((id): id is string => Boolean(id))
  const owners = await fetchOwners(ids)
  const byId = new Map(owners.map((owner) => [owner.videoId, owner]))

  console.log('20 exemples, avant → après :\n')
  for (const video of sample) {
    const bare = bareVideoId(video.videoId)
    const owner = bare ? byId.get(bare) : undefined
    const title = (video.title ?? '').slice(0, 52).padEnd(52)
    const before = String(video.channelId ?? '—').padEnd(14)
    const after = owner ? `${owner.ownerName ?? owner.ownerId}` : '(introuvable chez Dailymotion, laissée telle quelle)'
    console.log(`  ${title}  ${before} → ${after}`)
  }

  console.log(`\n${count(Math.ceil(remaining / BATCH_SIZE))} appels à l_API, environ ${Math.round((remaining / BATCH_SIZE) * (PAUSE_MS + 400) / 60000)} minutes.`)
  console.log('\nRelancer avec --apply pour réparer.')
}

async function repair(client: MongoClient, dbName: string, maxBatches: number): Promise<void> {
  const db = client.db(dbName)
  const items = db.collection('items')
  let afterId = flag('restart') ? null : await readCheckpoint(db)
  if (afterId) console.log(`Reprise après ${String(afterId)}\n`)

  let repaired = 0
  let missing = 0
  let batches = 0
  const started = Date.now()

  while (batches < maxBatches) {
    const videos: BrokenVideo[] = await findBroken(db, afterId, BATCH_SIZE)
    if (!videos.length) {
      console.log('\nPlus rien à réparer.')
      break
    }

    const ids = videos.map((video) => bareVideoId(video.videoId)).filter((id): id is string => Boolean(id))
    try {
      const owners = await fetchOwners(ids)
      const result = await applyOwners(items, videos, owners)
      repaired += result.repaired
      missing += result.missing
    } catch (error) {
      console.error(`\nArrêt : ${(error as Error).message}`)
      console.error('Le point de reprise est enregistré ; relancer plus tard reprendra ici.')
      break
    }

    afterId = videos[videos.length - 1]._id
    await writeCheckpoint(db, afterId)
    batches += 1

    if (batches % 20 === 0) {
      const perMinute = Math.round((repaired / (Date.now() - started)) * 60000)
      console.log(`  ${count(repaired)} réparées, ${count(missing)} introuvables · ~${count(perMinute)}/min`)
    }
    await pause()
  }

  console.log(`\nRéparées : ${count(repaired)} · introuvables chez Dailymotion : ${count(missing)}`)
  const left = await items.countDocuments({
    type: 'video',
    provider: 'dailymotion',
    channelId: { $not: /^x[a-z0-9]+$/i },
  })
  console.log(`Restant à réparer : ${count(left)}`)
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI
  if (!uri) throw new Error('MONGODB_URI manquant')
  const dbName = process.env.MONGODB_DB || process.env.MONGO_DB || 'randomdb'

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 20000 })
  await client.connect()
  try {
    if (flag('apply')) {
      console.log('Mode : RÉPARATION\n')
      await repair(client, dbName, numericFlag('batches', 100000))
    } else {
      console.log('Mode : rapport à blanc, aucune écriture\n')
      await dryRun(client, dbName)
    }
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
