'use client'

import { useCallback, useMemo, useState } from 'react'

type ApiResult = {
  ok?: boolean
  dryRun?: boolean
  scanned?: number
  imported?: number
  updated?: number
  skipped?: number
  duplicates?: number
  errors?: string[]
  sample?: Array<Record<string, unknown>>
}

export default function ImportAiContentPage() {
  const [adminKey, setAdminKey] = useState('')
  const [payload, setPayload] = useState('')
  const [result, setResult] = useState<ApiResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detectedCount, setDetectedCount] = useState<number | null>(null)

  const updatePayload = useCallback((value: string) => {
    setPayload(value)
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) {
        setDetectedCount(parsed.length)
      } else {
        setDetectedCount(null)
      }
    } catch {
      setDetectedCount(null)
    }
  }, [])

  async function submitImport(dryRun: boolean) {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const trimmed = payload.trim()
      if (!trimmed) {
        throw new Error('Merci de coller un JSON valide avant de lancer l\'import.')
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(trimmed)
      } catch (err) {
        throw new Error(`JSON invalide : ${(err as Error).message}`)
      }

      const res = await fetch(`/api/admin/import/ai${dryRun ? '?dry=1' : ''}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-ingest-key': adminKey.trim(),
        },
        body: JSON.stringify(parsed),
      })

      const json = (await res.json()) as ApiResult & { error?: string }
      if (!res.ok) {
        throw new Error(json.error || `Erreur API (${res.status})`)
      }
      setResult(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const onFileChange = useCallback(async (fileList: FileList | null) => {
    if (!fileList || !fileList.length) return
    const file = fileList[0]
    try {
      const text = await file.text()
      updatePayload(text)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [updatePayload])

  const handleDrop = useCallback(async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const files = event.dataTransfer.files
    if (files && files.length) {
      await onFileChange(files)
    } else {
      const text = event.dataTransfer.getData('text/plain')
      if (text) updatePayload(text)
    }
  }, [onFileChange, updatePayload])

  const dropZoneHint = useMemo(() => {
    if (detectedCount === null) return 'Glissez un fichier .json ou collez du JSON.'
    return `${detectedCount} élément(s) détecté(s)`
  }, [detectedCount])

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Import de contenus IA (blagues / facts / quotes)</h1>
        <p className="text-sm opacity-80">
          Colle un tableau JSON généré via ChatGPT (voir documentation) et importe les éléments dans la base.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <label className="text-sm font-semibold" htmlFor="admin-key">
          Admin ingest key
        </label>
        <input
          id="admin-key"
          type="password"
          autoComplete="off"
          className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
          value={adminKey}
          onChange={(event) => setAdminKey(event.target.value)}
          placeholder="ADMIN_INGEST_KEY"
        />
      </section>

      <section className="flex flex-col gap-3">
        <label className="text-sm font-semibold" htmlFor="payload">
          JSON des contenus générés par IA
        </label>
        <div
          onDragOver={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          onDrop={handleDrop}
          className="rounded border border-dashed border-zinc-600 bg-zinc-900/60 p-4"
        >
          <p className="text-xs uppercase tracking-wide opacity-60">Glisser-déposer</p>
          <p className="text-sm font-medium">{dropZoneHint}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-zinc-700 px-3 py-1.5 text-xs font-semibold">
              Choisir un fichier…
              <input
                type="file"
                accept=".json,.txt,application/json,text/plain"
                className="hidden"
                onChange={(event) => onFileChange(event.target.files)}
              />
            </label>
            <button
              type="button"
              className="text-xs underline opacity-70"
              onClick={() => {
                updatePayload('')
                setDetectedCount(null)
              }}
            >
              Effacer
            </button>
          </div>
          <textarea
            id="payload"
            className="mt-4 h-64 w-full rounded border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs"
            value={payload}
            onChange={(event) => updatePayload(event.target.value)}
            placeholder='[
  {
    "type": "joke",
    "lang": "fr",
    "text": "Pourquoi ...",
    "tags": ["absurde"],
    "source": "ChatGPT",
    "model": "gpt-5-pro"
  }
]'
          />
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="rounded bg-zinc-800 px-4 py-2 text-sm font-semibold"
          onClick={() => submitImport(true)}
          disabled={loading}
        >
          {loading ? 'Analyse…' : 'Analyser (dry-run)'}
        </button>
        <button
          type="button"
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          onClick={() => submitImport(false)}
          disabled={loading}
        >
          {loading ? 'Import…' : 'Importer'}
        </button>
        {loading ? <span className="text-xs opacity-70">En cours…</span> : null}
      </div>

      {error ? (
        <div className="rounded border border-red-500 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {result ? (
        <section className="rounded border border-zinc-700 bg-zinc-900 px-4 py-4 text-sm">
          <h2 className="text-lg font-semibold">Résultat</h2>
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
            <Stat label="Mode" value={result.dryRun ? 'Dry-run' : 'Import effectif'} />
            <Stat label="Éléments analysés" value={result.scanned ?? 0} />
            <Stat label="Importés" value={result.imported ?? 0} />
            <Stat label="Mis à jour" value={result.updated ?? 0} />
            <Stat label="Ignorés" value={result.skipped ?? 0} />
            <Stat label="Doublons" value={result.duplicates ?? 0} />
          </div>
        {result.errors && result.errors.length ? (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-semibold text-red-300">
              {result.errors.length} erreur(s)
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
                {result.errors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            </details>
          ) : null}
          {result.sample && result.sample.length ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold">Aperçu</summary>
              <pre className="mt-2 max-h-72 overflow-auto rounded bg-zinc-950/80 p-3 text-xs">
                {JSON.stringify(result.sample, null, 2)}
              </pre>
            </details>
          ) : null}
        </section>
      ) : null}
    </main>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950/60 px-3 py-2">
      <p className="text-xs uppercase tracking-wide opacity-60">{label}</p>
      <p className="text-base font-semibold">{value}</p>
    </div>
  )
}
