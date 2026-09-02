'use client'

import React, { useEffect, useMemo, useState } from 'react'
import type { DisplayItem } from '../lib/random/clientTypes'
import { getSourceHref, getSourceLabel } from '../lib/random/clientTypes'
import { useI18n } from '@/providers/I18nProvider'
import {
  SHARE_PRESENTATION,
  normalizeShareLocale,
  type ShareLocale,
} from '@/lib/share/presentation'

type Theme = { bg?: string; deep: string; cream: string; text: string }
type ShareableItem = DisplayItem | null | undefined

type ShareListEntry = {
  title: string
  text?: string
  url?: string
}

type Props = {
  open: boolean
  onClose: () => void
  title?: string
  url?: string
  theme?: Theme
  themeIndex?: number
  localeOverride?: ShareLocale
  item?: ShareableItem
  itemId?: string
  list?: ShareListEntry[]
}

const truncate = (text: string, maxLength: number) => {
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function buildShareUrls(url: string, text: string) {
  const encodedUrl = encodeURIComponent(url)
  const encodedText = encodeURIComponent(text)
  return {
    x: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    reddit: `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedText}`,
    whatsapp: `https://api.whatsapp.com/send?text=${encodedText}%20${encodedUrl}`,
  }
}

export default function ShareMenu({
  open,
  onClose,
  title,
  url,
  theme,
  themeIndex,
  localeOverride,
  item,
  itemId,
  list,
}: Props) {
  const { locale: appLocale } = useI18n()
  const [copied, setCopied] = useState(false)
  const locale = localeOverride ?? normalizeShareLocale(appLocale)
  const translated = SHARE_PRESENTATION[locale]

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, open])

  const siteOrigin = useMemo(() => {
    if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin
    return process.env.NEXT_PUBLIC_BASE_URL || 'https://gorandom.fun'
  }, [])

  const resolvedItemId = useMemo(() => {
    if (itemId && /^[a-f0-9]{24}$/i.test(itemId.trim())) return itemId.trim()
    if (!item || item.type === 'encourage' || !('_id' in item) || typeof item._id !== 'string') return ''
    return /^[a-f0-9]{24}$/i.test(item._id.trim()) ? item._id.trim() : ''
  }, [item, itemId])

  const originalItemUrl = useMemo(() => {
    if (!item || item.type === 'encourage' || item.type === 'minigame') return null
    const href = getSourceHref(item)
    return href && /^https?:\/\//i.test(href) ? href : null
  }, [item])

  const shareUrl = useMemo(() => {
    const base = (siteOrigin || 'https://gorandom.fun').replace(/\/$/, '')
    if (resolvedItemId) {
      const params = new URLSearchParams({ lang: locale })
      if (typeof themeIndex === 'number' && Number.isInteger(themeIndex)) params.set('theme', String(themeIndex))
      return `${base}/share/${encodeURIComponent(resolvedItemId)}?${params.toString()}`
    }
    if (originalItemUrl) return originalItemUrl
    if (!url) return `${base}/random`
    try {
      const resolved = new URL(url, `${base}/`)
      resolved.searchParams.set('lang', locale)
      return resolved.toString()
    } catch {
      return url
    }
  }, [locale, originalItemUrl, resolvedItemId, siteOrigin, themeIndex, url])

  const contentTitle = useMemo(() => {
    if (title?.trim()) return title.trim()
    if (!item) return 'Random'
    if (item.type === 'image') return item.title || getSourceLabel(item.source, item.provider) || 'Random image'
    if (item.type === 'video') return item.text || getSourceLabel(item.source, item.provider) || 'Random video'
    if (item.type === 'web') return item.text || getSourceLabel(item.source, item.provider) || 'Random link'
    if (item.type === 'quote') return item.author ? `${item.author} — quote` : 'Random quote'
    if (item.type === 'fact') return 'Random fact'
    if (item.type === 'joke') return 'Random joke'
    if (item.type === 'encourage') return item.text
    return 'Random'
  }, [item, title])

  const contentSnippet = useMemo(() => {
    if (!item) return ''
    if (item.type === 'image') return item.title || ''
    if (item.type === 'video' || item.type === 'web') return item.text ? truncate(item.text, 150) : ''
    if (item.type === 'quote' || item.type === 'fact' || item.type === 'joke' || item.type === 'encourage') {
      return item.text ? truncate(item.text, 170) : ''
    }
    return ''
  }, [item])

  const shareListText = useMemo(() => {
    if (!list?.length) return ''
    return list
      .map((entry, index) => {
        const entryTitle = entry.title || entry.text || `Item ${index + 1}`
        return entry.url ? `${entryTitle}\n${entry.url}` : entryTitle
      })
      .join('\n\n')
  }, [list])

  const shareMessage = useMemo(() => {
    const detail = contentSnippet || contentTitle
    const body = detail && detail !== 'Random' ? `${translated.foundOn}\n${detail}` : translated.foundOn
    return shareListText ? `${body}\n\n${shareListText}` : body
  }, [contentSnippet, contentTitle, shareListText, translated.foundOn])

  const urls = useMemo(() => buildShareUrls(shareUrl, shareMessage), [shareMessage, shareUrl])
  const cardUrl = useMemo(() => {
    if (!resolvedItemId) return null
    const params = new URLSearchParams({ id: resolvedItemId, lang: locale })
    if (typeof themeIndex === 'number' && Number.isInteger(themeIndex)) params.set('theme', String(themeIndex))
    return `${siteOrigin.replace(/\/$/, '')}/api/share/og?${params.toString()}`
  }, [locale, resolvedItemId, siteOrigin, themeIndex])

  if (!open) return null

  const bg = theme?.deep ?? '#121210'
  const fg = theme?.cream ?? '#F8F5E6'
  const accent = theme?.text ?? '#0FC55D'

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      /* Clipboard access can be refused by the browser. */
    }
  }

  async function shareToInstagram() {
    const text = `${shareMessage}\n${shareUrl}`
    try {
      if (typeof navigator.share === 'function') {
        if (cardUrl && typeof navigator.canShare === 'function') {
          try {
            const response = await fetch(cardUrl)
            if (response.ok) {
              const file = new File([await response.blob()], 'gorandom-share.png', { type: 'image/png' })
              if (navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], title: contentTitle, text })
                onClose()
                return
              }
            }
          } catch {
            /* Fall back to the regular native share below. */
          }
        }
        await navigator.share({ title: contentTitle, text: shareMessage, url: shareUrl })
        onClose()
        return
      }
      try { await navigator.clipboard.writeText(text) } catch { /* Continue to Instagram. */ }
      window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer')
    } catch {
      /* A cancelled native share is not an error for the interface. */
    }
  }

  const buttonClass = 'flex min-h-[58px] items-center justify-center rounded-full px-4 py-3 text-center font-tomorrow text-sm font-bold uppercase tracking-[0.08em] transition-transform active:scale-[0.98]'
  const buttonStyle = { background: accent, color: fg }

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center" aria-modal="true" role="dialog" aria-label={translated.share}>
      <button className="absolute inset-0 cursor-default" onClick={onClose} style={{ background: 'rgba(0,0,0,0.62)' }} aria-label={translated.close} />

      <div className="relative w-[92vw] max-w-[560px] border border-white/10 p-5 shadow-2xl sm:p-7" style={{ background: bg, color: fg, borderRadius: 0 }}>
        <div className="mb-6 flex items-center justify-between gap-4">
          <h3 className="font-tomorrow text-xl font-bold uppercase tracking-[0.08em]">{translated.share}</h3>
          <button className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl" onClick={onClose} style={{ background: accent, color: fg }} aria-label={translated.close}>×</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button className={buttonClass} style={buttonStyle} onClick={shareToInstagram}>Instagram</button>
          <a className={buttonClass} style={buttonStyle} href={urls.x} target="_blank" rel="noreferrer">X</a>
          <a className={buttonClass} style={buttonStyle} href={urls.facebook} target="_blank" rel="noreferrer">Facebook</a>
          <a className={buttonClass} style={buttonStyle} href={urls.whatsapp} target="_blank" rel="noreferrer">WhatsApp</a>
          <a className={buttonClass} style={buttonStyle} href={urls.reddit} target="_blank" rel="noreferrer">Reddit</a>
          <button className={buttonClass} style={buttonStyle} onClick={copyLink}>
            {copied ? translated.copied : translated.copyLink}
          </button>
        </div>
      </div>
    </div>
  )
}
