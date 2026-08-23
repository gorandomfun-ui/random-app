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
    <main className="mx-auto max-w-6xl p-6 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Rapports d’ingestion automatique</h1>
        <p className="text-sm text-black/60">
          Lecture seule. Aucun lancement d’ingestion depuis cette page.
        </p>
      </header>

      <section className="flex flex-wrap items-end gap-3 border border-black/10 rounded-lg p-4">
        <label className="flex min-w-72 flex-1 flex-col gap-1 text-sm">
          Clé admin
          <input
            type="password"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            placeholder="ADMIN_INGEST_KEY"
            className="rounded border border-black/20 px-3 py-2"
          />
        </label>
        <button
          type="button"
          onClick={loadReports}
          disabled={loading || !key.trim()}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-40"
        >
          {loading ? 'Chargement...' : 'Charger les rapports'}
        </button>
      </section>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {runs.length ? (
        <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <div className="rounded border border-black/10 p-3">
            <div className="text-xs text-black/50">Runs affichés</div>
            <div className="text-xl font-semibold">{runs.length}</div>
          </div>
          <div className="rounded border border-black/10 p-3">
            <div className="text-xs text-black/50">Vidéos insérées</div>
            <div className="text-xl font-semibold">{totalInserted}</div>
          </div>
          <div className="rounded border border-black/10 p-3">
            <div className="text-xs text-black/50">Dernier run</div>
            <div className="text-sm font-medium">{formatDate(runs[0]?.startedAt)}</div>
          </div>
          <div className="rounded border border-black/10 p-3">
            <div className="text-xs text-black/50">Dernier statut</div>
            <div className="text-sm font-medium">{runs[0]?.status || '-'}</div>
          </div>
          <div className="rounded border border-black/10 p-3">
            <div className="text-xs text-black/50">Dernière durée</div>
            <div className="text-sm font-medium">{formatDuration(runs[0]?.durationMs || runs[0]?.details?.durationMs)}</div>
          </div>
        </section>
      ) : null}

      {loaded && !runs.length && !error ? (
        <div className="rounded border border-black/10 px-4 py-6 text-sm text-black/60">
          Aucun rapport enregistré pour l’instant.
        </div>
      ) : null}

      {runs.length ? (
        <section className="overflow-x-auto rounded-lg border border-black/10">
          <table className="w-full min-w-[920px] border-collapse text-left text-sm">
            <thead className="bg-black/[0.03] text-xs uppercase text-black/55">
              <tr>
                <th className="px-3 py-3">Début</th>
                <th className="px-3 py-3">Statut</th>
                <th className="px-3 py-3">Profil</th>
                <th className="px-3 py-3">Durée</th>
                <th className="px-3 py-3">Vidéos</th>
                <th className="px-3 py-3">Web</th>
                <th className="px-3 py-3">Enrichies</th>
                <th className="px-3 py-3">Doublons</th>
                <th className="px-3 py-3">Providers</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run, index) => {
                const details = run.details || {}
                return (
                  <React.Fragment key={run.id || `${run.startedAt}-${index}`}>
                    <tr className="border-t border-black/10 align-top">
                      <td className="px-3 py-3">{formatDate(run.startedAt)}</td>
                      <td className="px-3 py-3">{run.status || '-'}</td>
                      <td className="px-3 py-3">{String(details.profile || '-')}</td>
                      <td className="px-3 py-3">{formatDuration(run.durationMs || details.durationMs)}</td>
                      <td className="px-3 py-3 font-medium">{asNumber(details.videoInserted)}</td>
                      <td className="px-3 py-3">{asNumber(details.webInserted)}</td>
                      <td className="px-3 py-3">{asNumber(details.videoEnriched)}</td>
                      <td className="px-3 py-3">{asNumber(details.existingSkipped)}</td>
                      <td className="px-3 py-3">{providerSummary(details.providerCounts)}</td>
                    </tr>
                    {normalizePhases(details.phases).length ? (
                      <tr className="border-t border-black/5 bg-black/[0.015]">
                        <td className="px-3 py-3 text-xs text-black/55" colSpan={9}>
                          {normalizePhases(details.phases).map((phase) => (
                            <span key={`${run.id}-${phase.phase}`} className="mr-4 inline-block">
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
    </main>
  )
}
