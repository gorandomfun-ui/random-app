import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test, { before } from 'node:test'

import type { Document } from 'mongodb'

import { englishCatchUpPages, weeklyPages } from '@/lib/v3/anecdotes/pages'
import { AnecdoteSieve, readPage, type AnecdoteLang, type WikiPage } from '@/lib/v3/anecdotes/parse'
import { USER_AGENT, wikiClient } from '@/lib/v3/anecdotes/wiki'
import type { LineContext } from '@/lib/v3/ingest/context'
import { assessHealth, type JournalRun } from '@/lib/v3/ingest/report'

// The cards are made by lib/random/facts, whose lib/db opens a Mongo client as it loads: the tests point it at an
// address nobody serves and claim its failure, as tests/v3/routeAuth.test.ts does. Nothing here reaches a database.
process.env.MONGO_URI = 'mongodb://127.0.0.1:1/random_anecdotes_tests?serverSelectionTimeoutMS=50&connectTimeoutMS=50'
process.env.MONGODB_URI = process.env.MONGO_URI
// The catch-up's writes two cards at a time here, to see them grouped.
process.env.RANDOM_ANECDOTES_BATCH = '2'

let line: typeof import('@/lib/v3/ingest/lines/anecdotes')
let cards: typeof import('@/lib/v3/anecdotes/cards')
before(async () => {
  const mongoModule = (await import('@/lib/db')) as { default: Promise<unknown> }
  void mongoModule.default.catch(() => undefined)
  line = await import('@/lib/v3/ingest/lines/anecdotes')
  cards = await import('@/lib/v3/anecdotes/cards')
})

const fixture = (name: string) => readFileSync(path.join(__dirname, 'fixtures', name), 'utf8')
const page = (title: string, name: string): WikiPage => ({ title, html: fixture(name) })
const FR_PAGE = page('Wikipédia:Le saviez-vous ?/Archives', 'anecdotes-fr.html')
const EN_PAGE = page('Wikipedia:Did you know archive/2026/March', 'anecdotes-en.html')
const DE_PAGE = page('Wikipedia:Hauptseite/Schon gewusst/Archiv/2026/10', 'anecdotes-de.html')
const ES_PAGE = page('Wikipedia:¿Sabías que.../marzo de 2008', 'anecdotes-es.html')

const sift = (lang: AnecdoteLang, wiki: WikiPage, options: { months?: string[] } = {}) => {
  const reading = readPage(lang, wiki, { currentYear: 2026, ...options })
  const sieve = new AnecdoteSieve()
  return { reading, sieve, anecdotes: sieve.sift(reading.hooks) }
}

// ---------------------------------------------------------------- the four parsers

test('French: a hook per item, its picture marker gone, dated by its days on the main page — the same id the import of 20 October gave it', () => {
  const { reading, sieve, anecdotes } = sift('fr', FR_PAGE)
  assert.equal(reading.raw, 10)
  assert.deepEqual(reading.dropped, { deletedArticle: 1, truncated: 1, tooShort: 1, leftoverMarkup: 1, tooLong: 1 })
  assert.equal(sieve.duplicates, 1, 'the same anecdote shown twice is kept once')
  const island = anecdotes[0]
  assert.equal(island.id, 'fr-73f04c0ec112', 'the id stored on 20 October')
  assert.equal(island.text, 'L’île René-Levasseur est plus étendue que le lac qui l’entoure.', 'no "(image)"')
  assert.deepEqual(island.article, { title: 'Île René-Levasseur', url: 'https://fr.wikipedia.org/wiki/%C3%8Ele_Ren%C3%A9-Levasseur' })
  assert.equal(island.date, '2026-01-01')
  assert.equal(island.form, 'statement')
  assert.equal(island.source.pageUrl, 'https://fr.wikipedia.org/wiki/Wikip%C3%A9dia:Le_saviez-vous_%3F/Archives')
  const battle = anecdotes.find((anecdote) => anecdote.article.title === 'Bataille de Shrewsbury')!
  assert.equal(battle.id, 'fr-b8c4a3e4cfe9')
  assert.equal(battle.sensitive, true)
  assert.deepEqual(battle.sensitiveTerms, ['bataille'])
  assert.ok(battle.text.includes('futur Henri V qui') && !battle.text.includes('\u00A0'), 'the page\'s non-breaking spaces made plain')
  assert.equal(anecdotes.find((anecdote) => anecdote.date === '2026-04-01')?.aprilFools, true, 'an April fools\' hook is tagged, not refused')
  assert.equal(anecdotes.find((anecdote) => anecdote.article.title === 'Phare de Cordouan')?.timeRelative, true, '"actuellement" is tagged')
})

test('French: the page of the year read for two months keeps only their hooks', () => {
  const { reading, anecdotes } = sift('fr', FR_PAGE, { months: ['2026-09', '2026-10'] })
  assert.equal(reading.raw, 8, 'January and April left out')
  assert.deepEqual(anecdotes.map((anecdote) => anecdote.date), ['2026-10-03', '2026-10-17'])
})

test('English: "... that X?" becomes "X.", the date from the headings, the picture marker and the second "that" gone', () => {
  const { reading, anecdotes } = sift('en', EN_PAGE)
  assert.equal(reading.raw, 6, 'only the hooks: the timestamps and the "See also" list are not candidates')
  assert.deepEqual(reading.dropped, { deletedArticle: 1, tooShort: 1 })
  assert.deepEqual(anecdotes.map((anecdote) => anecdote.id), ['en-e493d88bc372', 'en-0de970941a28', 'en-0f948349da95', 'en-28870ff9d396'])
  assert.equal(anecdotes[0].text, 'Te Ahi Tupua is reportedly the largest 3D-printed sculpture in the world.')
  assert.equal(anecdotes[0].date, '2026-03-31')
  assert.equal(anecdotes[0].form, 'converted')
  assert.deepEqual(anecdotes[1].sensitiveTerms, ['war'])
  assert.equal(anecdotes[1].text.endsWith('World War II.'), true)
  assert.equal(anecdotes[2].text, 'The poet Mara Lindqvist wrote her first book on a night train and she never owned a pen.')
  assert.equal(anecdotes[3].text, 'It\'s "none of your damned business" how much American Furniture Warehouse paid Billy Carter.')
  assert.equal(anecdotes[3].date, '2026-03-01')
})

test('German: a teaser per box, soft hyphens gone, a missing period added, the old "... dass X?" kept as Wikipedia\'s question', () => {
  const { reading, anecdotes } = sift('de', DE_PAGE)
  assert.equal(reading.raw, 6)
  assert.deepEqual(reading.dropped, { tooShort: 1, deletedArticle: 1 })
  const [tiger, lighthouse, kasan, bumblebee] = anecdotes
  assert.equal(tiger.id, 'de-750d2e0a5404')
  assert.equal(tiger.text, 'Als ein Jäger die menschenfressende Chowgarh-Tigerin suchte, war sie auch ihm auf der Spur.')
  assert.equal(kasan.id, 'de-d0e47598d36a')
  assert.equal(kasan.article.title, 'Kasan (Kochgerät)')
  assert.equal(lighthouse.text, 'Der Grüne Leuchtturm von Kiel wurde zweimal versetzt, ohne je zu erlöschen.')
  assert.equal(bumblebee.text, 'Schon gewusst, dass die Hummel nach den Gesetzen der Aerodynamik angeblich nicht fliegen kann?')
  assert.equal(bumblebee.form, 'question')
  assert.equal(bumblebee.date, '2005-04-05')
})

test('Spanish: "... X?" becomes "X.", the references and the "editar" link gone, dated by the month of its page', () => {
  const { anecdotes } = sift('es', ES_PAGE)
  assert.equal(anecdotes[0].id, 'es-6c56dd3abe86')
  assert.equal(anecdotes[0].text, 'Las guitarras Ibanez se fabrican en Japón desde que la fábrica española quedó destruida durante la Guerra Civil.')
  assert.equal(anecdotes[0].date, '2008-03')
  assert.deepEqual(anecdotes[0].sensitiveTerms, ['guerra'])
  assert.equal(anecdotes[1].text, 'El río Escondido nace en una cueva y desemboca en otra cueva a solo dos kilómetros.')
})

test('what is stored counts as read before: the same words, or the same article reworded, is a repeat', () => {
  const { reading } = sift('en', EN_PAGE)
  const sieve = new AnecdoteSieve()
  sieve.remember('It\'s "none of your damned business" how much American Furniture Warehouse paid Billy Carter.', 'American Furniture Warehouse')
  sieve.remember('Te Ahi Tupua is reportedly the largest 3D-printed sculpture anywhere in the world.', 'Te Ahi Tupua')
  const kept = sieve.sift(reading.hooks)
  assert.deepEqual(kept.map((anecdote) => anecdote.article.title), ['Babe LeVoir', 'Mara Lindqvist'])
  assert.equal(sieve.duplicates, 2)
})

// ---------------------------------------------------------------- the cards

test('the card is the import\'s: credited, linked, licensed, keyed by the anecdote\'s id; the sensitive kept one in three by their hash', () => {
  const [island] = sift('fr', FR_PAGE).anecdotes
  const card = cards.anecdoteCard(island)!
  assert.equal(card.type, 'fact')
  assert.equal(card.provider, 'wikipedia')
  assert.equal(card.lang, 'fr')
  assert.equal(card.languageScope, 'localized')
  assert.equal(card.sourceKey, 'wikipedia-dyk:fr-73f04c0ec112')
  assert.equal(card.externalId, card.sourceKey)
  assert.equal(card.hash, createHash('sha1').update(`fact:${island.text.toLowerCase()}`).digest('hex'))
  assert.deepEqual(card.source, { name: 'Wikipédia', url: island.article.url })
  assert.deepEqual(card.license, { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr', note: 'adapté' })
  assert.deepEqual(card.dyk, { article: 'Île René-Levasseur', page: 'Wikipédia:Le saviez-vous ?/Archives', pageUrl: island.source.pageUrl, year: 2026, date: '2026-01-01', form: 'statement' })
  const battle = sift('fr', FR_PAGE).anecdotes.find((anecdote) => anecdote.sensitive)!
  assert.equal(cards.anecdoteCard(battle), null, 'this one falls in the two thirds set aside')
  const quarterback = sift('en', EN_PAGE).anecdotes[1]
  assert.equal(cards.anecdoteCard(quarterback)?.sensitive, true, 'this one in the third kept')
})

test('the line\'s insert writes the document the import\'s upsert created', () => {
  const [island] = sift('fr', FR_PAGE).anecdotes
  const card = cards.anecdoteCard(island)!
  const now = new Date('2026-10-26T10:03:00Z')
  const [insert] = cards.cardInserts([card], now) as Array<{ insertOne: { document: Document } }>
  const { rand, ...document } = insert.insertOne.document
  assert.ok(typeof rand === 'number' && rand >= 0 && rand < 1)
  assert.deepEqual(document, { ...card, updatedAt: now, createdAt: now })
  const [upsert] = cards.cardUpserts([card], now) as Array<{ updateOne: { filter: Document; update: { $set: Document } } }>
  assert.deepEqual(upsert.updateOne.filter, { type: 'fact', sourceKey: 'wikipedia-dyk:fr-73f04c0ec112' })
  assert.deepEqual(upsert.updateOne.update.$set, { ...card, updatedAt: now })
})

// ---------------------------------------------------------------- the pages and the API

test('the week reads the previous and the current month of each language, the previous first', () => {
  assert.deepEqual(weeklyPages(new Date('2026-10-26T10:03:00Z')), [
    { lang: 'fr', title: 'Wikipédia:Le saviez-vous ?/Archives', months: ['2026-09', '2026-10'] },
    { lang: 'en', title: 'Wikipedia:Did you know archive/2026/September' },
    { lang: 'en', title: 'Wikipedia:Did you know archive' },
    { lang: 'de', title: 'Wikipedia:Hauptseite/Schon gewusst/Archiv/2026/09' },
    { lang: 'de', title: 'Wikipedia:Hauptseite/Schon gewusst/Archiv/2026/10' },
  ])
  const january = weeklyPages(new Date('2027-01-04T10:03:00Z'))
  assert.deepEqual(january[0], { lang: 'fr', title: 'Wikipédia:Le saviez-vous ?/Archives/2026', months: ['2026-12', '2027-01'] }, 'December may already be in its year\'s page')
  assert.deepEqual(january.slice(2).map((wiki) => wiki.title), [
    'Wikipedia:Did you know archive/2026/December', 'Wikipedia:Did you know archive',
    'Wikipedia:Hauptseite/Schon gewusst/Archiv/2026/12', 'Wikipedia:Hauptseite/Schon gewusst/Archiv/2027/01',
  ])
})

test('the English catch-up reads every month the import did not, oldest first: never 2025, never a March', () => {
  const archive = 'Wikipedia:Did you know archive'
  assert.deepEqual(englishCatchUpPages([
    `${archive}/2010/June`, `${archive}/2004/February`, `${archive}/2025/April`, `${archive}/2010/March`, `${archive}/2026/March`,
    `${archive}/2026/January`, `${archive}/History`, `${archive}/2010/April`,
  ]), [`${archive}/2004/February`, `${archive}/2010/April`, `${archive}/2010/June`, `${archive}/2026/January`])
})

const apiAnswer = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

test('Wikipedia is asked one request at a time, a second apart, under our name; a busy answer is waited out, a missing page is null', async () => {
  const waits: number[] = []
  const agents: string[] = []
  let inFlight = 0
  let most = 0
  let calls = 0
  const http = (async (input: string | URL, init?: RequestInit) => {
    calls += 1
    inFlight += 1
    most = Math.max(most, inFlight)
    agents.push(String(new Headers(init?.headers).get('user-agent')))
    await new Promise((resolve) => setTimeout(resolve, 5))
    inFlight -= 1
    const title = new URL(String(input)).searchParams.get('page')
    if (calls === 1) return apiAnswer({}, 429, { 'retry-after': '2' })
    if (calls === 2) return apiAnswer({ error: { code: 'maxlag', info: 'Waiting for a database server' } }, 200, { 'retry-after': '5' })
    if (title === 'Missing') return apiAnswer({ error: { code: 'missingtitle', info: "The page you specified doesn't exist." } })
    return apiAnswer({ parse: { title, text: '<div class="mw-parser-output"></div>' } })
  }) as unknown as typeof fetch
  const client = wikiClient({ http, gapMs: 1100, wait: async (ms) => { waits.push(ms) } })
  const [first, missing, second] = await Promise.all([client.page('fr', 'One'), client.page('fr', 'Missing'), client.page('fr', 'Two')])
  assert.equal(most, 1, 'never two at once, whoever asks')
  assert.equal(first?.title, 'One')
  assert.equal(missing, null)
  assert.equal(second?.title, 'Two')
  assert.ok(agents.every((agent) => agent === USER_AGENT))
  assert.equal(USER_AGENT, 'RandomIngest/1.0 (+https://www.gorandom.fun)')
  assert.ok(waits.includes(2000), 'Retry-After honoured')
  assert.ok(waits.includes(5000), 'maxlag waited out')
  assert.ok(waits.filter((ms) => ms > 1000 && ms <= 1100).length >= 3, 'a second and a tenth between two requests')
})

// ---------------------------------------------------------------- the line

type StoredRow = { lang: string; sourceKey: string; text: string; dyk: { article: string } }

/** A base holding these cards: the line's read answered as Mongo would, its writes kept. */
function fakeBase(stored: StoredRow[], options: { failFor?: string } = {}) {
  const reads: Array<{ filter: Document; options: Document }> = []
  const writes: Document[][] = []
  const collection = () => ({
    find: (filter: Document, findOptions: Document) => ({
      toArray: async () => {
        reads.push({ filter, options: findOptions })
        if (filter.lang === options.failFor) throw new Error('operation exceeded time limit')
        const keys = filter.$or?.[0]?.sourceKey?.$in as string[] | undefined
        const articles = filter.$or?.[1]?.['dyk.article']?.$in as string[] | undefined
        return stored
          .filter((row) => row.lang === filter.lang)
          .filter((row) => !keys || keys.includes(row.sourceKey) || (articles ?? []).includes(row.dyk.article))
          .map(({ sourceKey, text, dyk }) => ({ sourceKey, text, dyk }))
      },
    }),
    bulkWrite: async (operations: Document[]) => {
      writes.push(operations)
      return { insertedCount: operations.length }
    },
  })
  return { db: { collection } as unknown as LineContext['db'], reads, writes }
}

/** Wikipedia answering with the fixtures, and "missing" for anything else. */
function fakeWikipedia(pages: Record<string, string>, asked: string[] = [], listing: string[][] = []) {
  let listed = 0
  return (async (input: string | URL) => {
    const url = new URL(String(input))
    if (url.searchParams.get('list') === 'allpages') {
      const titles = listing[listed] ?? []
      listed += 1
      return apiAnswer({ query: { allpages: titles.map((title) => ({ title })) }, ...(listed < listing.length ? { continue: { apcontinue: `next${listed}` } } : {}) })
    }
    const title = String(url.searchParams.get('page'))
    asked.push(`${url.host} ${title}`)
    if (!(title in pages)) return apiAnswer({ error: { code: 'missingtitle', info: 'missing' } })
    return apiAnswer({ parse: { title, text: pages[title] } })
  }) as unknown as typeof fetch
}

function context(db: LineContext['db'], http: typeof fetch, dryRun = false): LineContext {
  return {
    db, line: 'anecdotes', deadline: Date.now() + 600_000, timeLeft: () => 600_000, dryRun, cursor: null,
    quota: { reserve: async () => false, spent: () => 0 }, admit: async () => ({ scanned: 0, inserted: 0, duplicates: 0, rejected: {}, insertedIds: [] }),
    search: async () => undefined, log: () => undefined, http,
  }
}

const WEEK_PAGES = {
  'Wikipédia:Le saviez-vous ?/Archives': fixture('anecdotes-fr.html'),
  'Wikipedia:Did you know archive': fixture('anecdotes-en.html'),
  'Wikipedia:Hauptseite/Schon gewusst/Archiv/2026/10': fixture('anecdotes-de.html'),
}
const NOW = new Date('2026-10-26T10:03:00Z')
const STORED: StoredRow[] = [
  { lang: 'en', sourceKey: 'wikipedia-dyk:en-28870ff9d396', text: 'It\'s "none of your damned business" how much American Furniture Warehouse paid Billy Carter.', dyk: { article: 'American Furniture Warehouse' } },
  { lang: 'en', sourceKey: 'wikipedia-dyk:en-000000000001', text: 'Te Ahi Tupua is reportedly the largest 3D-printed sculpture anywhere in the world.', dyk: { article: 'Te Ahi Tupua' } },
]

test('the week: two months read in three languages, only what is not stored written, in one grouped insert, and the journal\'s note', async () => {
  const asked: string[] = []
  const base = fakeBase(STORED)
  const result = await line.run(context(base.db, fakeWikipedia(WEEK_PAGES, asked)), { now: NOW, gapMs: 0 })
  assert.deepEqual(asked, [
    'fr.wikipedia.org Wikipédia:Le saviez-vous ?/Archives',
    'en.wikipedia.org Wikipedia:Did you know archive/2026/September',
    'en.wikipedia.org Wikipedia:Did you know archive',
    'de.wikipedia.org Wikipedia:Hauptseite/Schon gewusst/Archiv/2026/09',
    'de.wikipedia.org Wikipedia:Hauptseite/Schon gewusst/Archiv/2026/10',
  ])
  assert.deepEqual(result.errors, [], 'a month not archived yet is no error')
  // One read a language, by the draw's language index, for these hooks' keys or their articles.
  assert.deepEqual(base.reads.map((read) => read.filter.lang), ['fr', 'en', 'de'])
  for (const read of base.reads) {
    assert.equal(read.options.hint, 'discovery_lang_rand_v2')
    assert.ok(Number(read.options.maxTimeMS) > 0)
    assert.equal(read.filter.type, 'fact')
    assert.equal(read.filter.languageScope, 'localized')
  }
  assert.equal(base.writes.length, 1, 'one grouped write for the week')
  const written = base.writes[0].map((operation) => (operation as { insertOne: { document: Document } }).insertOne.document)
  assert.deepEqual(written.map((card) => card.dyk.article), ['Phare de Cordouan', 'Babe LeVoir', 'Mara Lindqvist', 'Chowgarh-Tiger', 'Grüner Leuchtturm Kiel', 'Kasan (Kochgerät)', 'Hummel'])
  assert.ok(written.every((card) => card.type === 'fact' && card.languageScope === 'localized' && String(card.sourceKey).startsWith('wikipedia-dyk:') && card.createdAt instanceof Date && typeof card.rand === 'number'))
  assert.equal(result.counters.scanned, 20, 'September and October of the French year, the English and German pages')
  assert.equal(result.counters.inserted, 7)
  assert.equal(result.counters.duplicates, 3, 'the French one shown twice, the English one stored, the English one stored reworded')
  assert.deepEqual(result.counters.rejected, {
    'article supprimé': 3, 'phrase coupée': 1, 'trop courte': 3, 'balisage restant': 1, 'trop longue': 1, 'sensible, mise de côté (une sur trois gardée)': 1,
  })
  assert.equal((result.cursor as { note: string }).note, '7 nouvelles anecdotes (fr 1 · en 2 · de 4) · 3 déjà là')
})

test('the week run again writes nothing: what it wrote is stored', async () => {
  const first = fakeBase(STORED)
  await line.run(context(first.db, fakeWikipedia(WEEK_PAGES)), { now: NOW, gapMs: 0 })
  const stored = [...STORED, ...first.writes.flat().map((operation) => {
    const card = (operation as { insertOne: { document: Document } }).insertOne.document
    return { lang: String(card.lang), sourceKey: String(card.sourceKey), text: String(card.text), dyk: { article: String(card.dyk.article) } }
  })]
  const again = fakeBase(stored)
  const result = await line.run(context(again.db, fakeWikipedia(WEEK_PAGES)), { now: NOW, gapMs: 0 })
  assert.equal(again.writes.length, 0)
  assert.equal(result.counters.inserted, 0)
  assert.equal(result.counters.duplicates, 10)
  assert.equal((result.cursor as { note: string }).note, '0 nouvelles anecdotes (fr 0 · en 0 · de 0) · 10 déjà là')
})

test('a rehearsal writes nothing and says what it would enter; a language whose stored cards cannot be read is not written', async () => {
  const dry = fakeBase(STORED)
  const rehearsal = await line.run(context(dry.db, fakeWikipedia(WEEK_PAGES), true), { now: NOW, gapMs: 0 })
  assert.equal(dry.writes.length, 0)
  assert.equal(rehearsal.counters.inserted, 0)
  assert.equal((rehearsal.cursor as { note: string }).note, '7 nouvelles anecdotes à entrer (fr 1 · en 2 · de 4) · 3 déjà là')

  const failing = fakeBase(STORED, { failFor: 'de' })
  const result = await line.run(context(failing.db, fakeWikipedia(WEEK_PAGES)), { now: NOW, gapMs: 0 })
  assert.equal(result.counters.inserted, 3, 'French and English written, never German blind')
  assert.equal(result.errors.length, 1)
  assert.match(result.errors[0], /^de : lecture de ce qui est déjà là/)
})

test('the English catch-up: the months the import did not read, oldest first, against every English card stored, written a few at a time', async () => {
  const archive = 'Wikipedia:Did you know archive'
  const june = '<div class="mw-parser-output"><h3>1 June 2010</h3><ul><li>... that the lighthouse keeper <b><a href="/wiki/Ada_Varga" title="Ada Varga">Ada Varga</a></b> kept a diary of every ship she saw for forty years?</li></ul></div>'
  const asked: string[] = []
  const base = fakeBase(STORED)
  const http = fakeWikipedia({ [`${archive}/2004/February`]: fixture('anecdotes-en.html'), [`${archive}/2010/June`]: june }, asked, [
    [`${archive}/2004/February`, `${archive}/2010/March`, `${archive}/2025/April`],
    [`${archive}/2010/June`, `${archive}/History`],
  ])
  const result = await line.catchUpEnglish(context(base.db, http), { gapMs: 0, pauseMs: 0 })
  assert.deepEqual(asked, [`en.wikipedia.org ${archive}/2004/February`, `en.wikipedia.org ${archive}/2010/June`], 'the listing read to its end; no 2025, no March')
  assert.deepEqual(base.reads.map((read) => read.filter), [{ type: 'fact', languageScope: 'localized', lang: 'en', provider: 'wikipedia' }], 'every English card read once')
  assert.deepEqual(base.writes.map((operations) => operations.length), [2, 1], 'two cards a write in this test, the rest at the end')
  assert.equal(result.counters.inserted, 3, 'February\'s two new ones (one stored, one stored reworded), June\'s one')
  assert.equal(result.counters.duplicates, 2)
  assert.equal((result.cursor as { note: string }).note, '3 anecdotes anglaises rattrapées sur 2 mois lus (2 cartes par mois) · 2 déjà là')

  const one = fakeBase(STORED)
  const tried = await line.catchUpEnglish(context(one.db, fakeWikipedia({ [`${archive}/2010/June`]: june }, [], [[`${archive}/2004/February`, `${archive}/2010/June`]]), true), { gapMs: 0, pauseMs: 0, months: ['2010/June'] })
  assert.equal(one.writes.length, 0, 'a rehearsal writes nothing')
  assert.equal((tried.cursor as { note: string }).note, '1 anecdote anglaise rattrapée à entrer sur 1 mois lu (1 carte par mois) · 0 déjà là')
})

// ---------------------------------------------------------------- the report

test('a weekly line is judged on a week and a day: neither stopped nor silent between two Mondays', () => {
  const now = Date.UTC(2026, 9, 31, 12, 0, 0)
  const run = (name: string, hoursAgo: number, inserted: number): JournalRun => ({
    line: name, startedAt: new Date(now - hoursAgo * 3_600_000), finishedAt: new Date(now - hoursAgo * 3_600_000 + 60_000), status: inserted ? 'ok' : 'skipped',
    counters: { scanned: 600, inserted, duplicates: 0, rejected: {} },
  })
  const byLine = Object.fromEntries(assessHealth([run('anecdotes', 5 * 24, 120), run('dig', 30, 40)], now).map((row) => [row.line, row.state]))
  assert.equal(byLine.anecdotes, 'active', 'five days after its Monday')
  assert.equal(byLine.dig, 'arrêtée', 'a daily line still stops at a day')
  assert.equal(assessHealth([run('anecdotes', 9 * 24, 120)], now)[0].state, 'arrêtée', 'a Monday missed shows')
})
