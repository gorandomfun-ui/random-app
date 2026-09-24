'use client'

/**
 * A story is posted from a phone. On one, the branded card goes through the
 * phone's own share sheet. On a computer, this view takes over: a QR code
 * first — the phone scans it and arrives with the share panel open, one tap
 * from the story — then the card to save and the text to copy for whoever
 * wants to post by hand. Shared by the home's panel and the Random one.
 */

import { useCallback, useEffect, useState } from 'react'

import { APP_SHARE, appQrUrl } from '@/lib/share/app'
import { canRenderGlitchStory, renderGlitchStory } from '@/lib/share/glitchVideo'
import type { ShareLocale } from '@/lib/share/presentation'

export type StoryColors = { bg: string; fg: string; accent: string }

type Props = {
  locale: ShareLocale
  colors: StoryColors
  /** The card the phone will share, shown small; null when there is none to show. */
  cardUrl: string | null
  /** What the QR code hands the phone. */
  handoverUrl: string
  /** What "copy the text" copies. */
  text: string
  onBack: () => void
}

/** A phone or a tablet: something with a share sheet the story apps listen to. A Mac's sheet is not that. */
export function hasStorySheet(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false
  return navigator.maxTouchPoints > 1 || /Android|iPhone|iPod|Mobile/i.test(navigator.userAgent)
}

export async function fetchCard(url: string, name = 'gorandom.png'): Promise<File | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    return new File([await response.blob()], name, { type: 'image/png' })
  } catch {
    return null
  }
}

export function saveFile(file: File): void {
  const href = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = file.name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(href), 5000)
}

export default function StoryHandover({ locale, colors, cardUrl, handoverUrl, text, onBack }: Props) {
  const wording = APP_SHARE[locale]
  const [copied, setCopied] = useState(false)
  const [video, setVideo] = useState<'idle' | 'rendering' | 'unavailable'>('idle')
  useEffect(() => { setVideo(canRenderGlitchStory() ? 'idle' : 'unavailable') }, [])
  const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : process.env.NEXT_PUBLIC_BASE_URL || 'https://gorandom.fun'

  const copyText = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      /* Clipboard access can be refused by the browser. */
    }
  }, [text])

  const saveCard = useCallback(async () => {
    if (!cardUrl) return
    const file = await fetchCard(cardUrl)
    if (file) saveFile(file)
  }, [cardUrl])

  // Three seconds of the card with the site's glitch, recorded here and saved.
  const saveVideo = useCallback(async () => {
    if (!cardUrl || video !== 'idle') return
    setVideo('rendering')
    try {
      const file = await renderGlitchStory(cardUrl)
      if (file) saveFile(file)
    } finally {
      setVideo('idle')
    }
  }, [cardUrl, video])

  const buttonClass = 'flex min-h-[50px] items-center justify-center rounded-full px-4 py-2 text-center font-tomorrow text-sm font-bold uppercase tracking-[0.08em] transition-transform active:scale-[0.98]'
  const secondaryStyle = { background: 'transparent', color: colors.fg, border: `2px solid ${colors.accent}` }

  return (
    <div>
      <div className="mb-5 flex items-center gap-5">
        <div className="flex shrink-0 items-center justify-center bg-white p-2" style={{ width: 216, height: 216 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={appQrUrl(origin, handoverUrl)} alt="" width={200} height={200} style={{ width: 200, height: 200 }} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="font-tomorrow text-base font-bold uppercase tracking-[0.06em]">{wording.storyFromPhone}</p>
          <p className="text-sm opacity-85">{wording.scanToShare}</p>
        </div>
        {cardUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cardUrl} alt="" width={96} height={170} className="hidden shrink-0 sm:block" style={{ width: 96, height: 170, objectFit: 'cover', border: `1px solid ${colors.accent}` }} />
        ) : null}
      </div>
      <div className={`grid gap-3 ${video === 'unavailable' ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-3'}`}>
        <button className={buttonClass} style={secondaryStyle} onClick={() => void saveCard()} disabled={!cardUrl}>{wording.saveImage}</button>
        {video !== 'unavailable' ? (
          <button className={buttonClass} style={secondaryStyle} onClick={() => void saveVideo()} disabled={!cardUrl || video === 'rendering'}>{video === 'rendering' ? wording.preparing : wording.saveVideo}</button>
        ) : null}
        <button className={buttonClass} style={secondaryStyle} onClick={() => void copyText()}>{copied ? wording.copied : wording.copyText}</button>
      </div>
      <button className="mt-5 text-sm underline opacity-80" onClick={onBack}>← {wording.back}</button>
    </div>
  )
}
