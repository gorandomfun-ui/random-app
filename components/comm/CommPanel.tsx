'use client'

/**
 * The small panel over a content in the curation: it sets the content aside
 * and takes its media right now, while the curator is looking at it. Loaded
 * only when the Comm button is pressed; the public Random never carries it.
 */

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'

import { canCaptureTab, commAdd, commImportSource, commRemove, commRemoveMedia, formatBytes, LICENSE_COLORS, LICENSE_WORDS, screenshotOf, uploadMedia, type QueueItemWithMedia, type QueueStatus } from '@/lib/comm/client'
import type { MediaDoc } from '@/lib/comm/model'

export type CommPanelProps = {
  itemId: string
  accent: string
  onClose: () => void
  /** Tells the page whether the content is now in the queue, and how full the queue is. */
  onQueueChange: (inQueue: boolean, status: QueueStatus) => void
  /** The content zone to picture for a site, a quiz or a text. */
  captureTarget?: () => HTMLElement | null
}

const KIND_WORDS: Record<MediaDoc['kind'], string> = { capture: 'Extrait capturé', import: 'Import', gif: 'GIF', image: 'Image', screenshot: 'Capture', thumb: 'Miniature', montage: 'Montage', still: 'Image fixe' }

export default function CommPanel({ itemId, accent, onClose, onQueueChange, captureTarget }: CommPanelProps) {
  const [item, setItem] = useState<QueueItemWithMedia | null>(null)
  const [status, setStatus] = useState<QueueStatus | null>(null)
  const [full, setFull] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    let cancelled = false
    void commAdd(itemId).then((result) => {
      if (cancelled) return
      const next = { count: result.count ?? 0, max: result.max ?? 30, blob: result.blob ?? false }
      setStatus(next)
      if (result.item) { setItem(result.item); onQueueChange(true, next); return }
      if (result.status === 409) { setFull(true); onQueueChange(false, next); return }
      setError(result.error === 'unsupported' ? 'Ce type de contenu ne se partage pas.' : 'Mise de côté impossible. Vérifie ton accès.')
    })
    return () => { cancelled = true }
    // The panel is mounted for one content: it runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); closeRef.current() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const withMedia = useCallback((media: MediaDoc) => setItem((current) => (current ? { ...current, media: [...current.media, media] } : current)), [])

  const importSource = useCallback(async (what: 'image' | 'gif' | 'thumb', label: string) => {
    if (!item) return
    setBusy(label); setError('')
    const result = await commImportSource(item._id, what)
    setBusy('')
    if (result.media) withMedia(result.media)
    else setError(result.message ?? 'Récupération impossible.')
  }, [item, withMedia])

  const sendFile = useCallback(async (file: Blob, kind: MediaDoc['kind'], label: string) => {
    if (!item) return
    setBusy(label); setError(''); setProgress(0)
    const result = await uploadMedia(item._id, file, kind, setProgress)
    setBusy(''); setProgress(null)
    if (result.media) withMedia(result.media)
    else setError(result.message ?? 'Envoi impossible.')
  }, [item, withMedia])

  const onFiles = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    for (const file of files) await sendFile(file, 'import', `Import de ${file.name}`)
  }, [sendFile])

  const screenshot = useCallback(async () => {
    const target = captureTarget?.() ?? null
    if (!target) { setError('La zone de contenu est introuvable.'); return }
    setBusy('Capture de la zone'); setError('')
    const blob = await screenshotOf(target)
    if (!blob) { setBusy(''); setError('La capture a échoué (contenu d’un autre site, non copiable).'); return }
    await sendFile(blob, 'screenshot', 'Envoi de la capture')
  }, [captureTarget, sendFile])

  const removeOne = useCallback(async (media: MediaDoc) => {
    setBusy('Suppression'); setError('')
    const result = await commRemoveMedia(media._id)
    setBusy('')
    if (result.removed) setItem((current) => (current ? { ...current, media: current.media.filter((m) => m._id !== media._id) } : current))
  }, [])

  const removeItem = useCallback(async () => {
    if (!item) return
    setBusy('Retrait'); setError('')
    const result = await commRemove(item._id)
    setBusy('')
    const next = { count: result.count ?? 0, max: result.max ?? 30, blob: result.blob ?? false }
    onQueueChange(false, next)
    onClose()
  }, [item, onClose, onQueueChange])

  const type = item?.contentType
  const isGif = type === 'image' && (item?.snapshot.url.toLowerCase().includes('.gif') || ['giphy', 'tenor'].includes(item?.snapshot.provider.toLowerCase() ?? ''))
  const desktop = canCaptureTab()
  const button = 'rounded-full border px-4 py-2 text-sm font-bold uppercase tracking-wide disabled:opacity-50'

  return (
    <div role="dialog" aria-modal="true" aria-label="Comm" className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-3 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl p-4 shadow-2xl" style={{ background: '#191916', color: '#F8F5E6', border: `1px solid ${accent}` }} onClick={(event) => event.stopPropagation()}>
        <header className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-tomorrow text-lg font-black uppercase" style={{ color: accent }}>Comm</h2>
          <div className="text-sm">
            {status ? <span>{status.count} / {status.max}</span> : null}
            <Link href="/admin/comm" target="_blank" className="ml-3 underline">Ouvrir la file</Link>
          </div>
        </header>

        {full ? (
          <p role="alert" className="text-sm">File comm pleine : {status?.count} / {status?.max} — publie ou supprime d’abord. <Link href="/admin/comm" target="_blank" className="underline">Ouvrir la file</Link></p>
        ) : null}

        {item ? (
          <>
            <p className="text-sm leading-snug">
              <span className="font-bold">{item.snapshot.title}</span>
              <br />
              <span className="opacity-80">{item.snapshot.providerLabel}{item.snapshot.author ? ` · ${item.snapshot.author}` : ''}</span>
              <span title={LICENSE_WORDS[item.licenseHint]} aria-label={LICENSE_WORDS[item.licenseHint]} className="ml-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: LICENSE_COLORS[item.licenseHint] }} />
            </p>
            {!status?.blob ? <p role="alert" className="mt-2 text-xs" style={{ color: '#E5972B' }}>Le stockage Blob n’est pas configuré : l’élément est dans la file, mais aucun média ne peut être pris.</p> : null}

            <div className="mt-3 flex flex-wrap gap-2">
              {type === 'image' && !isGif ? <button type="button" className={button} style={{ borderColor: accent, color: accent }} disabled={Boolean(busy)} onClick={() => importSource('image', 'Téléchargement de l’image')}>Télécharger l’image</button> : null}
              {type === 'image' && isGif ? <button type="button" className={button} style={{ borderColor: accent, color: accent }} disabled={Boolean(busy)} onClick={() => importSource('gif', 'Récupération du GIF')}>Récupérer le GIF</button> : null}
              {type === 'video' && desktop ? <Link href={`/admin/comm/capture/${item._id}`} target="_blank" className={button} style={{ borderColor: accent, color: accent }}>Capturer un extrait</Link> : null}
              {type === 'video' || type === 'image' ? <button type="button" className={button} style={{ borderColor: accent, color: accent }} disabled={Boolean(busy)} onClick={() => fileInput.current?.click()}>Importer</button> : null}
              {type === 'web' || type === 'fact' || type === 'quote' || type === 'joke' ? <button type="button" className={button} style={{ borderColor: accent, color: accent }} disabled={Boolean(busy)} onClick={screenshot}>Capturer</button> : null}
              {item.snapshot.thumb ? <button type="button" className={button} style={{ borderColor: '#F8F5E6', color: '#F8F5E6' }} disabled={Boolean(busy)} onClick={() => importSource('thumb', 'Récupération de la miniature')}>Utiliser la miniature</button> : null}
              <input ref={fileInput} type="file" accept="video/*,image/*" multiple hidden onChange={onFiles} />
            </div>
            {type === 'video' && !desktop ? <p className="mt-2 text-xs opacity-80">Sur téléphone : enregistre l’écran avec la fonction du téléphone, puis Importer.</p> : null}

            {busy ? <p role="status" className="mt-3 text-sm">{busy}…{progress != null ? ` ${Math.round(progress * 100)} %` : ''}</p> : null}
            {error ? <p role="alert" className="mt-3 text-sm" style={{ color: '#FF978F' }}>{error}</p> : null}

            {item.media.length ? (
              <ul className="mt-3 space-y-2">
                {item.media.map((media) => (
                  <li key={media._id} className="flex items-center gap-3 text-xs">
                    {/* eslint-disable-next-line @next/next/no-img-element -- a plain picture, no optimisation cost */}
                    {media.contentType.startsWith('video/') ? <video src={media.blobUrl} muted playsInline className="h-12 w-12 rounded object-cover" /> : <img src={media.blobUrl} alt="" className="h-12 w-12 rounded object-cover" />}
                    <span className="flex-1">{KIND_WORDS[media.kind]} · {formatBytes(media.bytes)}{media.width && media.height ? ` · ${media.width}×${media.height}` : ''}{media.durationSec ? ` · ${Math.round(media.durationSec)} s` : ''}</span>
                    <button type="button" aria-label="Supprimer ce média" className="px-2 text-base" disabled={Boolean(busy)} onClick={() => removeOne(media)}>×</button>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-3 text-xs opacity-70">Aucun média encore : prends-en un maintenant, ou plus tard depuis la file.</p>}

            <footer className="mt-4 flex items-center justify-between gap-3 text-sm">
              <button type="button" className="underline" disabled={Boolean(busy)} onClick={removeItem}>Retirer de la file</button>
              <button type="button" className={button} style={{ background: accent, borderColor: accent, color: '#191916' }} onClick={onClose}>Fermer (Échap)</button>
            </footer>
          </>
        ) : !full && !error ? <p role="status" className="text-sm">Mise de côté…</p> : null}
        {error && !item ? <p role="alert" className="text-sm" style={{ color: '#FF978F' }}>{error}</p> : null}
      </div>
    </div>
  )
}
