'use client'

/**
 * The small panel over a content in the curation: one press, the content is
 * in the queue with its picture taken on the spot. A clip is filmed from
 * here, in Chrome. Nothing else to choose. Loaded only when the Comm button
 * is pressed; the public Random never carries it.
 */

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

import { canCaptureTab, CHROME_NOTE, commAdd, commImportSource, commRemove, desktopWithoutTabCapture, LICENSE_COLORS, LICENSE_WORDS, screenshotOf, uploadMedia, type QueueItemWithMedia, type QueueStatus } from '@/lib/comm/client'

export type CommPanelProps = {
  itemId: string
  accent: string
  onClose: () => void
  onQueueChange: (inQueue: boolean, status: QueueStatus) => void
  captureTarget?: () => HTMLElement | null
}

export default function CommPanel({ itemId, accent, onClose, onQueueChange, captureTarget }: CommPanelProps) {
  const [item, setItem] = useState<QueueItemWithMedia | null>(null)
  const [status, setStatus] = useState<QueueStatus | null>(null)
  const [full, setFull] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [taken, setTaken] = useState<string | null>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const captureRef = useRef(captureTarget)
  captureRef.current = captureTarget

  // One press: into the queue, and the picture taken at once when there is one to take.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await commAdd(itemId)
      if (cancelled) return
      const next = { count: result.count ?? 0, max: result.max ?? 30, blob: result.blob ?? false }
      setStatus(next)
      if (!result.item) {
        if (result.status === 409) { setFull(true); onQueueChange(false, next); return }
        setError(result.error === 'unsupported' ? 'Ce type de contenu ne se partage pas.' : 'Mise de côté impossible. Vérifie ton accès.')
        return
      }
      setItem(result.item); onQueueChange(true, next)
      if (!next.blob) return
      const already = result.item.media.some((m) => ['image', 'gif', 'screenshot', 'capture', 'import'].includes(m.kind))
      if (already) { setTaken('déjà pris'); return }
      const type = result.item.contentType
      if (type === 'image') {
        const gif = result.item.snapshot.url.toLowerCase().includes('.gif') || ['giphy', 'tenor'].includes(result.item.snapshot.provider.toLowerCase())
        setBusy(gif ? 'Récupération du GIF' : 'Récupération de l’image')
        const imported = await commImportSource(result.item._id, gif ? 'gif' : 'image')
        if (cancelled) return
        setBusy('')
        if (imported.media) setTaken(gif ? 'GIF pris' : 'image prise'); else setError(imported.message ?? 'L’image n’a pas pu être récupérée.')
      } else if (type === 'web' || type === 'fact' || type === 'quote' || type === 'joke') {
        const target = captureRef.current?.() ?? null
        if (!target) { setError('La zone de contenu est introuvable.'); return }
        setBusy('Capture de l’écran')
        const blob = await screenshotOf(target)
        if (cancelled) return
        if (!blob) { setBusy(''); setError('La capture a échoué (contenu d’un autre site).'); return }
        const uploaded = await uploadMedia(result.item._id, blob, 'screenshot')
        if (cancelled) return
        setBusy('')
        if (uploaded.media) setTaken('capture prise'); else setError(uploaded.message ?? 'Envoi impossible.')
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mounted for one content
  }, [itemId])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); closeRef.current() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const removeItem = useCallback(async () => {
    if (!item) return
    setBusy('Retrait')
    const result = await commRemove(item._id)
    setBusy('')
    onQueueChange(false, { count: result.count ?? 0, max: result.max ?? 30, blob: result.blob ?? false })
    onClose()
  }, [item, onClose, onQueueChange])

  const type = item?.contentType
  const chrome = canCaptureTab()
  const button = 'rounded-full border px-4 py-2 text-sm font-bold uppercase tracking-wide disabled:opacity-50'

  return (
    // The sheet stays clear of the ad bar and the phone's bottom edge, and scrolls when the screen is short.
    <div role="dialog" aria-modal="true" aria-label="Comm" className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-3 sm:items-center" style={{ paddingBottom: 'calc(var(--ad-bar-height, 0px) + env(safe-area-inset-bottom, 0px) + 12px)' }} onClick={onClose}>
      <div className="w-full max-w-md overflow-y-auto rounded-2xl p-4 shadow-2xl" style={{ background: '#191916', color: '#F8F5E6', border: `1px solid ${accent}`, maxHeight: 'calc(100vh - var(--ad-bar-height, 0px) - env(safe-area-inset-bottom, 0px) - 24px)' }} onClick={(event) => event.stopPropagation()}>
        <header className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-tomorrow text-lg font-black uppercase" style={{ color: accent }}>Comm</h2>
          <div className="text-sm">{status ? <span>{status.count} / {status.max}</span> : null}<Link href="/admin/comm" target="_blank" className="ml-3 underline">La file</Link></div>
        </header>

        {full ? <p role="alert" className="text-sm">File pleine : {status?.count} / {status?.max}. Supprime des éléments dans <Link href="/admin/comm" target="_blank" className="underline">la file</Link>.</p> : null}

        {item ? (
          <>
            <p className="text-sm leading-snug"><span className="font-bold">{item.snapshot.title}</span><br /><span className="opacity-80">{item.snapshot.providerLabel}{item.snapshot.author ? ` · ${item.snapshot.author}` : ''}</span><span title={LICENSE_WORDS[item.licenseHint]} className="ml-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: LICENSE_COLORS[item.licenseHint] }} /></p>
            {!status?.blob ? <p role="alert" className="mt-2 text-xs" style={{ color: '#E5972B' }}>Le stockage n’est pas configuré : l’élément est dans la file, sans média.</p> : null}
            {busy ? <p role="status" className="mt-3 text-sm">{busy}…</p> : null}
            {taken ? <p className="mt-3 text-sm" style={{ color: accent }}>C’est dans la file, {taken}.</p> : null}
            {error ? <p role="alert" className="mt-3 text-sm" style={{ color: '#FF978F' }}>{error}</p> : null}
            {type === 'video' ? (
              <div className="mt-3 space-y-2">
                {chrome ? <Link href={`/admin/comm/capture/${item._id}`} target="_blank" className={button} style={{ borderColor: accent, color: accent, display: 'inline-block' }}>Filmer un extrait</Link> : null}
                <p className="text-xs opacity-80">{chrome ? 'La page de capture s’ouvre : tu choisis la seconde de départ, Chrome filme l’onglet avec le son, tu arrêtes quand tu veux, l’extrait arrive dans la file.' : desktopWithoutTabCapture() ? CHROME_NOTE : 'Sur téléphone : enregistre l’écran, puis « Importer » depuis la file.'}</p>
              </div>
            ) : null}
            <footer className="mt-4 flex items-center justify-between gap-3 text-sm">
              <button type="button" className="underline" disabled={Boolean(busy)} onClick={removeItem}>Retirer de la file</button>
              <button type="button" className={button} style={{ background: accent, borderColor: accent, color: '#191916' }} onClick={onClose}>Fermer</button>
            </footer>
          </>
        ) : !full && !error ? <p role="status" className="text-sm">Mise de côté…</p> : null}
        {error && !item ? <p role="alert" className="text-sm" style={{ color: '#FF978F' }}>{error}</p> : null}
      </div>
    </div>
  )
}
