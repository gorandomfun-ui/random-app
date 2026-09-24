'use client'

/**
 * Sharing the app from the home: the same panel as the Random share, with
 * the destinations the owner named — Instagram, TikTok, X, Messages,
 * WhatsApp — and the link to copy. What travels is the app: its invitation
 * in the visitor's language, its address, its branded card.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'

import { APP_SHARE, appShareLinks, platformOf } from '@/lib/share/app'
import { normalizeShareLocale, SHARE_PRESENTATION } from '@/lib/share/presentation'
import type { Theme } from '@/lib/theme'

type Props = {
  open: boolean
  onClose: () => void
  theme: Theme
  themeIndex?: number
  locale?: string | null
}

type StoryDestination = 'instagram' | 'tiktok'
const STORY_SITES: Record<StoryDestination, string> = { instagram: 'https://www.instagram.com/', tiktok: 'https://www.tiktok.com/upload' }

async function fetchCard(url: string): Promise<File | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    return new File([await response.blob()], 'gorandom.png', { type: 'image/png' })
  } catch {
    return null
  }
}

function saveFile(file: File): void {
  const href = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = file.name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(href), 5000)
}

export default function HomeShareMenu({ open, onClose, theme, themeIndex, locale: rawLocale }: Props) {
  const locale = normalizeShareLocale(rawLocale)
  const words = SHARE_PRESENTATION[locale]
  const wording = APP_SHARE[locale]
  const [copied, setCopied] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setNotice(null)
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, open])

  const links = useMemo(() => {
    const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : process.env.NEXT_PUBLIC_BASE_URL || 'https://gorandom.fun'
    const platform = platformOf(typeof navigator !== 'undefined' ? navigator.userAgent : '')
    return appShareLinks(origin, locale, platform, themeIndex)
  }, [locale, themeIndex])

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(links.url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      /* Clipboard access can be refused by the browser. */
    }
  }, [links.url])

  // A story takes an image, not a link: the branded card through the phone's own share sheet; on a
  // computer, the card is saved, the invitation and the link copied, and the site opened.
  const shareStory = useCallback(async (destination: StoryDestination) => {
    const text = `${links.text} ${links.url}`
    const file = await fetchCard(links.card.story)
    try {
      if (typeof navigator.share === 'function') {
        if (file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'Random', text })
          onClose()
          return
        }
        await navigator.share({ title: 'Random', text: links.text, url: links.url })
        onClose()
        return
      }
    } catch {
      // A cancelled share sheet is not an error for the interface.
      return
    }
    if (file) saveFile(file)
    try { await navigator.clipboard.writeText(text) } catch { /* The notice still says what to paste. */ }
    setNotice(wording.savedAndCopied)
    window.open(STORY_SITES[destination], '_blank', 'noopener,noreferrer')
  }, [links, onClose, wording.savedAndCopied])

  if (!open) return null

  const bg = theme.deep
  const fg = theme.cream
  const accent = theme.text
  const buttonClass = 'flex min-h-[58px] items-center justify-center rounded-full px-4 py-3 text-center font-tomorrow text-sm font-bold uppercase tracking-[0.08em] transition-transform active:scale-[0.98]'
  const buttonStyle = { background: accent, color: fg }

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center" aria-modal="true" role="dialog" aria-label={words.share}>
      <button className="absolute inset-0 cursor-default" onClick={onClose} style={{ background: 'rgba(0,0,0,0.62)' }} aria-label={words.close} />

      <div className="relative w-[92vw] max-w-[560px] border border-white/10 p-5 shadow-2xl sm:p-7" style={{ background: bg, color: fg, borderRadius: 0 }}>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h3 className="font-tomorrow text-xl font-bold uppercase tracking-[0.08em]">{words.share}</h3>
          <button className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl" onClick={onClose} style={{ background: accent, color: fg }} aria-label={words.close}>×</button>
        </div>

        <p className="mb-6 text-sm opacity-80">{links.text} — goRANDOM.fun</p>

        <div className="grid grid-cols-2 gap-3">
          <button className={buttonClass} style={buttonStyle} onClick={() => void shareStory('instagram')}>Instagram</button>
          <button className={buttonClass} style={buttonStyle} onClick={() => void shareStory('tiktok')}>TikTok</button>
          <a className={buttonClass} style={buttonStyle} href={links.x} target="_blank" rel="noreferrer">X</a>
          <a className={buttonClass} style={buttonStyle} href={links.messages}>{wording.messages}</a>
          <a className={buttonClass} style={buttonStyle} href={links.whatsapp} target="_blank" rel="noreferrer">WhatsApp</a>
          <button className={buttonClass} style={buttonStyle} onClick={() => void copyLink()}>{copied ? words.copied : words.copyLink}</button>
        </div>

        {notice ? <p className="mt-5 text-sm" style={{ color: accent }}>{notice}</p> : null}
      </div>
    </div>
  )
}
