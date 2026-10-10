/**
 * The files ready to post, in the browser: one PNG per picture slide, the
 * clip for a video slide, with its dressing apart when it is not a montage, the
 * caption as text; numbered, zipped, downloaded. Nothing crosses a function.
 */

export type ExportSlide = { index: number; kind: 'image' | 'video'; renderUrl: string; overlayUrl?: string; videoUrl?: string; videoType?: string }

const pad = (n: number) => String(n).padStart(2, '0')

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(`fichier ${response.status}`)
  return response.arrayBuffer()
}

export async function buildExportZip(slides: ExportSlide[], caption: string, onProgress?: (done: number, total: number) => void): Promise<Blob> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  const total = slides.length + 1
  let done = 0
  for (const slide of slides) {
    const name = pad(slide.index + 1)
    if (slide.kind === 'video' && slide.videoUrl) {
      const ext = slide.videoType?.includes('webm') ? 'webm' : slide.videoType?.includes('quicktime') ? 'mov' : 'mp4'
      zip.file(`${name}.${ext}`, await fetchBytes(slide.videoUrl))
      if (slide.overlayUrl) zip.file(`${name}-habillage.png`, await fetchBytes(slide.overlayUrl))
    } else {
      zip.file(`${name}.png`, await fetchBytes(slide.renderUrl))
    }
    done += 1; onProgress?.(done, total)
  }
  zip.file('caption.txt', caption)
  onProgress?.(total, total)
  return zip.generateAsync({ type: 'blob' })
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
