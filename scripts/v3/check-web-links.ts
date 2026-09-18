/**
 * Walks the stored websites and records which ones are genuinely gone.
 *
 *   node --env-file=.env.local --import tsx scripts/v3/check-web-links.ts --size=300
 *   node --env-file=.env.local --import tsx scripts/v3/check-web-links.ts --apply
 *
 * Without --apply it checks a sample and reports, writing nothing. With
 * --apply it records a verdict per site and is resumable by checkpoint.
 *
 * It never suspends anything: a "dead" mark is a fact recorded, and removing
 * those from the draw is a separate decision.
 */

import { MongoClient, type Db, type ObjectId } from 'mongodb'

import { checkImage, checkLink, looksMerchant } from '@/lib/v3/web/linkCheck'
import { count, percent, table } from './reportFormat'

const CHECKPOINT_COLLECTION = 'v3_repair_checkpoints'
const CHECKPOINT_ID = 'web-links'
/** Enough to keep the run quick, low enough to stay polite to every host. */
const CONCURRENCY = 24

type WebRow = { _id: ObjectId; url: string; ogImage?: string | null; title?: string | null }

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

function numericFlag(name: string, fallback: number): number {
  const raw = process.argv.find((argument) => argument.startsWith(`--${name}=`))
  if (!raw) return fallback
  const value = Number(raw.split('=')[1])
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

type Verdict = {
  row: WebRow
  link: Awaited<ReturnType<typeof checkLink>>
  image: Awaited<ReturnType<typeof checkImage>> | null
  merchant: boolean
}

async function inspect(rows: WebRow[]): Promise<Verdict[]> {
  const results: Verdict[] = []
  for (let index = 0; index < rows.length; index += CONCURRENCY) {
    const slice = rows.slice(index, index + CONCURRENCY)
    const checked = await Promise.all(
      slice.map(async (row): Promise<Verdict> => {
        const link = await checkLink(row.url)
        const image = row.ogImage ? await checkImage(row.ogImage) : null
        return { row, link, image, merchant: looksMerchant(row.url) }
      }),
    )
    results.push(...checked)
  }
  return results
}

function summarise(verdicts: Verdict[]): void {
  const total = verdicts.length
  const tally = (state: string) => verdicts.filter((verdict) => verdict.link.state === state).length
  const imageDead = verdicts.filter((verdict) => verdict.image?.state === 'dead').length
  const merchant = verdicts.filter((verdict) => verdict.merchant).length

  console.log(table(
    ['État du site', 'Nombre', 'Part'],
    [
      ['accessible', count(tally('alive')), percent(tally('alive'), total)],
      ['**mort (404, 410, domaine disparu)**', `**${count(tally('dead'))}**`, `**${percent(tally('dead'), total)}**`],
      ['bloque les robots (403…) — on garde', count(tally('blocked')), percent(tally('blocked'), total)],
      ['indéterminé (délai, 5xx) — à réessayer', count(tally('unknown')), percent(tally('unknown'), total)],
      ['image de prévisualisation morte', count(imageDead), percent(imageDead, total)],
      ['ressemble à une page marchande', count(merchant), percent(merchant, total)],
    ],
  ))

  const dead = verdicts.filter((verdict) => verdict.link.state === 'dead')
  if (dead.length) {
    console.log('\nExemples de sites réellement morts :')
    for (const verdict of dead.slice(0, 10)) {
      const reason = verdict.link.state === 'dead' ? verdict.link.reason : ''
      console.log(`  ${reason.padEnd(22)} ${verdict.row.url.slice(0, 70)}`)
    }
  }

  const blocked = verdicts.filter((verdict) => verdict.link.state === 'blocked')
  if (blocked.length) {
    console.log('\nExemples de sites qui bloquent les robots (CONSERVÉS) :')
    for (const verdict of blocked.slice(0, 5)) {
      const status = verdict.link.state === 'blocked' ? verdict.link.status : ''
      console.log(`  HTTP ${status}               ${verdict.row.url.slice(0, 70)}`)
    }
  }
}

async function record(db: Db, verdicts: Verdict[]): Promise<void> {
  const now = new Date()
  const operations = verdicts.map((verdict) => ({
    updateOne: {
      filter: { _id: verdict.row._id },
      update: {
        $set: {
          webLinkCheckedAt: now,
          webLinkState: verdict.link.state,
          webLinkDead: verdict.link.state === 'dead',
          ...(verdict.image ? { webImageState: verdict.image.state } : {}),
          ...(verdict.merchant ? { webLooksMerchant: true } : {}),
        },
      },
    },
  }))
  if (operations.length) await db.collection('items').bulkWrite(operations, { ordered: false })
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI
  if (!uri) throw new Error('MONGODB_URI manquant')
  const dbName = process.env.MONGODB_DB || process.env.MONGO_DB || 'randomdb'
  const apply = flag('apply')
  const size = numericFlag('size', 300)

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 20000 })
  await client.connect()

  try {
    const db = client.db(dbName)
    const items = db.collection('items')

    if (!apply) {
      console.log(`Mode : rapport à blanc sur ${count(size)} sites au hasard, aucune écriture\n`)
      const rows = (await items
        .aggregate([{ $match: { type: 'web' } }, { $sample: { size } }, { $project: { url: 1, ogImage: 1, title: 1 } }])
        .toArray()) as unknown as WebRow[]
      summarise(await inspect(rows))
      const total = await items.countDocuments({ type: 'web' })
      console.log(`\n${count(total)} sites au total. Relancer avec --apply pour tout vérifier et enregistrer.`)
      return
    }

    console.log('Mode : VÉRIFICATION de tous les sites\n')
    const checkpointRow = await db.collection(CHECKPOINT_COLLECTION).findOne({ _id: CHECKPOINT_ID as never })
    let afterId = flag('restart') ? null : ((checkpointRow as { lastId?: ObjectId } | null)?.lastId ?? null)
    if (afterId) console.log(`Reprise après ${String(afterId)}\n`)

    let done = 0
    let dead = 0
    const started = Date.now()

    for (;;) {
      const rows = (await items
        .find(
          { type: 'web', ...(afterId ? { _id: { $gt: afterId } } : {}) },
          { projection: { url: 1, ogImage: 1, title: 1 }, sort: { _id: 1 }, limit: 120 },
        )
        .toArray()) as unknown as WebRow[]
      if (!rows.length) break

      const verdicts = await inspect(rows.filter((row) => typeof row.url === 'string' && row.url))
      await record(db, verdicts)
      dead += verdicts.filter((verdict) => verdict.link.state === 'dead').length
      done += verdicts.length
      afterId = rows[rows.length - 1]._id
      await db
        .collection(CHECKPOINT_COLLECTION)
        .updateOne({ _id: CHECKPOINT_ID as never }, { $set: { lastId: afterId, updatedAt: new Date() } }, { upsert: true })

      const perMinute = Math.round((done / (Date.now() - started)) * 60000)
      console.log(`  ${count(done)} vérifiés · ${count(dead)} morts · ~${count(perMinute)}/min`)
    }

    console.log(`\nTerminé : ${count(done)} sites vérifiés, ${count(dead)} morts marqués.`)
    console.log('Aucun site n_a été suspendu : le tirage les écarte simplement.')
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
