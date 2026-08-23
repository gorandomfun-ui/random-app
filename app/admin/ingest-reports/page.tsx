'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'

type CronRun = {
  id?: string
  name?: string
  status?: string
  startedAt?: string
  finishedAt?: string
  durationMs?: number
  details?: Record<string, unknown>
  error?: string
}

type CronStatusResponse = {
  ok?: boolean
  error?: string
  runs?: CronRun[]
}

type PhaseReport = {
  phase?: string
  ok?: boolean
  durationMs?: number
  inserted?: number
  updated?: number
  existingSkipped?: number
  checked?: number
  providerCounts?: Record<string, number>
  error?: string
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function formatDuration(value: unknown): string {
  const ms = asNumber(value)
  if (!ms) return '-'
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (!minutes) return `${seconds}s`
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`
}

function formatDate(value: unknown): string {
  if (typeof value !== 'string') return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('fr-FR', {
    timeZone: 'Europe/Paris',
    dateStyle: 'short',
    timeStyle: 'medium',
  })
}

function readStoredKey(): string {
  const direct = localStorage.getItem('ingest_report_key') || localStorage.getItem('admin_key') || ''
  if (direct) return direct

  try {
    const saved = JSON.parse(localStorage.getItem('ingest_admin_state_v3') || '{}') as { key?: unknown }
    return typeof saved.key === 'string' ? saved.key : ''
  } catch {
    return ''
  }
}

function providerSummary(value: unknown): string {
  if (!value || typeof value !== 'object') return '-'
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([provider, count]) => `${provider}: ${asNumber(count)}`)
  return entries.length ? entries.join(' · ') : '-'
}

function normalizePhases(value: unknown): PhaseReport[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is PhaseReport => Boolean(entry) && typeof entry === 'object')
}

const STYLES: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    padding: 32,
    background: '#f6f4eb',
    color: '#171713',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  shell: {
    maxWidth: 1180,
    margin: '0 auto',
    display: 'grid',
    gap: 20,
  },
  title: {
    margin: 0,
    fontSize: 'clamp(28px, 4vw, 46px)',
    lineHeight: 1,
    letterSpacing: 0,
  },
  subtitle: {
    margin: '8px 0 0',
    color: 'rgba(23, 23, 19, 0.66)',
    fontSize: 15,
  },
  panel: {
    border: '1px solid rgba(23, 23, 19, 0.12)',
    borderRadius: 8,
    background: '#fffdf5',
    padding: 16,
  },
  authRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(220px, 1fr) auto',
    gap: 12,
    alignItems: 'end',
  },
  label: {
    display: 'grid',
    gap: 6,
    color: 'rgba(23, 23, 19, 0.72)',
    fontSize: 13,
    fontWeight: 650,
  },
  input: {
    width: '100%',
    minHeight: 42,
    border: '1px solid rgba(23, 23, 19, 0.22)',
    borderRadius: 6,
    padding: '0 12px',
    background: '#fff',
    color: '#171713',
    font: 'inherit',
  },
  button: {
    minHeight: 42,
    border: 0,
    borderRadius: 6,
    padding: '0 16px',
    background: '#171713',
    color: '#fffdf5',
    font: 'inherit',
    fontWeight: 700,
    cursor: 'pointer',
  },
  error: {
    borderColor: 'rgba(185, 28, 28, 0.24)',
    background: '#fff0f0',
    color: '#9f1239',
  },
  metrics: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: 12,
  },
  metric: {
    border: '1px solid rgba(23, 23, 19, 0.1)',
    borderRadius: 8,
    background: '#fffdf5',
    padding: 14,
  },
  metricLabel: {
    color: 'rgba(23, 23, 19, 0.55)',
    fontSize: 12,
    fontWeight: 650,
  },
  metricValue: {
    marginTop: 4,
    fontSize: 20,
    fontWeight: 800,
  },
  tableWrap: {
    overflowX: 'auto',
    border: '1px solid rgba(23, 23, 19, 0.12)',
    borderRadius: 8,
    background: '#fffdf5',
  },
  table: {
    width: '100%',
    minWidth: 940,
    borderCollapse: 'collapse',
    fontSize: 13,
  },
  th: {
    padding: 12,
    borderTop: 0,
    background: 'rgba(23, 23, 19, 0.04)',
    color: 'rgba(23, 23, 19, 0.62)',
    fontSize: 11,
    fontWeight: 800,
    textTransform: 'uppercase',
    textAlign: 'left',
  },
  td: {
    padding: 12,
    borderTop: '1px solid rgba(23, 23, 19, 0.1)',
    textAlign: 'left',
    verticalAlign: 'top',
  },
  phaseTd: {
    padding: 12,
    borderTop: '1px solid rgba(23, 23, 19, 0.1)',
    background: 'rgba(23, 23, 19, 0.025)',
    color: 'rgba(23, 23, 19, 0.62)',
    fontSize: 12,
  },
  phase: {
    display: 'inline-block',
    margin: '0 14px 4px 0',
    whiteSpace: 'nowrap',
  },
  empty: {
    color: 'rgba(23, 23, 19, 0.62)',
  },
}

export default function IngestReportsPage() {
  const [key, setKey] = useState('')
  const [runs, setRuns] = useState<CronRun[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setKey(readStoredKey())
  }, [])

  useEffect(() => {
    if (!key) return
    localStorage.setItem('ingest_report_key', key)
  }, [key])

  const loadReports = useCallback(async () => {
    const authKey = key.trim()
    if (!authKey) {
      setError('Entre la clé admin pour afficher les rapports.')
      setRuns([])
      return
    }

    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/cron/status?target=daily-auto-summary&limit=20', {
        cache: 'no-store',
        headers: { 'x-admin-ingest-key': authKey },
      })
      const data = (await res.json().catch(() => ({}))) as CronStatusResponse
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Erreur HTTP ${res.status}`)
      }
      setRuns(Array.isArray(data.runs) ? data.runs : [])
      setLoaded(true)
    } catch (err) {
      setRuns([])
      setError(err instanceof Error ? err.message : 'Impossible de charger les rapports.')
    } finally {
      setLoading(false)
    }
  }, [key])

  const totalInserted = useMemo(() => {
    return runs.reduce((sum, run) => sum + asNumber(run.details?.videoInserted), 0)
  }, [runs])

  return (
    <main style={STYLES.page}>
      <div style={STYLES.shell}>
        <header>
          <h1 style={STYLES.title}>Rapports d’ingestion automatique</h1>
          <p style={STYLES.subtitle}>Lecture seule. Aucun lancement d’ingestion depuis cette page.</p>
        </header>

        <section style={{ ...STYLES.panel, ...STYLES.authRow }}>
          <label style={STYLES.label}>
            Clé admin
            <input
              type="password"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              placeholder="ADMIN_INGEST_KEY"
              style={STYLES.input}
            />
          </label>
          <button type="button" onClick={loadReports} disabled={loading} style={{ ...STYLES.button, opacity: loading ? 0.55 : 1 }}>
            {loading ? 'Chargement...' : 'Charger les rapports'}
          </button>
        </section>

        {error ? <div style={{ ...STYLES.panel, ...STYLES.error }}>{error}</div> : null}

        {runs.length ? (
          <section style={STYLES.metrics}>
            <div style={STYLES.metric}>
              <div style={STYLES.metricLabel}>Runs affichés</div>
              <div style={STYLES.metricValue}>{runs.length}</div>
            </div>
            <div style={STYLES.metric}>
              <div style={STYLES.metricLabel}>Vidéos insérées</div>
              <div style={STYLES.metricValue}>{totalInserted}</div>
            </div>
            <div style={STYLES.metric}>
              <div style={STYLES.metricLabel}>Dernier run</div>
              <div style={STYLES.metricValue}>{formatDate(runs[0]?.startedAt)}</div>
            </div>
            <div style={STYLES.metric}>
              <div style={STYLES.metricLabel}>Dernier statut</div>
              <div style={STYLES.metricValue}>{runs[0]?.status || '-'}</div>
            </div>
            <div style={STYLES.metric}>
              <div style={STYLES.metricLabel}>Dernière durée</div>
              <div style={STYLES.metricValue}>{formatDuration(runs[0]?.durationMs || runs[0]?.details?.durationMs)}</div>
            </div>
          </section>
        ) : null}

        {loaded && !runs.length && !error ? (
          <div style={{ ...STYLES.panel, ...STYLES.empty }}>Aucun rapport enregistré pour l’instant.</div>
        ) : null}

        {runs.length ? (
          <section style={STYLES.tableWrap}>
            <table style={STYLES.table}>
              <thead>
                <tr>
                  <th style={STYLES.th}>Début</th>
                  <th style={STYLES.th}>Statut</th>
                  <th style={STYLES.th}>Profil</th>
                  <th style={STYLES.th}>Durée</th>
                  <th style={STYLES.th}>Vidéos</th>
                  <th style={STYLES.th}>Web</th>
                  <th style={STYLES.th}>Enrichies</th>
                  <th style={STYLES.th}>Doublons</th>
                  <th style={STYLES.th}>Providers</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run, index) => {
                  const details = run.details || {}
                  const phases = normalizePhases(details.phases)
                  return (
                    <React.Fragment key={run.id || `${run.startedAt}-${index}`}>
                      <tr>
                        <td style={STYLES.td}>{formatDate(run.startedAt)}</td>
                        <td style={STYLES.td}>{run.status || '-'}</td>
                        <td style={STYLES.td}>{String(details.profile || '-')}</td>
                        <td style={STYLES.td}>{formatDuration(run.durationMs || details.durationMs)}</td>
                        <td style={STYLES.td}><strong>{asNumber(details.videoInserted)}</strong></td>
                        <td style={STYLES.td}>{asNumber(details.webInserted)}</td>
                        <td style={STYLES.td}>{asNumber(details.videoEnriched)}</td>
                        <td style={STYLES.td}>{asNumber(details.existingSkipped)}</td>
                        <td style={STYLES.td}>{providerSummary(details.providerCounts)}</td>
                      </tr>
                      {phases.length ? (
                        <tr>
                          <td colSpan={9} style={STYLES.phaseTd}>
                            {phases.map((phase) => (
                              <span key={`${run.id}-${phase.phase}`} style={STYLES.phase}>
                                {phase.phase || 'phase'}: {phase.ok === false ? 'erreur' : 'ok'}
                                {' '}· {formatDuration(phase.durationMs)}
                                {' '}· insérées {asNumber(phase.inserted)}
                                {phase.checked ? ` · enrichies ${asNumber(phase.updated) || asNumber(phase.checked)}` : ''}
                              </span>
                            ))}
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </section>
        ) : null}
      </div>
    </main>
  )
}
