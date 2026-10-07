/**
 * The browser's side of a publication: each picture slide rendered and made
 * a JPEG (what Instagram takes), sent to the item's folder for the time of
 * the publication; each video slide as its MP4; then start, then the status
 * polled until done.
 */

import { uploadMedia } from './client'
import type { MediaDoc, PostDoc } from './model'
import type { PublishAsset } from './publish'

export type PrepareResult = { ok: true; assets: PublishAsset[] } | { ok: false; reason: string }

async function pngToJpeg(url: string): Promise<Blob> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(`rendu ${response.status}`)
  const bitmap = await createImageBitmap(await response.blob())
  const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
  if (!blob) throw new Error('JPEG')
  return blob
}

export async function prepareInstagramAssets(post: PostDoc, mediaById: Map<string, MediaDoc>, renderUrl: (index: number) => string, onProgress?: (text: string) => void): Promise<PrepareResult> {
  const assets: PublishAsset[] = []
  for (const [index, slide] of post.slides.entries()) {
    const media = slide.mediaId ? mediaById.get(slide.mediaId) ?? null : null
    if (media?.contentType.startsWith('video/')) {
      if (media.contentType !== 'video/mp4') return { ok: false, reason: `Slide ${index + 1} : Instagram prend un MP4 ; monte l’extrait d’abord.` }
      if (media.kind !== 'montage') return { ok: false, reason: `Slide ${index + 1} : monte l’extrait pour lui donner son habillage et ses dimensions.` }
      assets.push({ slideIndex: index, url: media.blobUrl, kind: 'video' })
      continue
    }
    onProgress?.(`Rendu de la slide ${index + 1}`)
    const itemId = slide.itemId ?? post.queueItemIds[0]
    const jpeg = await pngToJpeg(renderUrl(index))
    const uploaded = await uploadMedia(itemId, jpeg, 'render')
    if (!uploaded.media) return { ok: false, reason: uploaded.message ?? `Slide ${index + 1} : envoi impossible.` }
    assets.push({ slideIndex: index, url: uploaded.media.blobUrl, kind: 'image' })
  }
  return { ok: true, assets }
}

export type PublishOutcome = { state: 'published'; remoteUrl: string | null; commented: boolean } | { state: 'failed'; reason: string }

const headers = { 'Content-Type': 'application/json' }

export async function publishInstagram(postId: string, assets: PublishAsset[], keep: string[], onStatus?: (text: string) => void): Promise<PublishOutcome> {
  const started = await fetch('/api/admin/comm/publish/instagram', { method: 'POST', headers, body: JSON.stringify({ postId, assets, keep }) }).then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) }))
  if (started.status !== 200) return { state: 'failed', reason: started.error ?? `Démarrage refusé (${started.status}).` }
  onStatus?.('Instagram prépare le média…')
  const deadline = Date.now() + 6 * 60 * 1000
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 3000))
    const body = await fetch(`/api/admin/comm/publish/instagram?postId=${postId}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ state: 'waiting' }))
    if (body.state === 'published') return { state: 'published', remoteUrl: body.remoteUrl ?? null, commented: body.commented === true }
    if (body.state === 'failed') return { state: 'failed', reason: body.reason ?? 'échec' }
    if (body.state === 'idle') return { state: 'failed', reason: 'La publication s’est perdue en route. Réessaie.' }
    onStatus?.(`Instagram prépare le média… (${(body.statuses ?? []).join(', ') || 'en cours'})`)
  }
  return { state: 'failed', reason: 'Instagram n’a pas fini en six minutes. Réessaie plus tard.' }
}
