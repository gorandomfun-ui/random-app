'use client'

/** The ready-made lines: by family and language; add, change, remove. */

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

import { PHRASE_FAMILIES, type Phrase } from '@/lib/comm/caption'

const headers = { 'Content-Type': 'application/json' }
const small = 'rounded border border-white/40 px-2 py-1 text-xs disabled:opacity-40'

export default function PhrasesPage() {
  const [phrases, setPhrases] = useState<Phrase[]>([])
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<Phrase>({ family: 'decouverte', lang: 'fr', text: '' })
  const [editing, setEditing] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  const reload = useCallback(async () => {
    const body = await fetch('/api/admin/comm/phrases', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({}))
    if (!body.phrases) { setError('Les phrases sont indisponibles.'); return }
    setPhrases(body.phrases)
  }, [])
  useEffect(() => { void reload() }, [reload])

  const add = useCallback(async () => {
    const response = await fetch('/api/admin/comm/phrases', { method: 'POST', headers, body: JSON.stringify(draft) })
    if (!response.ok) { setError('Phrase refusée : famille, langue (fr ou en) et texte de 140 caractères au plus.'); return }
    setDraft((d) => ({ ...d, text: '' })); setError(''); await reload()
  }, [draft, reload])

  const change = useCallback(async (phrase: Phrase) => {
    const response = await fetch('/api/admin/comm/phrases', { method: 'POST', headers, body: JSON.stringify({ ...phrase, text: editText, id: phrase._id }) })
    if (!response.ok) { setError('Modification refusée.'); return }
    setEditing(null); await reload()
  }, [editText, reload])

  const remove = useCallback(async (phrase: Phrase) => {
    if (!window.confirm('Supprimer cette phrase ?')) return
    await fetch(`/api/admin/comm/phrases?id=${phrase._id}`, { method: 'DELETE', headers })
    await reload()
  }, [reload])

  const families = Object.keys(PHRASE_FAMILIES) as Phrase['family'][]
  return (
    <main className="min-h-screen bg-black px-5 py-8 text-white">
      <div className="mx-auto max-w-3xl space-y-5">
        <nav className="text-sm"><Link href="/admin/comm" className="underline">← La file</Link></nav>
        <h1 className="text-2xl font-bold">Phrases prêtes</h1>
        {error ? <p role="alert" className="text-red-300">{error}</p> : null}
        <form className="flex flex-wrap items-end gap-2 text-sm" onSubmit={(e) => { e.preventDefault(); void add() }}>
          <label>Famille<br /><select className="mt-1 rounded border border-white/40 bg-black px-2 py-1" value={draft.family} onChange={(e) => setDraft({ ...draft, family: e.target.value as Phrase['family'] })}>{families.map((f) => <option key={f} value={f}>{PHRASE_FAMILIES[f]}</option>)}</select></label>
          <label>Langue<br /><select className="mt-1 rounded border border-white/40 bg-black px-2 py-1" value={draft.lang} onChange={(e) => setDraft({ ...draft, lang: e.target.value as Phrase['lang'] })}><option value="fr">fr</option><option value="en">en</option></select></label>
          <label className="flex-1">Texte<br /><input className="mt-1 w-full rounded border border-white/40 bg-black px-2 py-1" maxLength={140} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} /></label>
          <button className={small} type="submit">Ajouter</button>
        </form>
        {families.map((family) => (
          <section key={family}>
            <h2 className="font-bold">{PHRASE_FAMILIES[family]}</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {phrases.filter((p) => p.family === family).map((p) => (
                <li key={p._id} className="flex flex-wrap items-center gap-2">
                  <span className="w-6 text-xs text-gray-400">{p.lang}</span>
                  {editing === p._id ? <><input className="flex-1 rounded border border-white/40 bg-black px-2 py-1" maxLength={140} value={editText} onChange={(e) => setEditText(e.target.value)} /><button className={small} onClick={() => change(p)}>OK</button><button className={small} onClick={() => setEditing(null)}>Annuler</button></>
                    : <><span className="flex-1">{p.text || <em className="text-gray-400">(aucun texte)</em>}</span><button className={small} onClick={() => { setEditing(p._id ?? null); setEditText(p.text) }}>Modifier</button><button className={small} onClick={() => remove(p)}>Supprimer</button></>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  )
}
