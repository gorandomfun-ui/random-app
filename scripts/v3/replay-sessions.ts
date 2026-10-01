/**
 * What sessions actually show: fresh devices play sessions against the live
 * site, the way the page does (the format cycle of lib/random/sequence.ts, the
 * session of lib/discovery/pool.ts, the device's fresh memory), and the
 * contents they were served are read back from the catalogue.
 *
 *   node --import tsx scripts/v3/replay-sessions.ts                     6 devices × 60 contents
 *   node --import tsx scripts/v3/replay-sessions.ts --deck              the same with the theme deck (admin rehearsal)
 *   node --import tsx scripts/v3/replay-sessions.ts --sessions=3 --contents=40 --label=test
 *   node --import tsx scripts/v3/replay-sessions.ts --sessions=4 --device-sessions=3   each device plays three sessions in a row, its memory carried (seen keys, subjects two weeks)
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
import { isNewsTitle, isTrailerTitle } from '@/lib/v3/cool/themes'
import { exposureOf } from '@/lib/discovery/diversity'
import { titleLanguage } from '@/lib/discovery/language'

const flag = (name: string, fallback: number) => Number(process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1]) || fallback
const SESSIONS = flag('sessions', 6)
const CONTENTS = flag('contents', 60)
const DECK = process.argv.includes('--deck')
const DIG = process.argv.includes('--dig')
const WHEEL = process.argv.includes('--wheel')
const DEVICE_SESSIONS = flag('device-sessions', 1)
const BASE = process.argv.find((arg) => arg.startsWith('--base='))?.slice(7) || 'https://www.gorandom.fun'
const LABEL = process.argv.find((arg) => arg.startsWith('--label='))?.slice(8) || (WHEEL ? 'wheel' : DIG ? 'dig' : DECK ? 'deck' : 'current')

type Row = { session: number; position: number; type: string; path: string; theme?: string; id?: string; key: string; title: string; subject?: number; author?: number; visit: number }

const seconds = (value: unknown) => {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(value ?? ''))
  return match ? Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0) : null
}
const pct = (part: number, whole: number) => (whole ? `${Math.round((100 * part) / whole)} %` : '—')

async function play(session: number, device: { seen: string[]; subjects: number[]; fresh: FreshSeen | null } = { seen: [], subjects: [], fresh: null }, visit = 1): Promise<Row[]> {
  const rows: Row[] = []
  let sequence = createSequenceState()
  let state = newSession(Math.floor(Math.random() * 0xffffffff))
  let fresh: FreshSeen | null = device.fresh
  const seen = device.seen
  for (let guard = 0; rows.length < CONTENTS && guard < CONTENTS * 3; guard += 1) {
    const next = nextSlot(sequence, new Set(ALL_ITEM_TYPES), ALL_ITEM_TYPES)
    sequence = next.state
    if (next.slot.kind !== 'content') continue
    const type = next.slot.itemType
    const ticket = planDraw(state, type)
    const response = await fetch(`${BASE}/api/discovery/random`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(DECK || DIG || WHEEL ? { 'x-admin-ingest-key': process.env.ADMIN_INGEST_KEY ?? '' } : {}) },
      body: JSON.stringify({ session: state, type, lang: 'fr', factVariant: next.slot.requireQuiz ? 'quiz' : undefined, seen: seen.slice(-400), seenSubjects: device.subjects.slice(-600), ...(fresh ? { fresh } : {}), ...(DECK ? { themeDeck: true } : {}), ...(DIG ? { digDraw: true } : {}), ...(WHEEL ? { wheel: true } : {}) }),
    }).catch(() => null)
    if (!response || response.status !== 200) continue
    type Reply = { candidate?: Parameters<typeof commitDraw>[2] & { fresh?: boolean; freshDay?: string; freshPosition?: number; payload?: { _id?: string; title?: string; text?: string } }
      cool?: { source?: string }; branch?: string; theme?: string; dig?: { base?: string; level?: number | null; label?: string }; wheel?: { slot?: string; from?: string; served?: number } }
    const body = await response.json() as Reply
    const candidate = body.candidate
    if (!candidate) continue
    try { state = commitDraw(state, ticket, candidate) } catch { continue }
    if (candidate.fresh && candidate.freshDay && typeof candidate.freshPosition === 'number') fresh = markSeen(fresh, candidate.freshDay, candidate.freshPosition)
    seen.push(candidate.key)
    const stamp = exposureOf(candidate)
    for (const hash of [stamp?.subject, stamp?.author]) if (typeof hash === 'number' && !device.subjects.includes(hash)) device.subjects.push(hash)
    const path = body.wheel ? `wheel:${body.wheel.slot}:${body.wheel.from}` : candidate.fresh ? 'fresh' : body.dig ? `dig:${body.dig.base}:N${body.dig.level ?? '?'}` : body.cool ? `cool:${body.cool.source}` : `pool:${body.branch ?? ''}`
    rows.push({ session, position: rows.length + 1, type: candidate.type, path, theme: body.theme, id: candidate.payload?._id, key: candidate.key, title: String(candidate.payload?.title ?? candidate.payload?.text ?? ''), ...(stamp?.subject != null ? { subject: stamp.subject } : {}), ...(stamp?.author != null ? { author: stamp.author } : {}), visit })
  }
  device.fresh = fresh
  return rows
}

/** One device, several sessions in a row, its memory carried from one to the next. */
async function playDevice(session: number): Promise<Row[]> {
  const device = { seen: [] as string[], subjects: [] as number[], fresh: null as FreshSeen | null }
  const rows: Row[] = []
  for (let visit = 1; visit <= DEVICE_SESSIONS; visit += 1) rows.push(...await play(session, device, visit))
  return rows
}

async function main(): Promise<void> {
  const rows = (await Promise.all(Array.from({ length: SESSIONS }, (_, index) => playDevice(index + 1)))).flat()
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
  const isNews = (row: Row) => { const doc = docs.get(row.id ?? ''); return String(doc?.v3?.universe ?? '') === 'news-society' || isNewsTitle(doc?.title ?? row.title) }
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
    const news = visuals.filter((row) => row.type === 'video' && isNews(row)).length
    const languages = new Map<string, number>()
    for (const row of visuals.filter((row) => row.type === 'video')) { const code = titleLanguage(docs.get(row.id ?? '')?.title ?? row.title) ?? '?'; languages.set(code, (languages.get(code) ?? 0) + 1) }
    const topLanguage = [...languages].filter(([code]) => code !== '?').sort((a, b) => b[1] - a[1])[0]
    totals.visuals += visuals.length; totals.long += long; totals.still += still; totals.trailers += trailers; totals.gifs += gifs
    for (const row of visuals) shown.set(row.key, (shown.get(row.key) ?? 0) + 1)
    perSession.push(`| ${session} | ${visuals.length} | ${counts.size} | ${first20} | ${biggest[0]} ${pct(biggest[1], visuals.length)} | ${pct(counts.get('music') ?? 0, visuals.length)} | ${pct(counts.get('gaming') ?? 0, visuals.length)} | ${long} | ${still} | ${trailers} | ${gifs} | ${ai} | ${twice.map((subject) => subject.slice(7)).join(', ') || '—'} | ${news} | ${topLanguage ? `${topLanguage[0]} ${topLanguage[1]}` : '—'} |`)
  }
  lines.push('| Session | Visuels | Univers | Univers dans les 20 premiers | Plus gros univers | Musique | Jeu vidéo | Longs (>15 min) | Musique image fixe | Bandes-annonces | GIF Giphy | IA (signes) | Même sujet deux fois | Infos | Langue la plus fréquente |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|', ...perSession, '')
  const scripts = new Map<string, number>()
  for (const row of rows.filter((row) => row.type === 'video')) scripts.set(signs(row).script, (scripts.get(signs(row).script) ?? 0) + 1)
  const videoCount = rows.filter((row) => row.type === 'video').length
  lines.push(`Langue / écriture des titres des vidéos : ${[...scripts].sort((a, b) => b[1] - a[1]).map(([name, n]) => `${name} ${pct(n, videoCount)}`).join(' · ')}`, '')
  const detected = new Map<string, number>()
  for (const row of rows.filter((row) => row.type === 'video')) { const code = titleLanguage(docs.get(row.id ?? '')?.title ?? row.title) ?? 'inconnue'; detected.set(code, (detected.get(code) ?? 0) + 1) }
  lines.push(`Langue détectée (titres) : ${[...detected].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, n]) => `${name} ${pct(n, videoCount)}`).join(' · ')}`, '')
  const all = new Map<string, number>()
  for (const row of rows.filter(visual)) all.set(universe(row), (all.get(universe(row)) ?? 0) + 1)
  lines.push(`Ensemble : ${[...all].sort((a, b) => b[1] - a[1]).map(([name, n]) => `${name} ${pct(n, totals.visuals)}`).join(' · ')}`, '')
  const paths = new Map<string, number>()
  for (const row of rows.filter(visual)) paths.set(row.path, (paths.get(row.path) ?? 0) + 1)
  lines.push(`Par où : ${[...paths].sort((a, b) => b[1] - a[1]).map(([name, n]) => `${name} ${n}`).join(' · ')}`, '')
  lines.push(`Vus par deux appareils ou plus : ${[...shown.values()].filter((n) => n > 1).length} contenus sur ${shown.size}.`, '')
  if (DEVICE_SESSIONS > 1) {
    // The same subject or author again on the same device, in a later session: what the two-week memory must bring to zero.
    let again = 0, pairs = 0
    const examples: string[] = []
    for (let session = 1; session <= SESSIONS; session += 1) {
      const videos = rows.filter((row) => row.session === session && row.type === 'video')
      const earlier = new Map<number, string>()
      for (const row of videos) {
        const marks = [row.subject, row.author].filter((hash): hash is number => typeof hash === 'number')
        const hit = marks.find((hash) => earlier.has(hash) && earlier.get(hash) !== `${row.visit}`)
        pairs += 1
        if (hit !== undefined) { again += 1; if (examples.length < 8) examples.push(`${session}.${row.visit} ${row.title.slice(0, 50)}`) }
        for (const hash of marks) if (!earlier.has(hash)) earlier.set(hash, `${row.visit}`)
      }
    }
    lines.push(`Même sujet ou même chaîne revus par le même appareil dans une session suivante : **${again}** vidéos sur ${pairs} (${DEVICE_SESSIONS} sessions par appareil)${examples.length ? ` — ${examples.join(' · ')}` : ''}.`, '')
  }
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
