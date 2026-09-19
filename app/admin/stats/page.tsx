'use client'

import React from 'react'

type ByType = { _id: string; count: number }[]
type ByProvider = { _id: { type?: string; provider?: string }; count: number }[]
type Item = {
  _id?: string
  type?: string
  provider?: string
  url?: string
  videoId?: string
  title?: string
  host?: string
}
type Stats = {
  ok?: boolean
  counts?: { byType?: ByType; byProviderAll?: ByProvider; videos?: { totalDocs: number; distinctVideoIds: number } }
  samples?: { recent?: Item[]; neverShown?: Item[] }
  error?: string
}

const TYPE_LABELS: Record<string, string> = {
  image: 'Images',
  video: 'Vidéos',
  web: 'Sites',
  fact: 'Anecdotes',
  quote: 'Citations',
  joke: 'Blagues',
}

const TYPES = ['', 'image', 'video', 'quote', 'joke', 'fact', 'web']

function label(type: string | undefined): string {
  if (!type) return 'Inconnu'
  return TYPE_LABELS[type] ?? type
}

function count(n: number | undefined): string {
  return (n ?? 0).toLocaleString('fr-FR')
}

// An explicit background as well as a colour: with only a colour set, a dark-mode
// browser turns every title and row label invisible.
const S: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 980, margin: '0 auto', padding: 24, minHeight: '100vh',
    fontFamily: 'system-ui, sans-serif', color: '#1a1a1a', background: '#ffffff',
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 8 },
  title: { fontSize: 26, fontWeight: 700, margin: 0, color: '#1a1a1a' },
  intro: { color: '#777', fontSize: 14, marginBottom: 20 },
  controls: { display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  input: { padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, background: '#fff', color: '#1a1a1a' },
  button: { padding: '8px 18px', borderRadius: 8, border: 0, background: '#1a1a1a', color: '#fff', fontSize: 14, cursor: 'pointer' },
  error: { padding: '10px 14px', borderRadius: 8, background: '#ffebee', color: '#b71c1c', fontSize: 14, marginBottom: 20 },
  section: { marginBottom: 32 },
  sectionTitle: {
    fontSize: 17, fontWeight: 700, color: '#1a1a1a',
    borderBottom: '2px solid #1a1a1a', paddingBottom: 8, marginBottom: 12,
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: { textAlign: 'left', padding: '6px 8px', color: '#777', fontWeight: 500, fontSize: 12 },
  td: { padding: '7px 8px', borderTop: '1px solid #f2f2f2', color: '#1a1a1a' },
  num: { textAlign: 'right', padding: '7px 8px', borderTop: '1px solid #f2f2f2', color: '#1a1a1a', fontVariantNumeric: 'tabular-nums' },
  bar: { height: 6, borderRadius: 3, background: '#1a1a1a', minWidth: 2 },
  link: { color: '#1a1a1a' },
  note: { fontSize: 13, color: '#777', marginTop: 8 },
}

export default function AdminStats() {
  // The key stays in component state only: writing it to localStorage left it
  // readable by anything running on the page.
  const [key, setKey] = React.useState('')
  const [type, setType] = React.useState('')
  const [provider, setProvider] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [data, setData] = React.useState<Stats | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  async function refresh() {
    setLoading(true)
    setError(null)
    setData(null)
    try {
      const query = new URLSearchParams({ limit: '20', sample: 'true' })
      if (type) query.set('type', type)
      if (provider) query.set('provider', provider)
      const res = await fetch(`/api/admin/cache-stats?${query}`, {
        cache: 'no-store',
        headers: { 'x-admin-ingest-key': key.trim() },
      })
      const json = (await res.json()) as Stats
      if (!res.ok || json.ok === false) throw new Error(json.error || `HTTP ${res.status}`)
      setData(json)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Échec de la requête')
    } finally {
      setLoading(false)
    }
  }

  const byType = data?.counts?.byType ?? []
  const total = byType.reduce((sum, row) => sum + row.count, 0)
  const biggest = byType[0]?.count ?? 1
  const byProvider = data?.counts?.byProviderAll ?? []
  const videos = data?.counts?.videos

  return (
    <div style={S.page}>
      <div style={S.header}>
        <h1 style={S.title}>Ce que contient la base</h1>
        <button style={S.button} onClick={refresh} disabled={!key || loading}>
          {loading ? 'Chargement…' : 'Afficher'}
        </button>
      </div>
      <p style={S.intro}>
        L’inventaire complet des contenus stockés, par type et par fournisseur. Pour savoir ce qui a été
        ajouté chaque jour, voir <a href="/admin/ingest-reports" style={S.link}>le rapport d’ingestion</a>.
      </p>

      <div style={S.controls}>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Clé d’administration"
          style={{ ...S.input, width: 240 }}
        />
        <select value={type} onChange={(e) => setType(e.target.value)} style={S.input}>
          {TYPES.map((t) => (
            <option key={t} value={t}>{t ? label(t) : 'Tous les types'}</option>
          ))}
        </select>
        <input
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          placeholder="Fournisseur (facultatif)"
          style={{ ...S.input, width: 200 }}
        />
      </div>

      {error && <div style={S.error}>{error}</div>}

      {data && (
        <>
          <section style={S.section}>
            <h2 style={S.sectionTitle}>Par type · {count(total)} contenus au total</h2>
            <table style={S.table}>
              <tbody>
                {byType.map((row) => (
                  <tr key={row._id}>
                    <td style={{ ...S.td, width: 140 }}>{label(row._id)}</td>
                    <td style={{ ...S.num, width: 110 }}>{count(row.count)}</td>
                    <td style={{ ...S.td, width: 70, color: '#777' }}>
                      {total ? `${Math.round((row.count / total) * 100)} %` : '—'}
                    </td>
                    <td style={S.td}>
                      <div style={{ ...S.bar, width: `${Math.max(2, (row.count / biggest) * 100)}%` }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section style={S.section}>
            <h2 style={S.sectionTitle}>Par fournisseur</h2>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Type</th>
                  <th style={S.th}>Fournisseur</th>
                  <th style={{ ...S.th, textAlign: 'right' }}>Contenus</th>
                </tr>
              </thead>
              <tbody>
                {byProvider.map((row) => (
                  <tr key={`${row._id?.type}-${row._id?.provider}`}>
                    <td style={S.td}>{label(row._id?.type)}</td>
                    <td style={S.td}>{row._id?.provider ?? '—'}</td>
                    <td style={S.num}>{count(row.count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {videos && (
            <section style={S.section}>
              <h2 style={S.sectionTitle}>Doublons de vidéos</h2>
              <table style={S.table}>
                <tbody>
                  <tr>
                    <td style={S.td}>Vidéos stockées</td>
                    <td style={S.num}>{count(videos.totalDocs)}</td>
                  </tr>
                  <tr>
                    <td style={S.td}>Identifiants distincts</td>
                    <td style={S.num}>{count(videos.distinctVideoIds)}</td>
                  </tr>
                </tbody>
              </table>
              <p style={S.note}>
                {videos.totalDocs === videos.distinctVideoIds
                  ? 'Aucun doublon : la base refuse d’enregistrer deux fois la même vidéo.'
                  : `${count(videos.totalDocs - videos.distinctVideoIds)} vidéos sans identifiant, donc non protégées contre les doublons.`}
              </p>
            </section>
          )}

          <section style={S.section}>
            <h2 style={S.sectionTitle}>Les 20 derniers ajoutés</h2>
            <table style={S.table}>
              <tbody>
                {(data.samples?.recent ?? []).map((item) => (
                  <tr key={String(item._id)}>
                    <td style={{ ...S.td, width: 90, color: '#777' }}>{label(item.type)}</td>
                    <td style={{ ...S.td, width: 110, color: '#777' }}>{item.provider ?? '—'}</td>
                    <td style={S.td}>
                      {item.url
                        ? <a href={item.url} target="_blank" rel="noreferrer" style={S.link}>{item.title || item.host || item.url}</a>
                        : (item.title || '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {(data.samples?.neverShown ?? []).length > 0 && (
            <section style={S.section}>
              <h2 style={S.sectionTitle}>Jamais montrés à personne</h2>
              <table style={S.table}>
                <tbody>
                  {(data.samples?.neverShown ?? []).map((item) => (
                    <tr key={String(item._id)}>
                      <td style={{ ...S.td, width: 90, color: '#777' }}>{label(item.type)}</td>
                      <td style={{ ...S.td, width: 110, color: '#777' }}>{item.provider ?? '—'}</td>
                      <td style={S.td}>
                        {item.url
                          ? <a href={item.url} target="_blank" rel="noreferrer" style={S.link}>{item.title || item.host || item.url}</a>
                          : (item.title || '—')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </div>
  )
}
