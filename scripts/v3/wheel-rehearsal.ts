/**
 * The wheel rehearsed against the catalogue, without the site: a few fresh
 * sessions draw their videos through lib/discovery/wheel.ts and print each
 * card, what filled it, how often the site had served it, and the title.
 *
 *   node --env-file=.env.local --import tsx scripts/v3/wheel-rehearsal.ts --sessions=2 --videos=30
 *
 * Reads only; the served count is not written here (the site does that).
 */

import { MongoClient, type Document } from 'mongodb'

import { commitDraw, newSession, planDraw } from '@/lib/discovery/pool'
import { selectWheel, slotAt } from '@/lib/discovery/wheel'
import { themeAt } from '@/lib/v3/cool/themes'

const flag = (name: string, fallback: number) => Number(process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1]) || fallback
const SESSIONS = flag('sessions', 2)
const VIDEOS = flag('videos', 30)

async function main(): Promise<void> {
  const client = new MongoClient(process.env.MONGODB_URI as string, { serverSelectionTimeoutMS: 20_000 })
  await client.connect()
  const db = client.db(process.env.MONGODB_DB || 'randomdb')
  const decode = (row: Document) => ({ _id: String(row._id), title: String(row.title ?? '') })
  const shown = new Map<string, number>()
  for (let session = 1; session <= SESSIONS; session += 1) {
    let state = newSession(Math.floor(Math.random() * 0xffffffff))
    console.log(`\n== session ${session}`)
    let empty = 0
    const started = Date.now()
    for (let video = 0; video < VIDEOS; video += 1) {
      // Every other visual is a GIF in the real cycle; the wheel counts videos, the cards count visuals.
      const ticket = planDraw(state, 'video')
      const card = themeAt(state.seed, state.visuals)
      const at = Date.now()
      const result = await selectWheel(db, ticket, state, null, decode, 'fr', Math.random, Date.now(), card)
      if (!result) { empty += 1; console.log(`${String(video + 1).padStart(2)}  ${slotAt(state.seed, state.videos ?? 0).padEnd(6)} — rien (${Date.now() - at} ms)`); continue }
      state = commitDraw(state, ticket, result.item)
      shown.set(result.item.key, (shown.get(result.item.key) ?? 0) + 1)
      const w = result.wheel
      console.log(`${String(video + 1).padStart(2)}  ${w.slot.padEnd(6)} ${w.from.padEnd(16)} ${(result.item.universe ?? '?').padEnd(16)} servi ${String(w.served).padStart(3)}  ${String(result.item.seconds ? `${Math.round(result.item.seconds / 60)} min` : '').padStart(7)}  ${Date.now() - at} ms  ${(result.item.title ?? '').slice(0, 70)}`)
    }
    console.log(`   ${VIDEOS - empty} vidéos, ${empty} sans réponse, ${Math.round((Date.now() - started) / VIDEOS)} ms par vidéo`)
  }
  console.log(`\nvus par deux sessions ou plus : ${[...shown.values()].filter((n) => n > 1).length} sur ${shown.size}`)
  await client.close()
}

main().catch((error) => { console.error(error); process.exit(1) })
