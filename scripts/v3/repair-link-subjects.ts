/**
 * The videos that got the game X-COM from a "x.com" link in their
 * description (see stripLinks in lib/v3/tagging/normalize.ts): the subject is
 * taken off unless the title names the game, and the universe is worked out
 * again from what remains — the other subjects, the words of the title, the
 * uploader's category. Videos filed by the universe their line asked for keep it.
 *
 *   node --import tsx scripts/v3/repair-link-subjects.ts            read only: counts and examples
 *   node --import tsx scripts/v3/repair-link-subjects.ts --apply    writes, previous labels kept for --undo
 *   node --import tsx scripts/v3/repair-link-subjects.ts --undo
 */

import { MongoClient, type Document, type ObjectId } from 'mongodb'

import { computeRegisters } from '@/lib/v3/cool/registers'
import { formatFamilyKey } from '@/lib/v3/families'
import { universeFromCategory } from '@/lib/v3/tagging/categories'
import { universeFromCues } from '@/lib/v3/tagging/cues'
import { hasCinemaClue } from '@/lib/v3/tagging/tagItem'
import { isUniverse, type Universe } from '@/lib/v3/types'

const SUBJECT = 'entity:x-com'
const RUNS = 'relabel_runs_v3'
const HINTED_LINES = new Set(['pools', 'music-live'])
const THE_GAME = /\bx-?com\b/i
const apply = process.argv.includes('--apply')
const undo = process.argv.includes('--undo')

async function main(): Promise<void> {
  const client = new MongoClient(process.env.MONGODB_URI as string, { serverSelectionTimeoutMS: 20000 })
  await client.connect()
  try {
    const db = client.db(process.env.MONGODB_DB || 'randomdb')
    if (undo) {
      let restored = 0
      for (const run of await db.collection(RUNS).find({ kind: 'links', undoneAt: { $exists: false } }).toArray()) {
        const previous = (run.previous ?? []) as Array<{ _id: ObjectId; v3: Document }>
        for (const entry of previous) restored += (await db.collection('items').updateOne({ _id: entry._id }, { $set: { v3: entry.v3 } })).modifiedCount
        await db.collection(RUNS).updateOne({ _id: run._id }, { $set: { undoneAt: new Date() } })
      }
      console.log(`remis : ${restored}`)
      return
    }
    const rows = await db.collection('items').find({ 'v3.subjects.id': SUBJECT, type: 'video' } as Document, { projection: { title: 1, provider: 1, categoryId: 1, lang: 1, v3: 1, videoId: 1 }, hint: 'v3_subject_type_rand' }).toArray()
    // The uploader's category, asked again where it was never stored, so a video that loses X-COM lands somewhere.
    const fetched = new Map<string, string>()
    const key = process.env.YOUTUBE_API_KEY
    const youtube = rows.filter((row) => !row.categoryId && row.provider === 'youtube').map((row) => String(row.videoId))
    for (let start = 0; key && start < youtube.length; start += 50) {
      const body = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&fields=items(id,snippet/categoryId)&id=${youtube.slice(start, start + 50).join(',')}&key=${key}`).then((response) => response.json()).catch(() => ({})) as { items?: Array<{ id: string; snippet?: { categoryId?: string } }> }
      for (const item of body.items ?? []) if (item.snippet?.categoryId) fetched.set(item.id, item.snippet.categoryId)
    }
    const dailymotion = rows.filter((row) => !row.categoryId && row.provider === 'dailymotion').map((row) => String(row.videoId).replace(/^dailymotion:/, ''))
    for (let start = 0; start < dailymotion.length; start += 100) {
      const body = await fetch(`https://api.dailymotion.com/videos?ids=${dailymotion.slice(start, start + 100).join(',')}&fields=id,channel.id&limit=100`).then((response) => response.json()).catch(() => ({})) as { list?: Array<Record<string, string>> }
      for (const video of body.list ?? []) if (video['channel.id']) fetched.set(`dailymotion:${video.id}`, video['channel.id'])
    }
    console.log(`catégories retrouvées : ${fetched.size} (YouTube ${Math.ceil(youtube.length / 50)} unités)`)
    for (const row of rows) if (!row.categoryId && fetched.has(String(row.videoId))) { row.categoryId = fetched.get(String(row.videoId)); row.fetchedCategory = true }
    const ids = [...new Set(rows.flatMap((row) => ((row.v3?.subjects ?? []) as Array<{ id: string }>).map((subject) => subject.id)))]
    const universeOf = new Map<string, Universe>()
    for (const subject of await db.collection('subjects_v3').find({ _id: { $in: ids } } as Document, { projection: { universe: 1 } }).toArray()) {
      if (isUniverse(subject.universe)) universeOf.set(String(subject._id), subject.universe)
    }
    const changes: Array<{ _id: ObjectId; before: Document; set: Document; unset: boolean; from: string; to: string; title: string }> = []
    let kept = 0
    for (const row of rows) {
      const title = String(row.title ?? '')
      if (THE_GAME.test(title)) { kept += 1; continue }
      const subjects = ((row.v3?.subjects ?? []) as Array<{ id: string; role: string; evidence: string }>).filter((subject) => subject.id !== SUBJECT)
        .map((subject, position) => ({ ...subject, role: position === 0 ? 'primary' : 'secondary' }))
      let universe = row.v3?.universe as Universe
      if (!HINTED_LINES.has(String(row.v3?.line))) {
        universe = 'other'
        let decided = false
        for (const subject of subjects) {
          const candidate = universeOf.get(subject.id)
          if (!candidate || candidate === 'other') continue
          if (candidate === 'cinema-tv' && !hasCinemaClue({ title, categoryId: row.categoryId })) continue
          universe = candidate
          decided = true
          break
        }
        if (!decided) universe = universeFromCues(title) ?? universeFromCategory(row.provider, row.categoryId) ?? 'other'
      }
      const v3 = { ...row.v3, subjects, universe }
      const registers = computeRegisters({ type: 'video', title, provider: row.provider, v3 } as never)
      const set: Document = {
        'v3.subjects': subjects, 'v3.universe': universe,
        'v3.formatFamily': formatFamilyKey({ primarySubjectId: subjects[0]?.id, universe, angle: row.v3?.angle, lang: row.lang }),
        ...(row.fetchedCategory ? { categoryId: row.categoryId } : {}),
        ...(registers.length ? { 'v3.registers': registers } : {}),
      }
      changes.push({ _id: row._id, before: row.v3, set, unset: !registers.length, from: String(row.v3?.universe), to: universe, title })
    }
    const moves = new Map<string, number>()
    for (const change of changes) if (change.from !== change.to) moves.set(`${change.from} → ${change.to}`, (moves.get(`${change.from} → ${change.to}`) ?? 0) + 1)
    console.log(`${rows.length} vidéos avec X-COM · ${kept} parlent vraiment du jeu · ${changes.length} perdent le sujet · ${[...moves.values()].reduce((a, b) => a + b, 0)} changent d'univers`)
    console.log([...moves].sort((left, right) => right[1] - left[1]).slice(0, 12).map(([move, n]) => `${move} ${n}`).join(' · '))
    for (const change of changes.filter((c) => c.from !== c.to).sort(() => Math.random() - 0.5).slice(0, 12)) console.log('   ', `${change.from} → ${change.to}`.padEnd(28), '|', change.title.slice(0, 70))
    if (!apply) return
    for (let start = 0; start < changes.length; start += 500) {
      const slice = changes.slice(start, start + 500)
      await db.collection(RUNS).insertOne({ at: new Date(), kind: 'links', previous: slice.map((change) => ({ _id: change._id, v3: change.before })) })
      await db.collection('items').bulkWrite(slice.map((change) => ({
        updateOne: { filter: { _id: change._id }, update: change.unset ? { $set: change.set, $unset: { 'v3.registers': '' } } : { $set: change.set } },
      })), { ordered: false })
    }
    console.log(`fait : ${changes.length} vidéos réparées`)
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
