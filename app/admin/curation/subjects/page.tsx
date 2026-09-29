'use client'

/**
 * The subject of each like, in the owner's words: a name (Amy Winehouse) or a
 * theme (pub tv 1994), typed once, that the dig searches around. The
 * suggestion comes from the tagger or the channel; he corrects it in five
 * seconds. Saved as he leaves the field.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

type Row = { itemId: string; type: string; title: string; thumbUrl: string | null; provider?: string; channelTitle: string | null; subject: string; suggested: string }
type Saved = 'idle' | 'saving' | 'saved' | 'error'

export default function CurationSubjectsPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [state, setState] = useState<Record<string, Saved>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/discovery/curation/subjects', { cache: 'no-store', credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((body: { items: Row[] }) => {
        setRows(body.items)
        setDrafts(Object.fromEntries(body.items.map((row) => [row.itemId, row.subject || row.suggested])))
      })
      .catch(() => setError('Impossible de lire tes likes. Es-tu connecté à la curation ?'))
  }, [])

  const save = useCallback(async (row: Row) => {
    const subject = (drafts[row.itemId] ?? '').trim()
    if (subject === row.subject) return
    setState((current) => ({ ...current, [row.itemId]: 'saving' }))
    try {
      const res = await fetch('/api/discovery/curation/subjects', { method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ itemId: row.itemId, subject }) })
      if (!res.ok) throw new Error(String(res.status))
      setRows((current) => current.map((item) => (item.itemId === row.itemId ? { ...item, subject } : item)))
      setState((current) => ({ ...current, [row.itemId]: 'saved' }))
    } catch {
      setState((current) => ({ ...current, [row.itemId]: 'error' }))
    }
  }, [drafts])

  const confirmed = rows.filter((row) => row.subject).length

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="p-3 text-center text-sm"><Link href="/admin/curation/likes" className="underline">Tes likes</Link> · <Link href="/admin/curation/status" className="underline">Suivi</Link></div>
      <div className="mx-auto max-w-3xl px-4 pb-16">
        <h1 className="text-2xl font-bold">Le sujet de tes likes</h1>
        <p className="mt-2 text-sm text-neutral-400">
          Un nom (Amy Winehouse) ou un thème (pub tv 1994) par like : c&apos;est autour de ce mot que la fouille cherche. La suggestion vient de la machine ; corrige-la, puis passe au suivant, c&apos;est enregistré. Un champ vide met le like en attente.
          {rows.length > 0 && <> {confirmed} confirmé{confirmed > 1 ? 's' : ''} sur {rows.length}.</>}
        </p>
        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
        <ul className="mt-6 flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.itemId} className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950 p-3">
              {row.thumbUrl ? <img src={row.thumbUrl} alt="" className="h-14 w-20 flex-none rounded object-cover" /> : <div className="h-14 w-20 flex-none rounded bg-neutral-800" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{row.title}</p>
                <p className="truncate text-xs text-neutral-500">{row.channelTitle ?? row.provider ?? ''}</p>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    id={`subject-${row.itemId}`}
                    value={drafts[row.itemId] ?? ''}
                    onChange={(event) => setDrafts((current) => ({ ...current, [row.itemId]: event.target.value }))}
                    onBlur={() => void save(row)}
                    onKeyDown={(event) => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur() }}
                    placeholder="Nom ou thème"
                    className="w-full rounded border border-neutral-700 bg-black px-2 py-1 text-sm outline-none focus:border-white"
                  />
                  <span className="w-5 flex-none text-center text-xs" aria-live="polite">
                    {state[row.itemId] === 'saving' ? '…' : state[row.itemId] === 'saved' || row.subject ? '✓' : state[row.itemId] === 'error' ? '!' : ''}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}
