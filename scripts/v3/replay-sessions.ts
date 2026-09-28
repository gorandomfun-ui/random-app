/**
 * What sessions actually show: fresh devices play sessions against the live
 * site, the way the page does (the format cycle of lib/random/sequence.ts, the
 * session of lib/discovery/pool.ts, the device's fresh memory), and the
 * contents they were served are read back from the catalogue.
 *
 *   node --import tsx scripts/v3/replay-sessions.ts                     6 devices × 60 contents
 *   node --import tsx scripts/v3/replay-sessions.ts --deck              the same with the theme deck (admin rehearsal)
 *   node --import tsx scripts/v3/replay-sessions.ts --sessions=3 --contents=40 --label=test
 *
 * Built on 28 September to judge variety by measure, not by feel: distinct
 * universes in the first twenty visuals, the biggest universe's share, long
 * formats, still album covers, trailers, contents two devices both got.
 * Reads the catalogue by id only; the report goes to docs/reports/.
 */

import { mkdirSync, writeFileSync } from 'node:fs'

import { MongoClient, ObjectId, type Document } from 'mongodb'

import { markSeen, type FreshSeen } from '@/lib/discovery/freshSeen'
import { commitDraw, newSession, planDraw } from '@/lib/discovery/pool'
import { ALL_ITEM_TYPES, createSequenceState, nextSlot } from '@/lib/random/sequence'
import { isTrailerTitle } from '@/lib/v3/cool/themes'

const flag = (name: string, fallback: number) => Number(process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1]) || fallback
const SESSIONS = flag('sessions', 6)
const CONTENTS = flag('contents', 60)
const DECK = process.argv.includes('--deck')
const BASE = process.argv.find((arg) => arg.startsWith('--base='))?.slice(7) || 'https://www.gorandom.fun'
const LABEL = process.argv.find((arg) => arg.startsWith('--label='))?.slice(8) || (DECK ? 'deck' : 'current')

type Row = { session: number; position: number; type: string; path: string; theme?: string; id?: string; key: string; title: string }

const seconds = (value: unknown) => {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(value ?? ''))
  return match ? Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0) : null
}
const pct = (part: number, whole: number) => (whole ? `${Math.round((100 * part) / whole)} %` : '—')

async function play(session: number): Promise<Row[]> {
  const rows: Row[] = []
  let sequence = createSequenceState()
  let state = newSession(Math.floor(Math.random() * 0xffffffff))
  let fresh: FreshSeen | null = null
  const seen: string[] = []
  for (let guard = 0; rows.length < CONTENTS && guard < CONTENTS * 3; guard += 1) {
    const next = nextSlot(sequence, new Set(ALL_ITEM_TYPES), ALL_ITEM_TYPES)
    sequence = next.state
    if (next.slot.kind !== 'content') continue
    const type = next.slot.itemType
    const ticket = planDraw(state, type)
    const response = await fetch(`${BASE}/api/discovery/random`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(DECK ? { 'x-admin-ingest-key': process.env.ADMIN_INGEST_KEY ?? '' } : {}) },
      body: JSON.stringify({ session: state, type, lang: 'fr', factVariant: next.slot.requireQuiz ? 'quiz' : undefined, seen: seen.slice(-400), ...(fresh ? { fresh } : {}), ...(DECK ? { themeDeck: true } : {}) }),
    }).catch(() => null)
    if (!response || response.status !== 200) continue
    type Reply = { candidate?: Parameters<typeof commitDraw>[2] & { fresh?: boolean; freshDay?: string; freshPosition?: number; payload?: { _id?: string; title?: string; text?: string } }
      cool?: { source?: string }; branch?: string; theme?: string }
    const body = await response.json() as Reply
    const candidate = body.candidate
    if (!candidate) continue
    try { state = commitDraw(state, ticket, candidate) } catch { continue }
    if (candidate.fresh && candidate.freshDay && typeof candidate.freshPosition === 'number') fresh = markSeen(fresh, candidate.freshDay, candidate.freshPosition)
    seen.push(candidate.key)
    const path = candidate.fresh ? 'fresh' : body.cool ? `cool:${body.cool.source}` : `pool:${body.branch ?? ''}`
    rows.push({ session, position: rows.length + 1, type: candidate.type, path, theme: body.theme, id: candidate.payload?._id, key: candidate.key, title: String(candidate.payload?.title ?? candidate.payload?.text ?? '') })
  }
  return rows
}

async function main(): Promise<void> {
  const rows = (await Promise.all(Array.from({ length: SESSIONS }, (_, index) => play(index + 1)))).flat()
  const client = new MongoClient(process.env.MONGODB_URI as string, { serverSelectionTimeoutMS: 20000 })
  await client.connect()
  const ids = rows.map((row) => row.id).filter((id): id is string => Boolean(id && /^[0-9a-f]{24}$/i.test(id)))
  const docs = new Map((await client.db(process.env.MONGODB_DB || 'randomdb').collection('items')
    .find({ _id: { $in: ids.map((id) => new ObjectId(id)) } }, { projection: { title: 1, duration: 1, channelTitle: 1, v3: 1, provider: 1, description: 1, 'source.name': 1 } }).toArray())
    .map((doc: Document) => [String(doc._id), doc]))
  await client.close()

  const visual = (row: Row) => row.type === 'video' || row.type === 'image'
  // Signs read on the stored text only — an estimate, what the owner calls "des trucs IA", "musique avec une image".
  const AI = /(?:^|[^\p{L}])(?:#ai(?:art|video|generated|animation|music)?|ai[- ]generated|generated (?:with|by) ai|made with ai|ai (?:video|art|story|music|song|animation|cover)|midjourney|stable diffusion|sora|kling|hailuo|runway ?ml|pika labs|leonardo ai|suno|udio|dall-?e|created with|créé avec|hecho con ia|feito com ia|généré par (?:l'?)?ia|\bia\b generativa)(?=$|[^\p{L}])/iu
  const STILL = /(?:\blyrics?\b|\blyric video\b|\bletra\b|\bparoles\b|\b8d\b|\bslowed\b|\breverb\b|\bsped up\b|\bnightcore\b|\bmashup\b|\bofficial audio\b|\baudio oficial\b|\bvisuali[sz]er\b|\(audio\)|\[audio\])/i
  const script = (title: string) => /[\u0900-\u097F]/.test(title) ? 'devanagari' : /[\u0E00-\u0E7F]/.test(title) ? 'thai' : /[\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/.test(title) ? 'cjk' : /[\u0600-\u06FF]/.test(title) ? 'arabic' : /[\u0400-\u04FF]/.test(title) ? 'cyrillic'
    : /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(title) ? 'vietnamese' : /\b(?:você|não|muito|pra|com|sua|meu|vídeo|ção|ções)\b|ção\b/i.test(title) ? 'portuguese' : /\b(?:el|los|las|que|con|para|una|por|mi|tu)\b/i.test(title) ? 'spanish' : 'latin-other'
  const signs = (row: Row) => {
    const doc = docs.get(row.id ?? '')
    const text = `${doc?.title ?? row.title} ${doc?.channelTitle ?? ''} ${String(doc?.description ?? '').slice(0, 1500)}`
    return {
      ai: AI.test(text),
      still: / - Topic$/.test(String(doc?.channelTitle ?? '')) || (String(doc?.v3?.universe ?? '') === 'music' && STILL.test(String(doc?.title ?? row.title))),
      script: script(String(doc?.title ?? row.title)),
      subject: String(doc?.v3?.subjects?.[0]?.id ?? ''),
    }
  }
  const universe = (row: Row) => String(docs.get(row.id ?? '')?.v3?.universe ?? '?')
  const lines: string[] = [`# Sessions rejouées — ${LABEL}`, '', `${SESSIONS} appareils neufs × ${CONTENTS} contenus, ${new Date().toISOString().slice(0, 16)}Z, ${DECK ? 'avec' : 'sans'} les cartes-thèmes.`, '']
  const perSession: string[] = []
  const totals = { visuals: 0, long: 0, still: 0, trailers: 0, gifs: 0 }
  const shown = new Map<string, number>()
  for (let session = 1; session <= SESSIONS; session += 1) {
    const visuals = rows.filter((row) => row.session === session && visual(row))
    const counts = new Map<string, number>()
    for (const row of visuals) counts.set(universe(row), (counts.get(universe(row)) ?? 0) + 1)
    const biggest = [...counts].sort((a, b) => b[1] - a[1])[0] ?? ['—', 0]
    const first20 = new Set(visuals.slice(0, 20).map(universe)).size
    const long = visuals.filter((row) => (seconds(docs.get(row.id ?? '')?.duration) ?? 0) > 15 * 60).length
    const still = visuals.filter((row) => signs(row).still).length
    const ai = visuals.filter((row) => signs(row).ai).length
    const subjects = visuals.map((row) => signs(row).subject).filter((subject) => subject.startsWith('entity:'))
    const twice = [...new Set(subjects.filter((subject, index) => subjects.indexOf(subject) !== index))]
    const trailers = visuals.filter((row) => isTrailerTitle(docs.get(row.id ?? '')?.title ?? row.title)).length
    const gifs = visuals.filter((row) => row.type === 'image' && docs.get(row.id ?? '')?.provider === 'giphy').length
    totals.visuals += visuals.length; totals.long += long; totals.still += still; totals.trailers += trailers; totals.gifs += gifs
    for (const row of visuals) shown.set(row.key, (shown.get(row.key) ?? 0) + 1)
    perSession.push(`| ${session} | ${visuals.length} | ${counts.size} | ${first20} | ${biggest[0]} ${pct(biggest[1], visuals.length)} | ${pct(counts.get('music') ?? 0, visuals.length)} | ${pct(counts.get('gaming') ?? 0, visuals.length)} | ${long} | ${still} | ${trailers} | ${gifs} | ${ai} | ${twice.map((subject) => subject.slice(7)).join(', ') || '—'} |`)
  }
  lines.push('| Session | Visuels | Univers | Univers dans les 20 premiers | Plus gros univers | Musique | Jeu vidéo | Longs (>15 min) | Musique image fixe | Bandes-annonces | GIF Giphy | IA (signes) | Même sujet deux fois |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|', ...perSession, '')
  const scripts = new Map<string, number>()
  for (const row of rows.filter((row) => row.type === 'video')) scripts.set(signs(row).script, (scripts.get(signs(row).script) ?? 0) + 1)
  const videoCount = rows.filter((row) => row.type === 'video').length
  lines.push(`Langue / écriture des titres des vidéos : ${[...scripts].sort((a, b) => b[1] - a[1]).map(([name, n]) => `${name} ${pct(n, videoCount)}`).join(' · ')}`, '')
  const all = new Map<string, number>()
  for (const row of rows.filter(visual)) all.set(universe(row), (all.get(universe(row)) ?? 0) + 1)
  lines.push(`Ensemble : ${[...all].sort((a, b) => b[1] - a[1]).map(([name, n]) => `${name} ${pct(n, totals.visuals)}`).join(' · ')}`, '')
  const paths = new Map<string, number>()
  for (const row of rows.filter(visual)) paths.set(row.path, (paths.get(row.path) ?? 0) + 1)
  lines.push(`Par où : ${[...paths].sort((a, b) => b[1] - a[1]).map(([name, n]) => `${name} ${n}`).join(' · ')}`, '')
  lines.push(`Vus par deux appareils ou plus : ${[...shown.values()].filter((n) => n > 1).length} contenus sur ${shown.size}.`, '')
  lines.push('## Les visuels, session par session', '')
  for (const row of rows.filter(visual)) {
    const doc = docs.get(row.id ?? '')
    const length = seconds(doc?.duration)
    const flags = signs(row)
    lines.push(`- ${row.session}.${row.position} ${row.path} · carte ${row.theme ?? '—'} · ${universe(row)} · ${length === null ? '' : `${Math.round(length / 60)} min · `}${flags.ai ? '[IA] ' : ''}${flags.still ? '[image fixe] ' : ''}${String(doc?.title ?? row.title).slice(0, 80)}`)
  }
  mkdirSync('docs/reports', { recursive: true })
  const file = `docs/reports/replay-${LABEL}.md`
  writeFileSync(file, `${lines.join('\n')}\n`)
  console.log(lines.slice(0, 6 + SESSIONS + 6).join('\n'))
  console.log(`rapport ${file}`)
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
