/**
 * Refreshes the seeds of the cool pool: the curator's likes, and a daily
 * handful of proven videos and cool images among the cool words, per format.
 *
 *   node --env-file=.env.local --import tsx scripts/v3/cool-seeds.ts
 *   node --env-file=.env.local --import tsx scripts/v3/cool-seeds.ts --apply --editorial=40
 */

import { MongoClient } from 'mongodb'

import { refreshCoolSeeds } from '@/lib/v3/cool/seeds'
import { count } from './reportFormat'

function numericFlag(name: string, fallback: number): number {
  const raw = process.argv.find((argument) => argument.startsWith(`--${name}=`))
  if (!raw) return fallback
  const value = Number(raw.split('=')[1])
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply')
  const editorialWanted = numericFlag('editorial', 40)

  const client = new MongoClient(process.env.MONGODB_URI as string, { serverSelectionTimeoutMS: 20000 })
  await client.connect()

  try {
    const db = client.db(process.env.MONGODB_DB || 'randomdb')
    console.log(apply ? 'Mode : ÉCRITURE\n' : 'Mode : rapport à blanc, aucune écriture\n')

    const report = await refreshCoolSeeds(db, { apply, editorialWanted })
    const { likes, editorial } = report
    if (report.replanted) console.log(`Graines sans clé de fil, replantées : ${count(report.replanted)}`)
    console.log(
      `Likes du curateur : ${count(likes.references)} références · ${count(likes.resolved)} retrouvées en base · ` +
        `${count(likes.added)} graines ajoutées · ${count(likes.removed)} retirées`,
    )
    for (const key of likes.unresolved) console.log(`  non retrouvé : ${key}`)
    for (const type of ['video', 'image'] as const) {
      const line = editorial[type]
      console.log(
        `Graines éditoriales (${type}) : ${count(line.kept)} gardées · ${count(line.expired)} expirées · ` +
          `${count(line.added)} ajoutées sur ${count(line.wanted)} demandées ` +
          `(${count(line.found)} contenus cool vus en ${line.windows} fenêtre(s))`,
      )
    }
    if (!apply) console.log('\nRelancer avec --apply pour écrire.')
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
