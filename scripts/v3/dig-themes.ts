/**
 * The theme list into the dig's queue, and a page of it for the owner.
 *
 *   node --env-file=.env.local --import tsx scripts/v3/dig-themes.ts          queues the themes (new ones added, known ones refreshed)
 *   node --env-file=.env.local --import tsx scripts/v3/dig-themes.ts --page   also writes docs/reports/dig-themes.html
 *   node --env-file=.env.local --import tsx scripts/v3/dig-themes.ts --dry    reads and checks the list, writes nothing
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { MongoClient } from 'mongodb'

import { enqueue, installQueueIndexes } from '@/lib/v3/dig/queue'
import { readThemes, themeSubject } from '@/lib/v3/dig/themes'

const dry = process.argv.includes('--dry')
const page = process.argv.includes('--page')
const PAGE = 'docs/reports/dig-themes.html'

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

async function main(): Promise<void> {
  const themes = readThemes()
  const byUniverse = new Map<string, typeof themes>()
  for (const theme of themes) byUniverse.set(theme.universe, [...(byUniverse.get(theme.universe) ?? []), theme])
  console.log(`${themes.length} thèmes, ${byUniverse.size} univers`)
  for (const [universe, list] of [...byUniverse].sort((left, right) => right[1].length - left[1].length)) console.log(`  ${universe.padEnd(18)} ${list.length}`)

  if (page) {
    const sections = [...byUniverse].sort((left, right) => left[0].localeCompare(right[0])).map(([universe, list]) => `<section><h2>${escape(universe)} <span class="n">${list.length}</span></h2><ul>${list.map((theme) => `<li><b>${escape(theme.fr)}</b> <span class="q">${escape(theme.en)}</span></li>`).join('')}</ul></section>`).join('\n')
    const html = `<title>Thèmes de la fouille</title>
<style>
:root{--bg:#F4F5F9;--ink:#171923;--muted:#646A7C;--line:#D8DBE6;--accent:#C2275A;--surface:#fff}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;--bg:#111318;--ink:#E7E9F0;--muted:#9BA1B3;--line:#2A2E3A;--accent:#FF6E93;--surface:#181B23}}
:root[data-theme="dark"]{color-scheme:dark;--bg:#111318;--ink:#E7E9F0;--muted:#9BA1B3;--line:#2A2E3A;--accent:#FF6E93;--surface:#181B23}
body{background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;padding-inline:16px}
.wrap{max-width:1100px;margin:0 auto;padding-block:28px 60px}
h1{font-size:30px;margin:0 0 6px}p.lead{color:var(--muted);max-width:70ch;margin:0 0 24px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}
section{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:14px 16px}
h2{font-size:15px;text-transform:uppercase;letter-spacing:.06em;margin:0 0 8px;color:var(--accent)}.n{color:var(--muted);font-weight:400;margin-left:6px}
ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:5px}li{display:flex;flex-direction:column}
.q{color:var(--muted);font-size:12px}
</style>
<div class="wrap"><h1>Les thèmes de la fouille</h1><p class="lead">${themes.length} thèmes, chacun fouillé comme une personne : ses vidéos les plus vues, puis autour (amateur, lieux, archives, gens, ratés, ailleurs, et chaque décennie), puis Dailymotion. En gris, les mots vraiment cherchés. Dis-moi ce que tu veux ajouter ou enlever.</p><div class="grid">${sections}</div></div>`
    mkdirSync(dirname(PAGE), { recursive: true })
    writeFileSync(PAGE, html)
    console.log(`page : ${PAGE}`)
  }
  if (dry) return

  const client = new MongoClient(process.env.MONGODB_URI as string, { serverSelectionTimeoutMS: 20000 })
  await client.connect()
  try {
    const db = client.db(process.env.MONGODB_DB || 'randomdb')
    await installQueueIndexes(db)
    const result = await enqueue(db, themes.map(themeSubject))
    console.log(`file : ${result.inserted} nouveaux thèmes, ${result.refreshed} rafraîchis`)
  } finally {
    await client.close()
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
