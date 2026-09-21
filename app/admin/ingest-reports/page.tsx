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
type LineRow = { line: string; inserted: number; scanned: number; runs: number; errors: number | string[]; providers?: Record<string, number>; searches: string[]; statuses?: StatusCounts; duplicates?: number }
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
}

const hoursOf = (row: HealthRow) => row.hoursSinceRun ?? row.hoursAgo ?? 0

const label = (line: string) => LINE_LABEL[line] ?? line

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
  const [health, setHealth] = useState<HealthRow[]>([])
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
      const payload = (await response.json()) as { days: DayRow[]; health: HealthRow[] }
      setDays(payload.days ?? [])
      setHealth(payload.health ?? [])
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
                        {Object.entries(row.providers)
                          .sort((left, right) => right[1] - left[1])
                          .map(([provider, n]) => `${provider} ${n.toLocaleString('fr-FR')}`)
                          .join(' · ')}
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
