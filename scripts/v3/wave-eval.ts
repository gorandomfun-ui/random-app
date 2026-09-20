/**
 * Tries the Wave on real catalogue items. Read-only.
 *
 *   node --env-file=.env.local --import tsx scripts/v3/wave-eval.ts --size=300
 */

import { MongoClient, type ObjectId } from 'mongodb'

import { composeWave, loadAnchor } from '@/lib/v3/wave/find'
import { count, percent, table } from './reportFormat'

function numericFlag(name: string, fallback: number): number {
  const raw = process.argv.find((argument) => argument.startsWith(`--${name}=`))
  if (!raw) return fallback
  const value = Number(raw.split('=')[1])
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

async function main(): Promise<void> {
  const client = new MongoClient(process.env.MONGODB_URI as string, { serverSelectionTimeoutMS: 20000 })
  await client.connect()

  try {
    const db = client.db(process.env.MONGODB_DB || 'randomdb')
    const size = numericFlag('size', 300)

    // Only items a visitor could actually land on and that carry a subject.
    const anchors = (await db
      .collection('items')
      .aggregate(
        [
          { $match: { 'v3.subjects.0': { $exists: true }, 'v3.usable': true } },
          { $sample: { size } },
          { $project: { _id: 1 } },
        ],
        { allowDiskUse: true },
      )
      .toArray()) as Array<{ _id: ObjectId }>

    let withWave = 0
    let full = 0
    let twoFormats = 0
    let sameAngle = 0
    let sameAuthor = 0
    const levels = new Map<number, number>()
    const durations: number[] = []
    const examples: string[] = []

    for (const row of anchors) {
      const started = Date.now()
      const loaded = await loadAnchor(db, row._id)
      if (!loaded) continue
      const { items, level } = await composeWave(db, loaded.anchor, row._id)
      durations.push(Date.now() - started)

      if (items.length) withWave += 1
      if (items.length === 3) full += 1
      if (new Set(items.map((item) => item.type)).size >= 2) twoFormats += 1
      levels.set(level, (levels.get(level) ?? 0) + 1)

      const angles = items.map((item) => item.v3.angle)
      if (new Set(angles).size !== angles.length) sameAngle += 1
      const authors = items.map((item) => item.v3.channelKey).filter(Boolean)
      if (new Set(authors).size !== authors.length) sameAuthor += 1

      if (examples.length < 12 && items.length >= 2) {
        examples.push(
          `• ${(loaded.anchor.title ?? '').slice(0, 58)}  [${loaded.anchor.type}/${loaded.anchor.v3.angle}]\n` +
            items
              .map((item) => `    → ${(item.title ?? '').slice(0, 54)}  [${item.type}/${item.v3.angle}] n${item.level}`)
              .join('\n'),
        )
      }
    }

    const total = anchors.length
    durations.sort((left, right) => left - right)
    const p50 = durations[Math.floor(durations.length * 0.5)] ?? 0
    const p95 = durations[Math.floor(durations.length * 0.95)] ?? 0

    console.log(table(
      ['Mesure', 'Valeur', 'Cible'],
      [
        ['Contenus testés', count(total), ''],
        ['**Avec une Wave**', `**${percent(withWave, total)}**`, '≥ 99 %'],
        ['Wave complète (3 contenus)', percent(full, total), ''],
        ['Avec au moins 2 formats', percent(twoFormats, total), '≥ 70 %'],
        ['Deux fois le même angle', count(sameAngle), '0'],
        ['Deux fois le même auteur', count(sameAuthor), '0'],
        ['Latence médiane', `${p50} ms`, ''],
        ['Latence p95', `${p95} ms`, '< 300 ms'],
      ],
    ))

    console.log('\nNiveaux atteints :')
    for (const [level, n] of [...levels].sort()) {
      console.log(`  niveau ${level} : ${percent(n, total)}`)
    }

    console.log('\n=== EXEMPLES ===\n')
    console.log(examples.join('\n\n'))
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
