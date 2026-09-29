/**
 * What the dig brought in today, base by base, subject by subject, level by
 * level, with links: the page the owner judges the day on.
 *
 *   node --env-file=.env.local --import tsx scripts/v3/dig-report.ts            today
 *   node --env-file=.env.local --import tsx scripts/v3/dig-report.ts --day=2026-09-29
 *
 * Writes docs/reports/dig-<day>.md and docs/reports/dig-<day>.html. Reads by
 * the line index and the day's ids only: a few thousand rows.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { MongoClient, ObjectId, type Document } from 'mongodb'

import { QUEUE, type QueuedSubject } from '@/lib/v3/dig/queue'
import { RUNS } from '@/lib/v3/ingest/journal'
import type { DigBase, DigLevel, DigPass } from '@/lib/v3/types'

const flag = (name: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1]
const day = flag('day') ?? new Date().toISOString().slice(0, 10)
const BASE_LABEL: Record<DigBase, string> = { people: 'Personnes connues', keywords: 'Mots-clés', trends: 'Tendances', likes: 'Tes likes', snowball: 'Boule de neige' }
const PASS_LABEL: Record<DigPass, string> = { top: 'sommet', around: 'autour', channel: 'chaîne', dailymotion: 'Dailymotion' }
const LEVEL_RANGE: Record<DigLevel, string> = { 1: "plus d'1 M", 2: '100 k à 1 M', 3: '10 k à 100 k', 4: 'moins de 10 k' }
const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/�/g, '')
const views = (n: number | undefined) => (n == null ? '?' : n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace('.0', '').replace('.', ',')} M` : n >= 10_000 ? `${Math.round(n / 1000)} k` : String(n))
const watch = (row: Document) => (row.provider === 'dailymotion' ? `https://geo.dailymotion.com/player/x1nqci.html?video=${String(row.videoId).replace(/^dailymotion:/, '')}` : String(row.url))

type Row = { _id: ObjectId; title: string; provider: string; videoId: string; url: string; viewCount?: number; channelTitle?: string; duration?: string; v3?: { dig?: { subjectId: string; base: DigBase; level: DigLevel; pass: DigPass } } }

async function main(): Promise<void> {
  const client = new MongoClient(process.env.MONGODB_URI as string, { serverSelectionTimeoutMS: 20000 })
  await client.connect()
  try {
    const db = client.db(process.env.MONGODB_DB || 'randomdb')
    const start = new Date(`${day}T00:00:00Z`)
    const end = new Date(start.getTime() + 24 * 3600_000)
    const rows = await db.collection('items').find(
      { 'v3.line': 'dig', type: 'video', _id: { $gte: ObjectId.createFromTime(Math.floor(start.getTime() / 1000)), $lt: ObjectId.createFromTime(Math.floor(end.getTime() / 1000)) } } as Document,
      { projection: { title: 1, provider: 1, videoId: 1, url: 1, viewCount: 1, channelTitle: 1, duration: 1, 'v3.dig': 1 }, hint: 'v3_line_type_rand', maxTimeMS: 60_000 },
    ).toArray() as Row[]
    const runs = await db.collection(RUNS).find({ line: 'dig', startedAt: { $gte: start, $lt: end } } as Document, { projection: { status: 1, counters: 1, note: 1, errors: 1, startedAt: 1 } }).toArray()
    const subjectIds = [...new Set(rows.map((row) => row.v3?.dig?.subjectId).filter((id): id is string => Boolean(id)))]
    const subjects = new Map((await db.collection<QueuedSubject>(QUEUE).find({ _id: { $in: subjectIds } }, { projection: { label: 1, base: 1, fame: 1, source: 1 } }).toArray()).map((subject) => [subject._id, subject]))

    const byBase = new Map<DigBase, Map<string, Row[]>>()
    for (const row of rows) {
      const dig = row.v3?.dig
      if (!dig) continue
      const base = byBase.get(dig.base) ?? new Map<string, Row[]>()
      base.set(dig.subjectId, [...(base.get(dig.subjectId) ?? []), row])
      byBase.set(dig.base, base)
    }
    const levelCounts = [1, 2, 3, 4].map((level) => rows.filter((row) => row.v3?.dig?.level === level).length)
    const md: string[] = [`# La fouille du ${day}`, '', `${rows.length} vidéos entrées (niveaux ${levelCounts.join(' / ')}), ${runs.length} passage(s) : ${runs.map((run) => `${run.status} · ${String(run.note ?? '')}`).join(' ; ')}`, '']
    const html: string[] = []
    for (const [base, subjectsOfBase] of [...byBase].sort((left, right) => right[1].size - left[1].size)) {
      md.push(`## ${BASE_LABEL[base]} — ${subjectsOfBase.size} sujets, ${[...subjectsOfBase.values()].flat().length} vidéos`, '')
      html.push(`<section class="base"><h2>${escape(BASE_LABEL[base])} <span class="n">${subjectsOfBase.size} sujets · ${[...subjectsOfBase.values()].flat().length} vidéos</span></h2>`)
      for (const [subjectId, list] of [...subjectsOfBase].sort((left, right) => right[1].length - left[1].length)) {
        const subject = subjects.get(subjectId)
        const label = subject?.label ?? subjectId
        const fr = String((subject?.source as { fr?: string } | undefined)?.fr ?? '')
        const counts = [1, 2, 3, 4].map((level) => list.filter((row) => row.v3?.dig?.level === level).length)
        md.push(`### ${label}${fr ? ` (${fr})` : ''} — ${list.length} vidéos, niveaux ${counts.join('/')}`)
        html.push(`<article class="subject"><h3>${escape(fr || label)}${fr ? ` <span class="q">${escape(label)}</span>` : ''} <span class="n">${list.length} vidéos</span></h3><div class="levels">`)
        for (const level of [1, 2, 3, 4] as DigLevel[]) {
          const atLevel = list.filter((row) => row.v3?.dig?.level === level).sort((left, right) => (right.viewCount ?? 0) - (left.viewCount ?? 0))
          if (!atLevel.length) continue
          for (const row of atLevel.slice(0, 5)) md.push(`- N${level} · ${views(row.viewCount)} · ${PASS_LABEL[row.v3!.dig!.pass]} · [${row.title.slice(0, 90)}](${watch(row)})`)
          html.push(`<div class="level l${level}"><h4><span class="chip c${level}">N${level}</span><span class="rng">${LEVEL_RANGE[level]}</span><span class="cnt">${atLevel.length}</span></h4><ol>${atLevel.slice(0, 6).map((row) => `<li><a href="${escape(watch(row))}" target="_blank" rel="noopener">${escape(row.title)}</a><span class="meta">${views(row.viewCount)} · ${PASS_LABEL[row.v3!.dig!.pass]} · ${escape(String(row.channelTitle ?? '')).slice(0, 30)} · ${row.provider === 'dailymotion' ? 'Dailymotion' : 'YouTube'}</span></li>`).join('')}</ol></div>`)
        }
        html.push('</div></article>')
        md.push('')
      }
      html.push('</section>')
    }
    const page = `<title>La fouille du ${day}</title>
<style>
:root{--bg:#F1F2F6;--surface:#fff;--ink:#15171C;--muted:#5A6072;--line:#DADDE6;--accent:#C92A52;--c1:#1D2B53;--c2:#34569C;--c3:#5A82C6;--c4:#8FA7D6;--chip:#fff}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;--bg:#0F1117;--surface:#171A22;--ink:#E8EAF0;--muted:#9AA1B4;--line:#2A2F3B;--accent:#FF6B8D;--c1:#C3D3F7;--c2:#98B4EC;--c3:#7393D6;--c4:#56709F;--chip:#0F1117}}
:root[data-theme="dark"]{color-scheme:dark;--bg:#0F1117;--surface:#171A22;--ink:#E8EAF0;--muted:#9AA1B4;--line:#2A2F3B;--accent:#FF6B8D;--c1:#C3D3F7;--c2:#98B4EC;--c3:#7393D6;--c4:#56709F;--chip:#0F1117}
body{background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;padding-inline:16px}
.wrap{max-width:1200px;margin:0 auto;padding-block:28px 64px;display:flex;flex-direction:column;gap:28px}
h1{font-size:32px;margin:0}.lead{color:var(--muted);margin:0;max-width:72ch}
.base{display:flex;flex-direction:column;gap:16px}.base>h2{font-size:24px;margin:0;border-bottom:2px solid var(--ink);padding-bottom:6px}.n{color:var(--muted);font-weight:400;font-size:14px;margin-left:8px}
.subject{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:16px 18px}.subject h3{margin:0 0 10px;font-size:19px}.q{color:var(--muted);font-weight:400;font-size:14px}
.levels{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:14px}.level h4{margin:0 0 8px;display:flex;gap:8px;align-items:center;font-size:13px;font-weight:500;color:var(--muted)}
.chip{color:var(--chip);border-radius:4px;padding:1px 7px;font-weight:600;font-size:12px}.c1{background:var(--c1)}.c2{background:var(--c2)}.c3{background:var(--c3)}.c4{background:var(--c4)}.cnt{margin-left:auto;color:var(--ink)}
ol{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px}li{display:flex;flex-direction:column;border-left:3px solid var(--line);padding-left:9px;overflow-wrap:anywhere}
.l1 li{border-color:var(--c1)}.l2 li{border-color:var(--c2)}.l3 li{border-color:var(--c3)}.l4 li{border-color:var(--c4)}
a{color:var(--ink);text-decoration:none;font-size:14px;line-height:1.35}a:hover{color:var(--accent);text-decoration:underline}.meta{font-size:12px;color:var(--muted)}
</style>
<div class="wrap"><header><h1>La fouille du ${day}</h1><p class="lead">${rows.length} vidéos entrées : ${levelCounts[0]} au niveau 1 (mainstream), ${levelCounts[1]} au niveau 2, ${levelCounts[2]} au niveau 3, ${levelCounts[3]} au niveau 4 (confidentiel). Les 6 plus vues de chaque niveau ; clique pour regarder (Dailymotion dans le lecteur RANDOM).</p></header>${html.join('\n')}</div>`
    for (const [path, text] of [[`docs/reports/dig-${day}.md`, md.join('\n')], [`docs/reports/dig-${day}.html`, page]]) {
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, text)
    }
    console.log(`${rows.length} vidéos · ${byBase.size} bases · ${subjectIds.length} sujets · docs/reports/dig-${day}.{md,html}`)
  } finally {
    await client.close()
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
