'use client'

/**
 * Step 1 of the Comm journey: the queue. What the curator set aside, with the
 * media taken at the time; filters by type, provider and subject; one more
 * media from here when the first did not do; removal, one or many.
 */

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'

import { canCaptureTab, commImportSource, commList, commRemove, commRemoveMedia, formatBytes, LICENSE_COLORS, LICENSE_WORDS, uploadMedia, type QueueItemWithMedia, type QueueStatus } from '@/lib/comm/client'
import type { MediaDoc } from '@/lib/comm/model'

const TYPE_WORDS: Record<string, string> = { video: 'Vidéo', image: 'Image', web: 'Site', quote: 'Citation', fact: 'Fait', joke: 'Blague' }
const KIND_WORDS: Record<MediaDoc['kind'], string> = { capture: 'Extrait', import: 'Import', gif: 'GIF', image: 'Image', screenshot: 'Capture', thumb: 'Miniature' }

export default function CommQueueClient() {
  const [items, setItems] = useState<QueueItemWithMedia[]>([])
  const [status, setStatus] = useState<QueueStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [typeFilter, setTypeFilter] = useState(''), [providerFilter, setProviderFilter] = useState(''), [subjectFilter, setSubjectFilter] = useState('')
  const fileTarget = useRef<string>('')
  const fileInput = useRef<HTMLInputElement | null>(null)

  const reload = useCallback(async () => {
    setLoading(true); setError('')
    const result = await commList()
    setLoading(false)
    if (result.error || !result.items) { setError(result.status === 401 ? 'Accès refusé.' : 'La file est indisponible.'); return }
    setItems(result.items); setStatus({ count: result.count, max: result.max, blob: result.blob })
    setSelected((current) => new Set([...current].filter((id) => result.items.some((item) => item._id === id))))
  }, [])

  useEffect(() => { void reload() }, [reload])

  const providers = useMemo(() => Array.from(new Set(items.map((item) => item.snapshot.providerLabel))).sort(), [items])
  const subjects = useMemo(() => Array.from(new Set(items.flatMap((item) => item.subjects.map((s) => s.label)))).sort(), [items])
  const visible = useMemo(() => items.filter((item) =>
    (!typeFilter || item.contentType === typeFilter) && (!providerFilter || item.snapshot.providerLabel === providerFilter) && (!subjectFilter || item.subjects.some((s) => s.label === subjectFilter))), [items, typeFilter, providerFilter, subjectFilter])

  const patch = useCallback((id: string, fn: (item: QueueItemWithMedia) => QueueItemWithMedia) => setItems((current) => current.map((item) => (item._id === id ? fn(item) : item))), [])

  const importSource = useCallback(async (item: QueueItemWithMedia, what: 'image' | 'gif' | 'thumb') => {
    setBusy(item._id); setError('')
    const result = await commImportSource(item._id, what)
    setBusy('')
    if (result.media) patch(item._id, (current) => ({ ...current, media: [...current.media, result.media!] }))
    else setError(result.message ?? 'Récupération impossible.')
  }, [patch])

  const onFiles = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []); event.target.value = ''
    const id = fileTarget.current
    if (!id) return
    for (const file of files) {
      setBusy(id); setError('')
      const result = await uploadMedia(id, file, 'import')
      if (result.media) patch(id, (current) => ({ ...current, media: [...current.media, result.media!] }))
      else setError(result.message ?? 'Envoi impossible.')
    }
    setBusy('')
  }, [patch])

  const removeMedia = useCallback(async (item: QueueItemWithMedia, media: MediaDoc) => {
    setBusy(item._id)
    const result = await commRemoveMedia(media._id)
    setBusy('')
    if (result.removed) patch(item._id, (current) => ({ ...current, media: current.media.filter((m) => m._id !== media._id) }))
  }, [patch])

  const removeItems = useCallback(async (ids: string[]) => {
    if (!ids.length) return
    if (!window.confirm(ids.length === 1 ? 'Supprimer cet élément et ses médias ?' : `Supprimer ${ids.length} éléments et leurs médias ?`)) return
    setBusy('remove'); setError('')
    for (const id of ids) await commRemove(id)
    setBusy('')
    await reload()
  }, [reload])

  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const desktop = canCaptureTab()
  const small = 'rounded border border-white/40 px-2 py-1 text-xs disabled:opacity-50'

  return (
    <main className="min-h-screen bg-black px-5 py-8 text-white">
      <div className="mx-auto max-w-4xl space-y-5">
        <nav className="flex flex-wrap items-center gap-4 text-sm"><Link href="/admin/curation/random" className="underline">← Curation</Link><Link href="/admin/comm/phrases" className="underline">Phrases</Link><Link href="/admin/comm/stats" className="underline">Stats</Link></nav>
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-2xl font-bold">Comm — la file</h1>
          {status ? <p className="text-sm">{status.count} / {status.max}{!status.blob ? <span className="ml-3 text-amber-300">Blob non configuré : aucun média ne peut être pris.</span> : null}</p> : null}
        </header>
        <p className="text-sm text-gray-300">Ce que tu as mis de côté depuis la curation, avec les médias pris sur le moment. Un élément part avec ses médias après publication ou export, ou ici à la main.</p>

        <div className="flex flex-wrap gap-2 text-sm">
          <select className="rounded border border-white/40 bg-black px-2 py-1" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}><option value="">Tous les types</option>{Object.entries(TYPE_WORDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select className="rounded border border-white/40 bg-black px-2 py-1" value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)}><option value="">Tous les providers</option>{providers.map((p) => <option key={p} value={p}>{p}</option>)}</select>
          <select className="rounded border border-white/40 bg-black px-2 py-1" value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}><option value="">Tous les sujets</option>{subjects.map((s) => <option key={s} value={s}>{s}</option>)}</select>
          <button className={small} disabled={loading} onClick={() => reload()}>Actualiser</button>
          {selected.size ? <Link href={`/admin/comm/compose?items=${[...selected].join(',')}`} className={`${small} border-white bg-white text-black`}>Composer avec la sélection ({selected.size})</Link> : null}
          {selected.size ? <button className={`${small} border-red-400 text-red-300`} disabled={Boolean(busy)} onClick={() => removeItems([...selected])}>Supprimer la sélection ({selected.size})</button> : null}
        </div>

        {loading ? <p role="status">Chargement…</p> : null}
        {error ? <p role="alert" className="text-red-300">{error}</p> : null}
        {!loading && !visible.length ? <p className="text-gray-300">Rien dans la file{items.length ? ' avec ces filtres' : ''}. Depuis la curation, le bouton Comm (touche c) met un contenu de côté.</p> : null}

        <ul className="space-y-4">
          {visible.map((item) => {
            const isGif = item.contentType === 'image' && (item.snapshot.url.toLowerCase().includes('.gif') || ['giphy', 'tenor'].includes(item.snapshot.provider.toLowerCase()))
            return (
              <li key={item._id} className="rounded border border-white/20 p-3">
                <div className="flex items-start gap-3">
                  <input type="checkbox" aria-label="Sélectionner" className="mt-1" checked={selected.has(item._id)} onChange={() => toggle(item._id)} />
                  {/* eslint-disable-next-line @next/next/no-img-element -- a plain picture, no optimisation cost */}
                  {item.snapshot.thumb ? <img src={item.snapshot.thumb} alt="" className="h-16 w-24 flex-none rounded object-cover" /> : <div className="h-16 w-24 flex-none rounded bg-white/10" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold" title={item.snapshot.title}>{item.snapshot.title}</p>
                    <p className="text-xs text-gray-300">
                      {TYPE_WORDS[item.contentType] ?? item.contentType} · {item.snapshot.providerLabel}{item.snapshot.author ? ` · ${item.snapshot.author}` : item.snapshot.authorRequired ? ' · auteur à saisir' : ''}
                      <span title={LICENSE_WORDS[item.licenseHint]} className="ml-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: LICENSE_COLORS[item.licenseHint] }} />
                      {' · '}{new Date(item.addedAt).toLocaleDateString('fr-FR')}
                    </p>
                    {item.subjects.length ? <p className="truncate text-xs text-gray-400">{item.subjects.map((s) => s.label).join(' · ')}</p> : null}
                    <p className="mt-1 text-xs"><a href={item.snapshot.sourceUrl} target="_blank" rel="noreferrer" className="underline">Source</a></p>
                  </div>
                </div>

                {item.media.length ? (
                  <ul className="mt-3 flex flex-wrap gap-3">
                    {item.media.map((media) => (
                      <li key={media._id} className="flex items-center gap-2 text-xs">
                        {/* eslint-disable-next-line @next/next/no-img-element -- a plain picture, no optimisation cost */}
                        {media.contentType.startsWith('video/') ? <video src={media.blobUrl} muted playsInline controls className="h-16 w-16 rounded object-cover" /> : <img src={media.blobUrl} alt="" className="h-16 w-16 rounded object-cover" />}
                        <span>{KIND_WORDS[media.kind]}<br />{formatBytes(media.bytes)}{media.width && media.height ? <><br />{media.width}×{media.height}</> : null}{media.durationSec ? <><br />{Math.round(media.durationSec)} s</> : null}</span>
                        <button className={small} disabled={busy === item._id} onClick={() => removeMedia(item, media)} aria-label="Supprimer ce média">×</button>
                      </li>
                    ))}
                  </ul>
                ) : <p className="mt-3 text-xs text-gray-400">Aucun média.</p>}

                <div className="mt-3 flex flex-wrap gap-2">
                  {item.contentType === 'image' && !isGif ? <button className={small} disabled={busy === item._id} onClick={() => importSource(item, 'image')}>Télécharger l’image</button> : null}
                  {item.contentType === 'image' && isGif ? <button className={small} disabled={busy === item._id} onClick={() => importSource(item, 'gif')}>Récupérer le GIF</button> : null}
                  {item.contentType === 'video' && desktop ? <Link href={`/admin/comm/capture/${item._id}`} className={small}>Capturer un extrait</Link> : null}
                  {item.contentType === 'video' && !desktop ? <Link href={`/admin/comm/capture/${item._id}`} className={small}>Mode capture (téléphone)</Link> : null}
                  <button className={small} disabled={busy === item._id} onClick={() => { fileTarget.current = item._id; fileInput.current?.click() }}>Importer</button>
                  {item.snapshot.thumb ? <button className={small} disabled={busy === item._id} onClick={() => importSource(item, 'thumb')}>Utiliser la miniature</button> : null}
                  <Link href={`/admin/comm/compose?items=${item._id}`} className={small}>Composer</Link>
                  <button className={`${small} border-red-400 text-red-300`} disabled={Boolean(busy)} onClick={() => removeItems([item._id])}>Supprimer</button>
                  {busy === item._id ? <span role="status" className="text-xs">En cours…</span> : null}
                </div>
              </li>
            )
          })}
        </ul>
        <input ref={fileInput} type="file" accept="video/*,image/*" multiple hidden onChange={onFiles} />
      </div>
    </main>
  )
}
