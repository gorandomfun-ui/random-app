'use client'
import React from 'react'

type ByType = { _id: string; count: number }[]
type ByProv = { _id: { type: string; provider?: string }; count: number }[]
type Item = { _id?: string; type?: string; provider?: string; url?: string; videoId?: string; title?: string; thumb?: string; host?: string; updatedAt?: string; lastShownAt?: string }
type Stats = {
  ok?: boolean
  counts?: { byType?: ByType; byProviderAll?: ByProv; videos?: { totalDocs: number; distinctVideoIds: number } }
  samples?: { recent?: Item[]; neverShown?: Item[] }
  error?: string
}

const TYPES = ['', 'image', 'video', 'quote', 'joke', 'fact', 'web']

export default function AdminStats() {
  const [key, setKey] = React.useState('')
  const [type, setType] = React.useState('')
  const [provider, setProvider] = React.useState('')
  const [limit, setLimit] = React.useState(20)
  const [sample, setSample] = React.useState(true)
  const [loading, setLoading] = React.useState(false)
  const [data, setData] = React.useState<Stats | null>(null)
  const [err, setErr] = React.useState<string | null>(null)

  React.useEffect(() => { setKey(localStorage.getItem('admin_key') || '') }, [])
  React.useEffect(() => { localStorage.setItem('admin_key', key) }, [key])

  async function refresh() {
    setLoading(true); setErr(null); setData(null)
    try {
      const q = new URLSearchParams({ key, limit: String(limit) })
      if (type) q.set('type', type)
      if (provider) q.set('provider', provider)
      if (sample) q.set('sample', 'true')
      const res = await fetch(`/api/admin/cache-stats?${q}`, { cache: 'no-store' })
      const json = (await res.json()) as unknown
      const stats = (json && typeof json === 'object') ? (json as Stats) : { ok: false, error: 'invalid response' }
      if (!res.ok || stats.ok === false) throw new Error(stats.error || `HTTP ${res.status}`)
      setData(stats)
    } catch (error: unknown) {
      setErr(error instanceof Error ? error.message : 'Failed')
    }
    finally { setLoading(false) }
  }

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin · Cache stats</h1>
        <button className="px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50"
                onClick={refresh} disabled={!key || loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <input type="password" value={key} onChange={e=>setKey(e.target.value)}
               placeholder="ADMIN_INGEST_KEY" className="border p-2 rounded" />
        <select value={type} onChange={e=>setType(e.target.value)} className="border p-2 rounded">
          {TYPES.map(t => <option key={t} value={t}>{t || 'all types'}</option>)}
        </select>
        <input value={provider} onChange={e=>setProvider(e.target.value)}
               placeholder="provider (optional)" className="border p-2 rounded" />
        <input type="number" value={limit}
               onChange={e=>setLimit(Math.max(1, Math.min(100, parseInt(e.target.value||'20',10))))}
               className="border p-2 rounded" />
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={sample} onChange={e=>setSample(e.target.checked)} /> samples
        </label>
      </div>

      {err && <div className="text-red-600">{err}</div>}

      {data && (
        <>
          <section>
            <h2 className="font-semibold mb-2">By type</h2>
            <pre className="bg-black/5 p-3 rounded">{JSON.stringify(data.counts?.byType, null, 2)}</pre>
          </section>
          <section>
            <h2 className="font-semibold mb-2">By provider</h2>
            <pre className="bg-black/5 p-3 rounded">{JSON.stringify(data.counts?.byProviderAll, null, 2)}</pre>
          </section>
          <section>
            <h2 className="font-semibold mb-2">Videos</h2>
            <pre className="bg-black/5 p-3 rounded">{JSON.stringify(data.counts?.videos, null, 2)}</pre>
          </section>
          <section>
            <h2 className="font-semibold mb-2">Samples</h2>
            <pre className="bg-black/5 p-3 rounded">{JSON.stringify(data.samples, null, 2)}</pre>
          </section>
        </>
      )}
    </div>
  )
}
