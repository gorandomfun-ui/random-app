import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import type { Db } from 'mongodb'

import { giphySignals, parseTrendsRss, wikipediaSignals, youtubeSignals, type Signal } from '@/lib/v3/trend/signals'
import { DAILY_CAP, displayLabel, looksSensitive, mergeCandidates, qualifies, refusalOf, selectSubjects, textKey, type Candidate } from '@/lib/v3/trend/candidates'
import { MAX_TURNS, digSteps, discoverySubject, keepForStep } from '@/lib/v3/trend/dig'
import { run } from '@/lib/v3/ingest/lines/trend-subjects'
import type { AdmissionBatch, LineContext, SearchInput } from '@/lib/v3/ingest/context'
import type { RawVideo } from '@/lib/ingest/videos'

const fixture = readFileSync(path.join(__dirname, 'fixtures', 'trends-fr.xml'), 'utf8')
const DAY = '2026-09-22'

const signal = (source: Signal['source'], country: string, rank: number, title: string, extra: Partial<Signal> = {}): Signal => ({
  source, country, lang: 'en', rank, title, day: DAY, strong: source === 'google-trends' ? rank <= 5 : source === 'wikipedia' ? rank <= 10 : false, ...extra,
})

test('le flux RSS de Google Trends se lit : titre, rang, gros titres, trafic', () => {
  const signals = parseTrendsRss(fixture, 'FR', DAY)
  assert.equal(signals.length, 4)
  assert.equal(signals[0].title, 'glp1')
  assert.equal(signals[0].rank, 1)
  assert.equal(signals[0].strong, true)
  assert.equal(signals[0].traffic, 2000)
  assert.ok(signals[0].news?.[0]?.includes('Viking Therapeutics'), 'les gros titres disent de quoi parle la tendance')
  assert.equal(signals[1].title, 'laury thilleman')
  assert.equal(signals[3].title, 'hacker')
  assert.equal(signals[3].lang, 'fr')
})

test('les autres sources : Wikipédia (cent pages, dix fortes), Giphy (le sujet avant GIF), YouTube', () => {
  const articles = Array.from({ length: 130 }, (_, index) => ({ title: `Page_${index}`, views: 1000 - index, language: 'en' as const }))
  const wiki = wikipediaSignals(articles, 'US', DAY)
  assert.equal(wiki.length, 100)
  assert.equal(wiki[0].title, 'Page 0')
  assert.equal(wiki[0].page, 'Page_0')
  assert.equal(wiki[9].strong, true)
  assert.equal(wiki[10].strong, false)
  assert.deepEqual(giphySignals(['Will Ferrell GIF', 'Cat Basketball GIF by sillynub', null, 'stop GIF'], DAY).map((s) => s.title), ['Will Ferrell', 'Cat Basketball', 'stop'])
  assert.equal(youtubeSignals(['  Un titre ', ''], 'FR', DAY).length, 1)
  assert.equal(displayLabel('Black Rain (film)'), 'Black Rain')
})

test('trois orthographes du même nom font un candidat, deux sources, deux pays, un score', () => {
  const key = 'entity:lizzie-borden'
  const candidates = mergeCandidates([
    { key, label: 'Lizzie Borden', subjectId: key, signal: signal('google-trends', 'US', 1, 'lizzie borden') },
    { key, label: 'Lizzie Borden', subjectId: key, signal: signal('wikipedia', 'US', 3, 'Lizzie Borden') },
    { key, label: 'Lizzie Borden', subjectId: key, signal: signal('wikipedia', 'FR', 4, 'Lizzie Borden') },
    { key: textKey('glp1'), label: 'glp1', signal: signal('google-trends', 'FR', 1, 'glp1') },
  ])
  assert.equal(candidates.length, 2)
  const lizzie = candidates.find((c) => c.key === key)!
  assert.equal(lizzie.signals.length, 3)
  assert.deepEqual(lizzie.sources, ['google-trends', 'wikipedia'])
  assert.deepEqual(lizzie.countries, ['US', 'FR'])
  assert.equal(lizzie.strong, true)
  // trois signaux forts (3 × 3) + une source de plus (3) + un pays de plus (2)
  assert.equal(lizzie.score, 14)
  assert.ok(lizzie.score > candidates.find((c) => c.key !== key)!.score)
})

test('un sujet du jour : deux sources, ou deux pays, ou un signal fort ; quinze au plus', () => {
  const weak: Candidate = { key: 'a', label: 'a', signals: [signal('giphy', 'WW', 20, 'a')], sources: ['giphy'], countries: ['WW'], strong: false, score: 1 }
  assert.equal(qualifies(weak), false)
  assert.equal(qualifies({ ...weak, sources: ['giphy', 'youtube'] }), true)
  assert.equal(qualifies({ ...weak, countries: ['FR', 'DE'] }), true)
  assert.equal(qualifies({ ...weak, strong: true }), true)
  const many = Array.from({ length: 40 }, (_, index) => ({ ...weak, key: `k${index}`, label: `sujet ${index}`, strong: true, score: index }))
  const chosen = selectSubjects(many)
  assert.equal(chosen.length, DAILY_CAP)
  assert.equal(chosen[0].score, 39, 'les meilleurs scores d_abord')
})

test('refus : actualité-société, classes sensibles, mots sensibles, personne vivante en fait divers, mot vague', () => {
  const base: Candidate = { key: 'x', label: 'Someone', signals: [signal('google-trends', 'US', 1, 'someone')], sources: ['google-trends'], countries: ['US'], strong: true, score: 3 }
  assert.equal(refusalOf({ ...base, universe: 'news-society' }), 'news-society')
  assert.equal(refusalOf({ ...base, universe: 'other', instances: ['Q4'] }), 'sensitive-class')
  assert.equal(refusalOf({ ...base, universe: 'cinema-tv', description: 'American murder case of 1892' }), 'sensitive')
  assert.equal(refusalOf({ ...base, universe: 'music', isHuman: true, signals: [signal('google-trends', 'US', 1, 'someone', { news: ['Singer arrested after crash'] })] }), 'sensitive')
  assert.equal(refusalOf({ ...base, label: '千葉小3女児殺害事件', universe: 'other' }), 'sensitive', 'un titre japonais dit lui-même qu_il s_agit d_un meurtre')
  assert.equal(refusalOf({ ...base, label: 'Attack on Titan', universe: 'animation', description: 'Japanese manga series' }), null, 'un mot du titre ne condamne pas une œuvre')
  assert.equal(refusalOf({ ...base, label: 'hacker', universe: 'other' }), 'vague')
  assert.equal(refusalOf({ ...base, label: 'Music video', universe: 'other' }), 'vague', 'une notion sans monde à elle n_est pas un sujet du jour')
  assert.equal(refusalOf({ ...base, label: 'Someone', universe: 'other', isHuman: true }), null, 'une personne l_est toujours')
  assert.equal(refusalOf({ ...base, label: 'Lizzie Borden', universe: 'people-everyday', isHuman: true, description: 'American woman (1860–1927)' }), null)
  assert.equal(looksSensitive({ news: ['Élections municipales : les résultats'] }), true)
})

test('la fouille suit l_échelle des likes, trois tours au plus, et ne garde que ce qui nomme le sujet', () => {
  const steps = digSteps({ id: 'entity:laury-thilleman', label: 'Laury Thilleman', aliases: ['laury thilleman'] }, Date.UTC(2026, 8, 22))
  assert.ok(steps.length <= MAX_TURNS)
  assert.equal(steps[0].label, 'name:laury thilleman')
  assert.equal(steps[0].youtube.length, 2, 'le nom : le plus vu, puis le plus récent')
  assert.deepEqual(steps[0].youtube.map((s) => (s.kind === 'search' ? s.order : '')), ['viewCount', 'date'])
  assert.equal(steps[0].dailymotion.length, 1)
  assert.deepEqual(steps[0].images, ['laury thilleman'])
  assert.equal(steps[1].label, 'pair:laury thilleman')
  const focus = discoverySubject({ id: 'entity:laury-thilleman', label: 'Laury Thilleman', aliases: ['laury thilleman'] })
  const video = (id: string, title: string, channelId = `c${id}`): RawVideo => ({ videoId: id, url: `https://youtu.be/${id}`, provider: 'youtube', title, channelId })
  const kept = keepForStep([video('a', 'Laury Thilleman en interview'), video('b', 'Une vidéo sans rapport'), video('c', 'Laury Thilleman à Miss France')], focus)
  assert.deepEqual(kept.map((v) => v.videoId), ['a', 'c'])
})

/** The world as the fake feeds tell it. */
const WORLD = {
  trends: {
    FR: fixture,
    US: '<rss><channel><item><title>lizzie borden</title><ht:approx_traffic>500+</ht:approx_traffic><ht:news_item><ht:news_item_title>Lizzie Borden series premieres</ht:news_item_title></ht:news_item></item><item><title>meme</title><ht:approx_traffic>200+</ht:approx_traffic></item></channel></rss>',
    DE: '<rss><channel></channel></rss>', ES: '<rss><channel></channel></rss>', JP: '<rss><channel></channel></rss>',
  } as Record<string, string>,
  wikipedia: {
    en: ['Main_Page', 'Lizzie_Borden', 'Cindy_Crawford', 'Hacker', 'Special:Search'],
    fr: ['Wikipédia:Accueil_principal', 'Lizzie_Borden', 'Laury_Thilleman'],
    ja: ['メインページ', '千葉小3女児殺害事件'],
    de: ['Tagesschau'], es: [],
  } as Record<string, string[]>,
  giphyTrending: ['Will Ferrell GIF', 'Lizzie Borden GIF by Lifetime'],
  mostPopular: { US: ['Lizzie Borden official trailer'], FR: [], DE: [], ES: [], JP: [] } as Record<string, string[]>,
}
const entity = (qid: string, label: string, options: { instances?: string[]; occupations?: string[]; description?: string; sitelinks?: Record<string, string>; aliases?: string[] } = {}) => ({
  labels: { en: { value: label } },
  descriptions: options.description ? { en: { value: options.description } } : {},
  aliases: { en: (options.aliases ?? []).map((value) => ({ value })) },
  claims: {
    P31: (options.instances ?? []).map((id) => ({ mainsnak: { datavalue: { value: { id } } } })),
    P106: (options.occupations ?? []).map((id) => ({ mainsnak: { datavalue: { value: { id } } } })),
  },
  sitelinks: Object.fromEntries(Object.entries(options.sitelinks ?? {}).map(([site, title]) => [site, { title }])),
})
const ENTITIES: Record<string, ReturnType<typeof entity>> = {
  Q1: entity('Q1', 'Lizzie Borden', { instances: ['Q5'], description: 'American woman (1860–1927)', sitelinks: { enwiki: 'Lizzie_Borden', frwiki: 'Lizzie_Borden' }, aliases: ['Lizzie Andrew Borden'] }),
  Q2: entity('Q2', 'Laury Thilleman', { instances: ['Q5'], occupations: ['Q4610556'], description: 'Miss France 2011', sitelinks: { frwiki: 'Laury_Thilleman' } }),
  Q3: entity('Q3', 'Hacker', { instances: [], description: 'person skilled in computers', sitelinks: { enwiki: 'Hacker' } }),
  Q40: entity('Q40', 'Chiba girl murder case', { instances: ['Q132821'], sitelinks: { jawiki: '千葉小3女児殺害事件' } }),
  Q50: entity('Q50', 'Tagesschau', { instances: ['Q11032'], sitelinks: { dewiki: 'Tagesschau' } }),
  Q60: entity('Q60', 'Ars-sur-Moselle', { instances: ['Q515'], description: 'commune in Moselle, France', sitelinks: { frwiki: 'Ars-sur-Moselle' } }),
  Q70: entity('Q70', 'Meme', { instances: [], description: 'idea that spreads by imitation' }),
  Q80: entity('Q80', 'Cindy Crawford', { instances: ['Q5'], occupations: ['Q4610556'], description: 'American model' }),
}
const SEARCH: Record<string, string> = { 'laury thilleman': 'Q2', 'ars-sur-moselle': 'Q60', hacker: 'Q3', 'lizzie borden': 'Q1', meme: 'Q70', 'cindy crawford': 'Q80' }

let giphyRefuses = false
function fakeHttp(counts: Record<string, number>) {
  const json = (body: unknown) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) }) as unknown as Response
  const text = (body: string) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({}), text: async () => body }) as unknown as Response
  return (async (input: string | URL | Request) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const hit = (name: string) => { counts[name] = (counts[name] ?? 0) + 1 }
    if (url.hostname === 'trends.google.com') { hit('trends'); return text(WORLD.trends[url.searchParams.get('geo') ?? ''] ?? '<rss/>') }
    if (url.hostname === 'wikimedia.org') {
      hit('wikipedia')
      const language = /top\/(\w+)\.wikipedia/.exec(url.pathname)?.[1] ?? 'en'
      return json({ items: [{ articles: (WORLD.wikipedia[language] ?? []).map((article, index) => ({ article, views: 1000 - index })) }] })
    }
    if (url.hostname === 'api.giphy.com' && url.pathname.endsWith('/trending')) { hit('giphy-trending'); return json({ data: WORLD.giphyTrending.map((title) => ({ title })) }) }
    if (url.hostname === 'api.giphy.com' && giphyRefuses) { hit('giphy-search'); return { ok: false, status: 429, headers: { get: () => null }, json: async () => ({ meta: { status: 429 } }), text: async () => '' } as unknown as Response }
    if (url.hostname === 'api.giphy.com') { hit('giphy-search'); return json({ data: [{ title: `${url.searchParams.get('q')} GIF`, url: 'https://giphy.com/gifs/x', images: { original: { url: `https://media.giphy.com/media/${counts['giphy-search']}/giphy.gif` } } }] }) }
    if (url.hostname === 'www.googleapis.com' && url.pathname.endsWith('/videos')) { hit('youtube-popular'); return json({ items: (WORLD.mostPopular[url.searchParams.get('regionCode') ?? ''] ?? []).map((title) => ({ snippet: { title } })) }) }
    if (url.hostname === 'www.googleapis.com' && url.pathname.endsWith('/search')) {
      hit('youtube-search')
      const q = (url.searchParams.get('q') ?? '').replace(/"/g, '')
      const n = counts['youtube-search']
      return json({ items: [
        { id: { videoId: `v${String(n).padStart(8, '0')}a1` }, snippet: { title: `${q} documentary 1975`, channelId: 'chan1', channelTitle: 'Archives' } },
        { id: { videoId: `v${String(n).padStart(8, '0')}b2` }, snippet: { title: `${q} house tour`, channelId: 'chan2', channelTitle: 'Tours' } },
        { id: { videoId: `v${String(n).padStart(8, '0')}c3` }, snippet: { title: 'Unrelated cooking video', channelId: 'chan3' } },
        { id: { videoId: `v${String(n).padStart(8, '0')}d4` }, snippet: { title: `${q} feet fetish HD`, channelId: 'chan4' } },
      ] })
    }
    if (url.hostname === 'api.dailymotion.com') { hit('dailymotion'); const q = url.searchParams.get('search') ?? ''; return json({ list: [{ id: `x${counts.dailymotion}ab`, title: `${q.replace(/"/g, '')} reportage`, owner: { id: 'o1' } }] }) }
    if (url.hostname === 'www.wikidata.org') {
      const action = url.searchParams.get('action')
      if (action === 'wbsearchentities') { hit('wikidata-search'); const qid = SEARCH[(url.searchParams.get('search') ?? '').toLowerCase()]; return json({ search: qid ? [{ id: qid, description: ENTITIES[qid].descriptions.en?.value }] : [] }) }
      hit('wikidata-entities')
      const ids = url.searchParams.get('ids')?.split('|')
      const titles = url.searchParams.get('titles')?.split('|') ?? []
      const site = url.searchParams.get('sites') ?? ''
      const entities: Record<string, unknown> = {}
      for (const [qid, value] of Object.entries(ENTITIES)) {
        if (ids ? ids.includes(qid) : titles.some((title) => value.sitelinks[site]?.title === title)) entities[qid] = value
      }
      return json({ entities })
    }
    throw new Error(`unexpected request ${url.href}`)
  }) as typeof fetch
}

function fakeContext(options: { dryRun?: boolean; units?: number } = {}) {
  const counts: Record<string, number> = {}
  const writes: Record<string, unknown[]> = {}
  const record = (name: string, op: unknown) => { (writes[name] ??= []).push(op) }
  const dictionary = [{ _id: 'entity:cindy-crawford', label: 'Cindy Crawford', universe: 'fashion', kind: 'entity', aliases: ['cindy crawford'], ambiguous: false }]
  const db = {
    collection: (name: string) => ({
      find: (filter: { aliases?: { $in: string[] } }) => ({
        toArray: async () => (name === 'subjects_v3' && filter.aliases ? dictionary.filter((row) => row.aliases.some((alias) => filter.aliases!.$in.includes(alias))) : []),
      }),
      countDocuments: async () => 0,
      insertMany: async (docs: unknown[]) => { record(name, { insertMany: docs }); return {} },
      bulkWrite: async (ops: unknown[]) => { record(name, { bulkWrite: ops }); return {} },
      updateOne: async (filter: unknown, update: unknown) => { record(name, { updateOne: [filter, update] }); return {} },
    }),
  } as unknown as Db
  const limit = options.units ?? 2000
  let spent = 0
  const admitted: AdmissionBatch[] = []
  const searches: SearchInput[] = []
  const logs: string[] = []
  const ctx: LineContext = {
    db, line: 'trend', deadline: Date.now() + 10 * 60_000, timeLeft: () => 10 * 60_000, dryRun: options.dryRun ?? false, cursor: null,
    quota: { reserve: async (units) => { if (spent + units > limit) return false; spent += units; return true }, spent: () => spent },
    admit: async (batch) => { admitted.push(batch); const n = (batch.videos?.length ?? 0) + (batch.images?.length ?? 0); return { scanned: n, inserted: n, duplicates: 0, rejected: {}, insertedIds: [] } },
    search: async (search) => { searches.push(search) },
    log: (message) => { logs.push(message) },
    http: fakeHttp(counts),
  }
  return { ctx, counts, writes, admitted, searches, logs, spent: () => spent }
}

test('la ligne : des signaux aux sujets du jour, puis la fouille dans le budget', async () => {
  process.env.GIPHY_API_KEY ||= 'test-giphy'
  process.env.YOUTUBE_API_KEY ||= 'test-youtube'
  const fake = fakeContext()
  const result = await run(fake.ctx)
  const subjects = (result.cursor as { subjects: Array<{ id: string; label: string; universe: string; sources: string[]; countries: string[] }> }).subjects
  const labels = subjects.map((s) => s.label)
  assert.ok(labels.includes('Lizzie Borden'), `Lizzie Borden : deux sources, deux pays (${labels.join(', ')})`)
  assert.ok(labels.includes('Laury Thilleman'), 'tendance FR n°2 + Wikipédia fr')
  assert.ok(labels.includes('Cindy Crawford'), 'un nom du dictionnaire en tête de Wikipédia, vérifié sur Wikidata')
  assert.ok((fake.counts['wikidata-search'] ?? 0) >= 1, 'les sujets du dictionnaire passent aussi par Wikidata')
  assert.ok(labels.includes('Ars-sur-Moselle'), 'une tendance forte seule suffit')
  assert.ok(!labels.some((label) => /murder|Chiba/.test(label)), 'un meurtre n_est pas un sujet')
  assert.ok(!labels.includes('Tagesschau'), 'actualité-société refusée')
  assert.ok(!labels.includes('Hacker'), 'une tendance dont les gros titres sont un fait divers est refusée')
  assert.ok(!labels.includes('Meme'), 'un mot vague refusé')
  assert.ok(subjects.every((s) => s.universe !== 'news-society'))
  assert.ok(subjects.length <= DAILY_CAP)
  const lizzie = subjects.find((s) => s.label === 'Lizzie Borden')!
  assert.equal(lizzie.id, 'entity:lizzie-borden')
  assert.ok(lizzie.sources.length >= 2 && lizzie.countries.length >= 2)
  assert.equal(result.counters.rejected['sensitive-class'], 1)
  assert.equal(result.counters.rejected['news-society'], 1)
  assert.equal(result.counters.rejected.sensitive, 1, 'hacker : ses gros titres parlent d_une arrestation')
  assert.equal(result.counters.rejected.vague, 1, 'meme : un mot commun sans rien derrière')
  assert.equal(result.counters.rejected.unresolved, 1, 'glp1 ne se résout pas')

  // La fouille : le nom entre guillemets, le plus vu puis le plus récent, tout dans le budget.
  const youtube = fake.searches.filter((s) => s.provider === 'youtube')
  assert.ok(youtube.length >= 2)
  assert.equal(youtube[0].query, '"lizzie borden"')
  assert.equal(youtube[0].quotaUnits, 100)
  assert.ok(fake.spent() <= 2000, `unités YouTube ${fake.spent()}`)
  assert.equal(fake.counts['youtube-search'], youtube.length)
  assert.ok(fake.searches.some((s) => s.provider === 'dailymotion') && fake.searches.some((s) => s.provider === 'giphy'))
  assert.ok(fake.admitted.every((batch) => (batch.videos ?? []).every((video) => video.trendObservedAt instanceof Date)), 'les vidéos portent le jour du signal')
  assert.ok(fake.admitted.some((batch) => (batch.videos ?? []).length === 2), 'la vidéo sans rapport et le déchet ne sont pas gardés')
  assert.ok((result.counters.rejected.unclean ?? 0) >= 1, 'le déchet est compté refusé')
  assert.ok(result.counters.inserted > 0)
  assert.ok((fake.writes.subjects_v3 ?? []).some((op) => 'bulkWrite' in (op as object)), 'les sujets du jour sont écrits')
  assert.ok((fake.writes.trend_signals_v3 ?? []).length === 1, 'les signaux sont journalisés')
  assert.deepEqual(result.errors, [])
})

test('le budget YouTube arrête la fouille YouTube, pas la ligne', async () => {
  const fake = fakeContext({ units: 205 })
  const result = await run(fake.ctx)
  assert.ok(fake.spent() <= 205)
  assert.equal(fake.searches.filter((s) => s.provider === 'youtube').length, 2, 'cinq unités pour les plus populaires, puis deux recherches')
  assert.ok(fake.searches.filter((s) => s.provider === 'dailymotion').length >= 3, 'Dailymotion continue sans YouTube')
  assert.ok(fake.logs.some((line) => line.includes('budget du jour atteint')))
  assert.deepEqual(result.errors, [])
})

test('Giphy : une image par sujet, et plus aucune après un refus horaire ; la ligne continue', async () => {
  giphyRefuses = true
  try {
    const fake = fakeContext()
    const result = await run(fake.ctx)
    assert.equal(fake.counts['giphy-search'], 1, 'un seul appel après le 429')
    assert.equal(result.errors.filter((line) => line.startsWith('giphy')).length, 1)
    assert.ok(fake.logs.some((line) => line.includes('limite horaire')))
    assert.ok(result.counters.inserted > 0, 'les vidéos continuent')
  } finally {
    giphyRefuses = false
  }
})

test('à blanc : les sujets sont listés, rien n_est fouillé ni écrit', async () => {
  const fake = fakeContext({ dryRun: true })
  const result = await run(fake.ctx)
  const subjects = (result.cursor as { subjects: unknown[] }).subjects
  assert.ok(subjects.length >= 3)
  assert.equal(fake.admitted.length, 0)
  assert.equal(fake.searches.length, 0)
  assert.equal(Object.keys(fake.writes).length, 0)
  assert.equal(fake.counts['youtube-search'], undefined)
})
