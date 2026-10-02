'use client'

import React, { useCallback, useEffect, useState } from 'react'

/**
 * What the ingestion did, day by day.
 *
 * The page it replaces summed the last thirty runs, so an outage disappeared
 * behind the days before it, and it stored the admin key in the browser.
 * Here each day stands alone, and a line that ran without inserting anything
 * says so — that state is what hid a dead trending line for eight days.
 */

type StatusCounts = Partial<Record<'ok' | 'partial' | 'skipped' | 'failed' | 'interrompu' | 'en cours', number>>
type LineRow = { line: string; inserted: number; scanned: number; runs: number; errors: number | string[]; providers?: Record<string, number>; searches: string[]; statuses?: StatusCounts; duplicates?: number; note?: string; providersFrom?: 'runs' | 'searches' }
type DayRow = { day: string; lines: LineRow[]; total: number }
type HealthState = 'active' | 'sans insertion' | 'arrêtée' | 'muette' | 'en cours'
type HealthRow = { line: string; lastRunAt: string | null; hoursAgo?: number; hoursSinceRun?: number | null; hoursSinceInsert?: number | null; state: HealthState }

const STATE_STYLE: Record<HealthState, { background: string; color: string }> = {
  active: { background: '#e8f5e9', color: '#1b5e20' },
  'en cours': { background: '#e3f2fd', color: '#0d47a1' },
  'sans insertion': { background: '#fff8e1', color: '#8d6e00' },
  muette: { background: '#ffebee', color: '#b71c1c' },
  arrêtée: { background: '#ffebee', color: '#b71c1c' },
}

const STATUS_STYLE: Record<keyof StatusCounts, string> = {
  ok: '#1b5e20', partial: '#8d6e00', skipped: '#8d6e00', failed: '#b71c1c', interrompu: '#b71c1c', 'en cours': '#0d47a1',
}

const LINE_LABEL: Record<string, string> = {
  trend: 'Tendances',
  trending: 'Tendances',
  'trend-subjects': 'Tendances-sujets',
  'retro-trend': 'Rétro',
  retro: 'Rétro',
  combo: 'Combinaisons',
  'combo-videos': 'Combinaisons',
  'like-dig': 'Fouille des likes',
  'subject-dig': 'Fouille des sujets',
  web: 'Sites web',
  texts: 'Textes',
  discovery: 'Découverte',
  enrich: 'Enrichissement',
  'enrich-videos': 'Enrichissement',
  repair: 'Réparations',
  images: 'Images',
  'like-pool': 'Pool des likes',
  pools: 'Pools par univers',
  feeds: 'Sources humaines',
  authors: 'Auteurs suivis',
  'music-live': 'Musique live',
  fresh: 'Frais du jour',
  dig: 'La fouille (4 bases)',
  drift: 'La dérive (Dailymotion)',
  'web-previews': 'Sites : visites et aperçus',
}

const hoursOf = (row: HealthRow) => row.hoursSinceRun ?? row.hoursAgo ?? 0

type ServerStatus = {
  host: string
  at: string
  uptimeHours: number
  load1: number
  memory?: { totalMB: number; freeMB: number }
  disk?: { totalGB: number; freeGB: number }
  lastRun?: { line: string; status: string; inserted: number } | null
  hoursSinceSuccess?: number | null
  trouble?: string | null
}

const minutesAgo = (iso: string) => Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000))

type UniverseRecapRow = { day: string; at: string; sizes: Record<string, number>; added: Record<string, number> }
type FreshReport = { day: string; total: number; counts: Record<string, number>; first: string[] }
type WebReport = { bySource: Record<string, Record<string, number>>; googleToday: number; googleCap: number }
type DigReport = {
  day: string; total: number; levels: Record<string, number>; bases: Record<string, number>
  queue: Array<{ base: string; state: string; n: number }>; countries: Array<{ country: string; n: number }>
  subjects: Array<{ id: string; label: string; fr?: string; base: string; fame: string; passes: number; ingested: number; lastRunAt?: string; sample: string[] }>
  runs: Array<{ startedAt: string; status: string; note?: string; errors: number }>
}
type KeptCardsRow = { day: string; cards: Record<string, { n: number; seconds: number; dislikes?: number }> }
type CardCensusRow = { day: string; at: string; total: number; cards: Record<string, number>; refused: { ai: number; still: number } }
const CARD_LABEL: Record<string, string> = { buzz: 'Buzz', long: 'Long', retro: 'Rétro', taste: 'Goût', world: 'Monde', short: 'Court', deep: 'Confidentiel', weird: 'Weird / fun', 'bonus:music': 'Bonus musique', 'bonus:gaming': 'Bonus jeu vidéo', 'bonus:humor-memes': 'Bonus drôle' }
const DIG_BASE: Record<string, string> = { people: 'Personnes', keywords: 'Mots-clés', trends: 'Tendances', likes: 'Likes', snowball: 'Boule de neige' }
const DIG_STATE: Record<string, string> = { queued: 'en attente', running: 'en cours', done: 'faits', exhausted: 'épuisés', paused: 'en pause' }
const DIG_FAME: Record<string, string> = { star: 'star', known: 'connu', small: 'petit' }
const WEB_SOURCE: Record<string, string> = { 'google-cse': 'Google', hn: 'Show HN', 'set-aside': 'Sites mis de côté', osm: 'OpenStreetMap', wikidata: 'Wikidata' }
const WEB_STATUS: Array<[string, string]> = [['new', 'en attente'], ['done', 'ajoutés'], ['dead', 'morts'], ['dull', 'sans intérêt'], ['noimage', 'page vide'], ['failed', 'échecs']]
const FRESH_ZONE: Record<string, string> = {
  world: 'Monde', usa: 'USA', europe: 'Europe', asia: 'Asie', africa: 'Afrique', 'east-europe': 'Europe de l\u2019Est', oceania: 'Océanie', music: 'Musique', fun: 'Fun',
  sport: 'Sport', animals: 'Animaux', science: 'Sciences', howto: 'Pratique', people: 'Gens', autos: 'Autos', film: 'Films et animation',
}
type MiniSeriesReport = {
  days: Array<{ day: string; total: number; byDetail: Record<string, number> }>
  examples: Array<{ at: string; title: string; provider: string; detail: string; channel?: string }>
  studios: Array<{ name: string; refused: number; kept: number }>
}

/** Why a title was taken for a mini-series, as the report says it. */
const MINI_SERIES_REASON: Record<string, string> = {
  label: 'étiquette', studio: 'studio', cjk: 'titre chinois', trope: 'cliché', 'ai-story': 'histoire IA', narrative: 'titre-récit',
  shape: 'verticale longue', scam: 'arnaque', 'product-top': 'top produits', 'ai-channel': 'chaîne IA', 'ai-marked': 'marquée IA',
}
const UNIVERSE_LABEL: Record<string, string> = {
  music: 'Musique', sport: 'Sport', gaming: 'Gaming', 'humor-memes': 'Humour', 'events-parties': 'Fête', food: 'Food', travel: 'Découverte', craft: 'Astuces / artisanat',
  'cinema-tv': 'Cinéma-TV', 'nature-animals': 'Animaux / nature', animation: 'Animation', art: 'Art', science: 'Science', tech: 'Tech', history: 'Histoire', vehicles: 'Véhicules',
  fashion: 'Mode', 'people-everyday': 'Gens', 'news-society': 'Actualité', other: 'Non classé',
}

const label = (line: string) => LINE_LABEL[line] ?? line

/** "youtube 4 250 (92 %) · dailymotion 373 (8 %)": what a line wrote, by provider, with its share. */
function providerShares(providers: Record<string, number>, from?: 'runs' | 'searches'): string {
  const entries = Object.entries(providers).filter(([, n]) => n > 0).sort((left, right) => right[1] - left[1])
  const total = entries.reduce((sum, [, n]) => sum + n, 0)
  if (!total) return ''
  // Counted from the searches, the base is not the runs' inserted total: the shares alone are true.
  if (from === 'searches') return entries.map(([provider, n]) => `${provider} ${Math.round((100 * n) / total)} %`).join(' · ')
  return entries.map(([provider, n]) => `${provider} ${n.toLocaleString('fr-FR')} (${Math.round((100 * n) / total)} %)`).join(' · ')
}

function formatDay(day: string): string {
  const [year, month, date] = day.split('-')
  return new Date(Number(year), Number(month) - 1, Number(date)).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

export default function IngestReportsPage() {
  const [days, setDays] = useState<DayRow[]>([])
  const [recap, setRecap] = useState<UniverseRecapRow[]>([])
  const [miniSeries, setMiniSeries] = useState<MiniSeriesReport | null>(null)
  const [fresh, setFresh] = useState<FreshReport | null>(null)
  const [web, setWeb] = useState<WebReport | null>(null)
  const [dig, setDig] = useState<DigReport | null>(null)
  const [cards, setCards] = useState<CardCensusRow[]>([])
  const [keptCards, setKeptCards] = useState<KeptCardsRow[]>([])
  const [health, setHealth] = useState<HealthRow[]>([])
  const [server, setServer] = useState<ServerStatus | null>(null)
  const [key, setKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (adminKey: string) => {
    if (!adminKey.trim()) return
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/v3/ingest-report', {
        cache: 'no-store',
        headers: { 'x-admin-ingest-key': adminKey.trim() },
      })
      if (!response.ok) throw new Error(response.status === 401 ? 'Clé refusée' : `Erreur ${response.status}`)
      const payload = (await response.json()) as { days: DayRow[]; health: HealthRow[]; server?: ServerStatus | null; recap?: UniverseRecapRow[]; miniSeries?: MiniSeriesReport | null; fresh?: FreshReport | null; web?: WebReport | null; dig?: DigReport | null; cards?: CardCensusRow[]; keptCards?: KeptCardsRow[] }
      setDays(payload.days ?? [])
      setHealth(payload.health ?? [])
      setServer(payload.server ?? null)
      setRecap(Array.isArray(payload.recap) ? payload.recap : [])
      setMiniSeries(payload.miniSeries ?? null)
      setFresh(payload.fresh ?? null)
      setWeb(payload.web ?? null)
      setDig(payload.dig ?? null)
      setCards(payload.cards ?? [])
      setKeptCards(payload.keptCards ?? [])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Chargement impossible')
    } finally {
      setLoading(false)
    }
  }, [])

  // The key is held for this page view only. The previous version wrote it to
  // localStorage, where it stayed readable long after.
  useEffect(() => {
    if (key.trim().length >= 8) void load(key)
  }, [key, load])

  const stopped = health.filter((row) => row.state === 'arrêtée')
  const mute = health.filter((row) => row.state === 'muette')
  const silent = health.filter((row) => row.state === 'sans insertion')

  return (
    <main style={S.page}>
      <header style={S.header}>
        <h1 style={S.title}>Ingestion</h1>
        <input
          type="password"
          value={key}
          onChange={(event) => setKey(event.target.value)}
          placeholder="Clé d'administration"
          style={S.input}
          autoComplete="off"
        />
      </header>

      {!key && <p style={S.hint}>Colle la clé d&apos;administration pour voir le rapport. Elle n&apos;est pas enregistrée.</p>}
      {loading && <p style={S.hint}>Chargement…</p>}
      {error && <p style={{ ...S.hint, color: '#b71c1c' }}>{error}</p>}

      {(stopped.length > 0 || mute.length > 0 || silent.length > 0) && (
        <section style={S.alerts}>
          {stopped.map((row) => (
            <div key={row.line} style={{ ...S.alert, ...STATE_STYLE.arrêtée }}>
              <strong>{label(row.line)}</strong> n&apos;a pas tourné depuis {hoursOf(row)} h
            </div>
          ))}
          {mute.map((row) => (
            <div key={row.line} style={{ ...S.alert, ...STATE_STYLE.muette }}>
              <strong>{label(row.line)}</strong> tourne mais n&apos;a rien inséré depuis {row.hoursSinceInsert ?? '+ de 26'} h
            </div>
          ))}
          {silent.map((row) => (
            <div key={row.line} style={{ ...S.alert, ...STATE_STYLE['sans insertion'] }}>
              <strong>{label(row.line)}</strong> tourne mais n&apos;insère rien
            </div>
          ))}
        </section>
      )}

      {server && (
        <section style={S.section}>
          <h2 style={S.h2}>Serveur d&apos;ingestion</h2>
          {server.trouble && <div style={{ ...S.alert, ...STATE_STYLE.arrêtée }}><strong>{server.host}</strong> : {server.trouble}</div>}
          <p style={S.hint}>
            {server.host} · vu {minutesAgo(server.at)} min · en marche depuis {server.uptimeHours} h · charge {server.load1}
            {' · '}disque libre {server.disk?.freeGB} / {server.disk?.totalGB} Go · mémoire libre {server.memory?.freeMB} / {server.memory?.totalMB} Mo
            {server.lastRun ? ` · dernier passage ${label(server.lastRun.line)} : ${server.lastRun.status}, ${server.lastRun.inserted} insérés` : ' · aucun passage'}
            {server.hoursSinceSuccess != null ? ` · dernier succès il y a ${server.hoursSinceSuccess} h` : ''}
          </p>
        </section>
      )}

      {recap.length > 0 && (
        <section style={S.section}>
          <h2 style={S.h2}>Pools par univers</h2>
          <p style={S.hint}>
            Ce que chaque univers peut servir au tirage (les mini-séries mises de côté ne comptent pas), et ce qui y est entré dans les
            24 heures avant le passage de nuit. Plancher : 20 000 — un univers en dessous reçoit plus de recherches chaque nuit.
          </p>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Univers</th>
                {recap.map((row) => <th key={row.day} style={{ ...S.th, textAlign: 'right' }}>{formatDay(row.day)}</th>)}
              </tr>
            </thead>
            <tbody>
              {Object.keys(UNIVERSE_LABEL).map((universe) => (
                <tr key={universe}>
                  <td style={S.td}>{UNIVERSE_LABEL[universe]}</td>
                  {recap.map((row) => (
                    <td key={row.day} style={{ ...S.td, textAlign: 'right' }}>
                      <span style={{ color: (row.added?.[universe] ?? 0) > 0 ? '#1b5e20' : '#bbb', fontWeight: 600 }}>+{(row.added?.[universe] ?? 0).toLocaleString('fr-FR')}</span>
                      <span style={{ color: '#777', marginLeft: 8 }}>{(row.sizes?.[universe] ?? 0).toLocaleString('fr-FR')}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {cards.length > 0 && (
        <section style={S.section}>
          <h2 style={S.h2}>Ce que chaque carte de la roue reçoit</h2>
          <p style={S.hint}>
            Les vidéos entrées chaque jour, triées dans les cartes qu'elles peuvent remplir (une vidéo peut en remplir plusieurs ; le hasard et le joker prennent tout). Écrit après chaque passe de la fouille.
          </p>
          <table style={S.table}>
            <thead><tr><th style={S.th}>Jour</th><th style={S.th}>Entrées</th>{Object.keys(CARD_LABEL).map((card) => <th key={card} style={S.th}>{CARD_LABEL[card]}</th>)}<th style={S.th}>Refusées (IA / image fixe)</th></tr></thead>
            <tbody>
              {cards.map((row) => (
                <tr key={row.day}>
                  <td style={S.td}>{formatDay(row.day)}</td>
                  <td style={S.td}>{row.total.toLocaleString('fr-FR')}</td>
                  {Object.keys(CARD_LABEL).map((card) => <td key={card} style={S.td}>{(row.cards[card] ?? 0).toLocaleString('fr-FR')}</td>)}
                  <td style={S.td}>{row.refused.ai} / {row.refused.still}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {keptCards.length > 0 && (
            <>
              <p style={S.hint}>Combien de secondes les visiteurs restent sur la vidéo de chaque carte (moyenne, et le nombre de vidéos mesurées).</p>
              <table style={S.table}>
                <thead><tr><th style={S.th}>Jour</th>{Object.keys(CARD_LABEL).map((card) => <th key={card} style={S.th}>{CARD_LABEL[card]}</th>)}<th style={S.th}>Hasard</th><th style={S.th}>Joker</th></tr></thead>
                <tbody>
                  {keptCards.map((row) => (
                    <tr key={row.day}>
                      <td style={S.td}>{formatDay(row.day)}</td>
                      {[...Object.keys(CARD_LABEL), 'chance', 'joker'].map((card) => { const cell = row.cards[card]; return <td key={card} style={S.td}>{cell && cell.n > 0 ? `${Math.round(cell.seconds / cell.n)} s (${cell.n}${cell.dislikes ? `, ${cell.dislikes} pas ça` : ''})` : '—'}</td> })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>
      )}
      {dig && (
        <section style={S.section}>
          <h2 style={S.h2}>La fouille (4 bases)</h2>
          <p style={S.hint}>
            Entrées le {formatDay(dig.day)} : {dig.total.toLocaleString('fr-FR')} vidéos
            {dig.total > 0 && <> — niveaux N1 {dig.levels['1'] ?? 0} · N2 {dig.levels['2'] ?? 0} · N3 {dig.levels['3'] ?? 0} · N4 {dig.levels['4'] ?? 0} — par base : {Object.entries(dig.bases).map(([base, n]) => `${DIG_BASE[base] ?? base} ${n}`).join(' · ')}</>}.
            {dig.runs.length > 0 && <> Passages : {dig.runs.map((run) => `${run.startedAt.slice(11, 16)} ${run.status}${run.note ? ` (${run.note})` : ''}${run.errors ? ` · ${run.errors} erreur(s)` : ''}`).join(' ; ')}.</>}
          </p>
          <p style={S.hint}>
            La file : {Object.keys(DIG_BASE).map((base) => {
              const rows = dig.queue.filter((row) => row.base === base)
              if (!rows.length) return null
              return `${DIG_BASE[base]} ${rows.map((row) => `${row.n} ${DIG_STATE[row.state] ?? row.state}`).join(', ')}`
            }).filter(Boolean).join(' · ')}.
            {dig.countries.length > 0 && <> Personnes par pays : {dig.countries.map((row) => `${row.country} ${row.n}`).join(' · ')}.</>}
          </p>
          {dig.subjects.length > 0 && (
            <table style={S.table}>
              <thead><tr><th style={S.th}>Dernier sujet servi</th><th style={S.th}>Base</th><th style={S.th}>Notoriété</th><th style={S.th}>Passes</th><th style={S.th}>Entrées</th><th style={S.th}>Exemples</th></tr></thead>
              <tbody>
                {dig.subjects.map((subject) => (
                  <tr key={subject.id}>
                    <td style={S.td}>{subject.fr ?? subject.label}{subject.fr ? <span style={{ color: '#777' }}> · {subject.label}</span> : null}</td>
                    <td style={S.td}>{DIG_BASE[subject.base] ?? subject.base}</td>
                    <td style={S.td}>{DIG_FAME[subject.fame] ?? subject.fame}</td>
                    <td style={S.td}>{subject.passes}</td>
                    <td style={S.td}>{subject.ingested}</td>
                    <td style={{ ...S.td, fontSize: 12, color: '#555' }}>{subject.sample.join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {fresh && (
        <section style={S.section}>
          <h2 style={S.h2}>Frais du jour</h2>
          <p style={S.hint}>
            La liste du {formatDay(fresh.day)} : {fresh.total.toLocaleString('fr-FR')} vidéos du moment, dont chaque session ouvre sur dix. Par zone :{' '}
            {Object.entries(fresh.counts).map(([zone, n]) => `${FRESH_ZONE[zone] ?? zone} ${n}`).join(' · ')}
          </p>
          <ol style={{ margin: '8px 0 0', paddingLeft: 22, fontSize: 13, lineHeight: 1.5 }}>
            {fresh.first.map((title, index) => <li key={index}>{title}</li>)}
          </ol>
        </section>
      )}

      {web && (
        <section style={S.section}>
          <h2 style={S.h2}>Sites web : la file des visites</h2>
          <p style={S.hint}>
            Les sites trouvés attendent que le serveur les visite (vivant ou non, image ou capture) avant d&apos;entrer dans le tirage.
            Google aujourd&apos;hui : {web.googleToday} recherches sur {web.googleCap} gratuites.
          </p>
          <ul style={{ margin: '8px 0 0', paddingLeft: 22, fontSize: 13, lineHeight: 1.5 }}>
            {Object.entries(web.bySource).map(([source, counts]) => (
              <li key={source}>
                {WEB_SOURCE[source] ?? source} : {WEB_STATUS.filter(([status]) => counts[status]).map(([status, name]) => `${(counts[status] ?? 0).toLocaleString('fr-FR')} ${name}`).join(' · ')}
              </li>
            ))}
          </ul>
        </section>
      )}

      {miniSeries && (
        <section style={S.section}>
          <h2 style={S.h2}>Refusés à l&apos;entrée : mini-séries et pubs</h2>
          <p style={S.hint}>
            Les feuilletons verticaux et les pubs (arnaques, tops produits au-delà de dix par jour) refusés à l&apos;entrée, sur
            trois jours, et vingt titres tirés au hasard. Si un titre qui devait passer apparaît ici, la règle est à corriger.
          </p>
          {miniSeries.days.length === 0 ? (
            <p style={S.hint}>Aucun refus enregistré pour l&apos;instant.</p>
          ) : (
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Jour</th>
                  <th style={{ ...S.th, textAlign: 'right' }}>Refusées</th>
                  <th style={S.th}>Par motif</th>
                </tr>
              </thead>
              <tbody>
                {miniSeries.days.map((row) => (
                  <tr key={row.day}>
                    <td style={S.td}>{formatDay(row.day)}</td>
                    <td style={{ ...S.td, textAlign: 'right', fontWeight: 600 }}>{row.total.toLocaleString('fr-FR')}</td>
                    <td style={S.td}>
                      {Object.entries(row.byDetail)
                        .sort((left, right) => right[1] - left[1])
                        .map(([detail, n]) => `${MINI_SERIES_REASON[detail] ?? detail} ${n.toLocaleString('fr-FR')}`)
                        .join(' · ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {miniSeries.examples.length > 0 && (
            <ul style={{ margin: '12px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.5 }}>
              {miniSeries.examples.map((example, index) => (
                <li key={`${example.at}-${index}`}>
                  {example.title} <span style={{ color: '#777' }}>· {example.provider} · {MINI_SERIES_REASON[example.detail] ?? example.detail}</span>
                </li>
              ))}
            </ul>
          )}
          {miniSeries.studios.length > 0 && (
            <p style={{ ...S.hint, marginTop: 12 }}>
              Studios appris : {miniSeries.studios.map((studio) => `${studio.name} (${studio.refused})`).join(', ')}
            </p>
          )}
        </section>
      )}

      {health.length > 0 && (
        <section style={S.section}>
          <h2 style={S.sectionTitle}>État des lignes</h2>
          <div style={S.cards}>
            {health.map((row) => (
              <div key={row.line} style={{ ...S.card, ...STATE_STYLE[row.state] }}>
                <div style={S.cardLine}>{label(row.line)}</div>
                <div style={S.cardState}>{row.state}</div>
                <div style={S.cardAgo}>passage il y a {hoursOf(row)} h{row.hoursSinceInsert != null ? ` · insertion il y a ${row.hoursSinceInsert} h` : ''}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {days.map((day) => (
        <section key={day.day} style={S.section}>
          <h2 style={S.dayTitle}>
            {formatDay(day.day)}
            <span style={S.dayTotal}>{day.total.toLocaleString('fr-FR')} insérés</span>
          </h2>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Ligne</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Passages</th>
                <th style={S.th}>Statut</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Examinés</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Insérés</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Erreurs</th>
              </tr>
            </thead>
            <tbody>
              {day.lines.map((row) => (
                <tr key={row.line}>
                  <td style={S.td}>
                    <div>{label(row.line)}</div>
                    {row.providers && Object.keys(row.providers).length > 0 && (
                      <div style={S.providers}>
                        {providerShares(row.providers, row.providersFrom)}
                      </div>
                    )}
                    {row.searches?.length > 0 && (
                      <div style={S.searches}>
                        {row.searches.join(' · ')}
                      </div>
                    )}
                  </td>
                  <td style={{ ...S.td, textAlign: 'right' }}>{row.runs}</td>
                  <td style={S.td}>
                    {row.statuses && Object.keys(row.statuses).length > 0
                      ? Object.entries(row.statuses).map(([status, n]) => (
                          <span key={status} style={{ color: STATUS_STYLE[status as keyof StatusCounts], marginRight: 8, fontSize: 12, fontWeight: 600 }}>
                            {status} {n}
                          </span>
                        ))
                      : <span style={{ color: '#bbb', fontSize: 12 }}>—</span>}
                    {row.note && (
                      <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>{row.note}</div>
                    )}
                    {Array.isArray(row.errors) && row.errors.length > 0 && (
                      <div style={{ fontSize: 11, color: '#b71c1c', marginTop: 2 }}>{row.errors.join(' · ')}</div>
                    )}
                  </td>
                  <td style={{ ...S.td, textAlign: 'right', color: '#777' }}>{row.scanned.toLocaleString('fr-FR')}</td>
                  <td style={{ ...S.td, textAlign: 'right', fontWeight: 600, color: row.inserted ? '#1b5e20' : '#b71c1c' }}>
                    {row.inserted.toLocaleString('fr-FR')}
                  </td>
                  <td style={{ ...S.td, textAlign: 'right', color: (Array.isArray(row.errors) ? row.errors.length : row.errors) ? '#b71c1c' : '#bbb' }}>
                    {(Array.isArray(row.errors) ? row.errors.length : row.errors) || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      {key && !loading && !days.length && !error && <p style={S.hint}>Aucun passage sur les 14 derniers jours.</p>}
    </main>
  )
}

const S: Record<string, React.CSSProperties> = {
  // An explicit background as well as a colour: the first version set only the
  // colour, and in a dark-mode browser every title and row label vanished.
  page: {
    maxWidth: 980, margin: '0 auto', padding: 24, minHeight: '100vh',
    fontFamily: 'system-ui, sans-serif', color: '#1a1a1a', background: '#ffffff',
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 20 },
  title: { fontSize: 26, fontWeight: 700, margin: 0, color: '#1a1a1a' },
  input: { padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, width: 240, background: '#fff', color: '#1a1a1a' },
  hint: { color: '#777', fontSize: 14 },
  alerts: { display: 'grid', gap: 8, marginBottom: 24 },
  alert: { padding: '10px 14px', borderRadius: 8, fontSize: 14 },
  section: { marginBottom: 32 },
  sectionTitle: {
    fontSize: 15, fontWeight: 600, textTransform: 'capitalize', color: '#1a1a1a',
    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
    borderBottom: '1px solid #eee', paddingBottom: 8, marginBottom: 12,
  },
  dayTotal: { fontSize: 13, fontWeight: 500, color: '#777', textTransform: 'none' },
  providers: { fontSize: 11, color: '#999', marginTop: 2 },
  searches: { fontSize: 11, color: '#555', marginTop: 4, lineHeight: 1.5, maxWidth: 460 },
  dayTitle: {
    fontSize: 17, fontWeight: 700, color: '#1a1a1a', textTransform: 'capitalize',
    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
    borderBottom: '2px solid #1a1a1a', paddingBottom: 8, marginBottom: 12,
  },
  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 },
  card: { padding: 12, borderRadius: 10 },
  cardLine: { fontWeight: 600, fontSize: 14 },
  cardState: { fontSize: 13, marginTop: 2 },
  cardAgo: { fontSize: 12, opacity: 0.7, marginTop: 4 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: { textAlign: 'left', padding: '6px 8px', color: '#777', fontWeight: 500, fontSize: 12 },
  td: { padding: '7px 8px', borderTop: '1px solid #f2f2f2', color: '#1a1a1a' },
}
