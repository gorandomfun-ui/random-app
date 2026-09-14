'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { CurationInspection } from '@/lib/discovery/curationInspection'

const labels = { inactive: 'Référence inactive', 'needs-metadata': 'Métadonnées à récupérer',
  'needs-subject': 'Sujet non identifié', waiting: 'En attente du prochain passage', scheduled: 'Recherches programmées' }
type Reference = { itemId?: string; title: string; subject: string | null }

export default function CurationStatusPage() {
  const [refs, setRefs] = useState<Reference[]>([]), [selected, setSelected] = useState('')
  const [report, setReport] = useState<CurationInspection | null>(null)
  const [error, setError] = useState(''), [revision, setRevision] = useState(0), [loading, setLoading] = useState(true)
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(''); setReport(null)
    const endpoint = '/api/discovery/curation/status' + (selected ? `?itemId=${encodeURIComponent(selected)}` : '')
    void fetch(endpoint, { signal: controller.signal, cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(body => { if (!controller.signal.aborted) { if (selected) setReport(body); else setRefs(body.references) } })
      .catch(() => { if (!controller.signal.aborted) setError('Le suivi est indisponible. Réessaie dans un instant.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [selected, revision])
  return <main className="min-h-screen bg-black px-5 py-8 text-white">
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/admin/curation/likes" className="underline">← Tes Likes</Link>
      <h1 className="text-2xl font-bold">Suivi de ta curation</h1>
      <p>Ce suivi montre comment tes likes orientent les recherches. Les compteurs concernent un échantillon de tâches ; une recherche programmée n’est pas encore une vidéo trouvée.</p>
      <button className="rounded border px-3 py-2" disabled={loading} onClick={() => setRevision(v => v + 1)}>Actualiser</button>
      {selected && <button className="ml-3 underline" onClick={() => setSelected('')}>Revenir aux références</button>}
      {loading && <p role="status">Chargement…</p>}
      {error && <p role="alert">{error}</p>}
      {!selected && !loading && <>
        <p>Échantillon de {refs.length} références actives.</p>
        <ul className="space-y-3">{refs.map((r, i) => <li key={r.itemId ?? i}>
          <button className="text-left underline" disabled={!r.itemId} onClick={() => setSelected(r.itemId!)}>{r.title}</button>
          <p className="text-sm text-gray-300">Sujet : {r.subject ?? 'non identifié'}</p>
        </li>)}</ul>
      </>}
      {report && <article className="space-y-3 rounded border p-4">
        <h2 className="text-xl">{report.title}</h2>
        <p><strong>Sujet :</strong> {report.subject ?? 'non identifié'}{report.tentative ? ' (déduit des métadonnées)' : ''}</p>
        <p><strong>État :</strong> {labels[report.state]}</p>
        <p>{report.sampledTasks} tâches actuelles dans l’échantillon ; {report.measuredTasks} ont des compteurs. {report.inserted} nouvelles vidéos insérées, {report.matched} résultats correspondant au sujet.</p>
        {report.taskSampleCapped && <p>Limite de lecture atteinte : les chiffres ne couvrent pas toutes les tâches.</p>}
        {report.outdatedTasks > 0 && <p>{report.outdatedTasks} anciennes tâches écartées de ces chiffres.</p>}
        <p>Dernière tentative observée : {report.lastAttemptAt ? new Date(report.lastAttemptAt).toLocaleString('fr-FR') : 'aucune'}.</p>
        <ul className="space-y-2">{report.recentTasks.map((t, i) => <li key={i}>
          {t.provider} · {t.query} · {t.angle}<br />{t.outcome} · {t.inserted === null ? 'pas encore mesuré' : `${t.inserted} insertion(s)`}
        </li>)}</ul>
      </article>}
    </div>
  </main>
}
