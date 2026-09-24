'use client'

/**
 * Sharing the app from the home: the same panel as the Random share, with
 * the destinations the owner named — Instagram, TikTok, X, Messages,
 * WhatsApp — and the link to copy. What travels is the app: its invitation
 * in the visitor's language, its address, its branded card.
 *
 * A story is posted from a phone. On one, the card goes through the phone's
 * own share sheet. On a computer, the handover view takes over: a QR code
 * the phone scans to arrive with this panel already open.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'

import StoryHandover, { fetchCard, hasStorySheet } from '@/components/StoryHandover'
import { APP_SHARE, appHandoverUrl, appShareLinks, platformOf, STORY_NAMES, type StoryDestination } from '@/lib/share/app'
import { normalizeShareLocale, SHARE_PRESENTATION } from '@/lib/share/presentation'
import type { Theme } from '@/lib/theme'

type Props = {
  open: boolean
  onClose: () => void
  theme: Theme
  themeIndex?: number
  locale?: string | null
  /** Arrived from a computer's QR code: this destination is the one to tap. */
  highlight?: StoryDestination | null
}

export default function HomeShareMenu({ open, onClose, theme, themeIndex, locale: rawLocale, highlight = null }: Props) {
  const locale = normalizeShareLocale(rawLocale)
  const words = SHARE_PRESENTATION[locale]
  const wording = APP_SHARE[locale]
  const [copied, setCopied] = useState(false)
  const [story, setStory] = useState<StoryDestination | null>(null)

  useEffect(() => {
    if (!open) return
    setStory(null)
    setCopied(false)
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, open])

  const origin = useMemo(() => (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : process.env.NEXT_PUBLIC_BASE_URL || 'https://gorandom.fun'), [])
  const links = useMemo(() => appShareLinks(origin, locale, platformOf(typeof navigator !== 'undefined' ? navigator.userAgent : ''), themeIndex), [locale, origin, themeIndex])
  const text = `${links.text} ${links.url}`

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(links.url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      /* Clipboard access can be refused by the browser. */
    }
  }, [links.url])

  const shareStory = useCallback(async (destination: StoryDestination) => {
    if (!hasStorySheet()) {
      setStory(destination)
      return
    }
    const file = await fetchCard(links.card.story)
    try {
      if (file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Random', text })
      } else {
        await navigator.share({ title: 'Random', text: links.text, url: links.url })
      }
      onClose()
    } catch {
      // A cancelled share sheet is not an error for the interface.
    }
  }, [links, onClose, text])

  if (!open) return null

  const bg = theme.deep
  const fg = theme.cream
  const accent = theme.text
  const buttonClass = 'flex min-h-[58px] items-center justify-center rounded-full px-4 py-3 text-center font-tomorrow text-sm font-bold uppercase tracking-[0.08em] transition-transform active:scale-[0.98]'
  const buttonStyle = { background: accent, color: fg }
  const highlightStyle = (destination: StoryDestination) => (highlight === destination ? { ...buttonStyle, boxShadow: `0 0 0 4px ${fg}` } : buttonStyle)

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center" aria-modal="true" role="dialog" aria-label={words.share}>
      <button className="absolute inset-0 cursor-default" onClick={onClose} style={{ background: 'rgba(0,0,0,0.62)' }} aria-label={words.close} />

      <div className="relative w-[92vw] max-w-[560px] border border-white/10 p-5 shadow-2xl sm:p-7" style={{ background: bg, color: fg, borderRadius: 0 }}>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h3 className="font-tomorrow text-xl font-bold uppercase tracking-[0.08em]">{story ? STORY_NAMES[story] : words.share}</h3>
          <button className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl" onClick={onClose} style={{ background: accent, color: fg }} aria-label={words.close}>×</button>
        </div>

        {story ? (
          <StoryHandover locale={locale} colors={{ bg, fg, accent }} cardUrl={links.card.story} handoverUrl={appHandoverUrl(origin, locale, story)} text={text} onBack={() => setStory(null)} />
        ) : (
          <div>
            <p className="mb-6 text-sm opacity-80">{highlight ? wording.tapToPost : `${links.text} — goRANDOM.fun`}</p>
            <div className="grid grid-cols-2 gap-3">
              <button className={buttonClass} style={highlightStyle('instagram')} onClick={() => void shareStory('instagram')}>Instagram</button>
              <button className={buttonClass} style={highlightStyle('tiktok')} onClick={() => void shareStory('tiktok')}>TikTok</button>
              <a className={buttonClass} style={buttonStyle} href={links.x} target="_blank" rel="noreferrer">X</a>
              <a className={buttonClass} style={buttonStyle} href={links.messages}>{wording.messages}</a>
              <a className={buttonClass} style={buttonStyle} href={links.whatsapp} target="_blank" rel="noreferrer">WhatsApp</a>
              <button className={buttonClass} style={buttonStyle} onClick={() => void copyLink()}>{copied ? words.copied : words.copyLink}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
