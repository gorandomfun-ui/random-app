'use client'

/**
 * Sharing the app from the home: the same panel as the Random share, with
 * the destinations the owner named — Instagram, TikTok, X, Messages,
 * WhatsApp — and the link to copy. What travels is the app: its invitation
 * in the visitor's language, its address, its branded card.
 *
 * A story is posted from a phone. On one, the card goes through the phone's
 * own share sheet. On a computer, the panel shows the card, saves it, copies
 * the text, opens the site — and a QR code hands the whole thing to the
 * phone, which arrives with this panel already open.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'

import { APP_SHARE, appHandoverUrl, appQrUrl, appShareLinks, platformOf, STORY_NAMES, STORY_SITES, type StoryDestination } from '@/lib/share/app'
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

/** A phone or a tablet: something with a share sheet the story apps listen to. A Mac's sheet is not that. */
function hasStorySheet(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false
  return navigator.maxTouchPoints > 1 || /Android|iPhone|iPod|Mobile/i.test(navigator.userAgent)
}

export default function HomeShareMenu({ open, onClose, theme, themeIndex, locale: rawLocale, highlight = null }: Props) {
  const locale = normalizeShareLocale(rawLocale)
  const words = SHARE_PRESENTATION[locale]
  const wording = APP_SHARE[locale]
  const [copied, setCopied] = useState<'link' | 'text' | null>(null)
  const [story, setStory] = useState<StoryDestination | null>(null)

  useEffect(() => {
    if (!open) return
    setStory(null)
    setCopied(null)
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, open])

  const origin = useMemo(() => (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : process.env.NEXT_PUBLIC_BASE_URL || 'https://gorandom.fun'), [])
  const links = useMemo(() => appShareLinks(origin, locale, platformOf(typeof navigator !== 'undefined' ? navigator.userAgent : ''), themeIndex), [locale, origin, themeIndex])
  const text = `${links.text} ${links.url}`

  const copy = useCallback(async (value: string, what: 'link' | 'text') => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(what)
      window.setTimeout(() => setCopied(null), 1400)
    } catch {
      /* Clipboard access can be refused by the browser. */
    }
  }, [])

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

  const saveCard = useCallback(async () => {
    const file = await fetchCard(links.card.story)
    if (file) saveFile(file)
  }, [links.card.story])

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
          <div>
            <div className="mb-5 flex items-start gap-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={links.card.story} alt="" width={135} height={240} className="shrink-0" style={{ width: 135, height: 240, objectFit: 'cover', border: `1px solid ${accent}` }} />
              <div className="flex min-w-0 flex-1 flex-col items-center gap-3 text-center">
                <div className="flex items-center justify-center bg-white p-2" style={{ width: 160, height: 160 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={appQrUrl(origin, appHandoverUrl(origin, locale, story))} alt="" width={144} height={144} style={{ width: 144, height: 144 }} />
                </div>
                <p className="text-sm opacity-90">{wording.scanToShare}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <button className={buttonClass} style={buttonStyle} onClick={() => void saveCard()}>{wording.saveImage}</button>
              <button className={buttonClass} style={buttonStyle} onClick={() => void copy(text, 'text')}>{copied === 'text' ? wording.copied : wording.copyText}</button>
              <a className={buttonClass} style={buttonStyle} href={STORY_SITES[story]} target="_blank" rel="noreferrer">{wording.open} {STORY_NAMES[story]}</a>
            </div>
            <button className="mt-5 text-sm underline opacity-80" onClick={() => setStory(null)}>← {wording.back}</button>
          </div>
        ) : (
          <div>
            <p className="mb-6 text-sm opacity-80">{highlight ? wording.tapToPost : `${links.text} — goRANDOM.fun`}</p>
            <div className="grid grid-cols-2 gap-3">
              <button className={buttonClass} style={highlightStyle('instagram')} onClick={() => void shareStory('instagram')}>Instagram</button>
              <button className={buttonClass} style={highlightStyle('tiktok')} onClick={() => void shareStory('tiktok')}>TikTok</button>
              <a className={buttonClass} style={buttonStyle} href={links.x} target="_blank" rel="noreferrer">X</a>
              <a className={buttonClass} style={buttonStyle} href={links.messages}>{wording.messages}</a>
              <a className={buttonClass} style={buttonStyle} href={links.whatsapp} target="_blank" rel="noreferrer">WhatsApp</a>
              <button className={buttonClass} style={buttonStyle} onClick={() => void copy(links.url, 'link')}>{copied === 'link' ? words.copied : words.copyLink}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
