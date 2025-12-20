'use client'

import React, { useMemo, useState } from 'react'
import type { DisplayItem } from '../lib/random/clientTypes'
import { getSourceHref, getSourceLabel } from '../lib/random/clientTypes'
import { useI18n } from '@/providers/I18nProvider'

type Theme = { deep: string; cream: string; text: string }
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
  item?: ShareableItem
  list?: ShareListEntry[]
}

type ShareUrls = {
  twitter: string
  facebook: string
  reddit: string
  whatsapp: string
  telegram: string
}

const truncate = (text: string, maxLength: number) => {
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

let cachedShareLogo: File | null = null

async function getShareLogoFile(): Promise<File | null> {
  if (cachedShareLogo) return cachedShareLogo
  try {
    const response = await fetch('/elements/logo_black.png')
    if (!response.ok) return null
    const blob = await response.blob()
    cachedShareLogo = new File([blob], 'random-logo.png', { type: blob.type || 'image/png' })
    return cachedShareLogo
  } catch {
    return null
  }
}

function buildShareUrls(url: string, text: string): ShareUrls {
  const u = encodeURIComponent(url)
  const t = encodeURIComponent(text)
  return {
    twitter: `https://twitter.com/intent/tweet?url=${u}&text=${t}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    reddit: `https://www.reddit.com/submit?url=${u}&title=${t}`,
    whatsapp: `https://api.whatsapp.com/send?text=${t}%20${u}`,
    telegram: `https://t.me/share/url?url=${u}&text=${t}`,
  }
}

export default function ShareMenu({
  open,
  onClose,
  title,
  url,
  theme,
  item,
  list,
}: Props) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const siteOrigin = useMemo(() => {
    if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin
    return process.env.NEXT_PUBLIC_BASE_URL || 'https://random.app'
  }, [])

  const directItemUrl = useMemo(() => {
    if (!item || item.type === 'encourage') return null
    const linkable = item as Parameters<typeof getSourceHref>[0]
    const href = getSourceHref(linkable, item.type === 'web' ? item.url : undefined)
    if (!href) return null
    return /^https?:\/\//i.test(href) ? href : null
  }, [item])

  const shareUrl = useMemo(() => {
    if (directItemUrl) return directItemUrl
    const base = (siteOrigin || '').replace(/\/$/, '')
    if (!url) return `${base || 'https://random.app'}/random`
    if (/^https?:\/\//i.test(url)) return url
    const trimmed = url.startsWith('/') ? url.slice(1) : url
    return base ? `${base}/${trimmed}` : url
  }, [directItemUrl, siteOrigin, url])

  const siteName = useMemo(() => t('shareMenu.siteName', 'Random'), [t])

  const contentTitle = useMemo(() => {
    if (title && title.trim()) return title
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
    switch (item.type) {
      case 'image':
        return item.title || getSourceLabel(item.source, item.provider) || ''
      case 'video':
      case 'web':
        return item.text ? truncate(item.text, 200) : item.url || getSourceLabel(item.source, item.provider) || ''
      case 'quote':
        return item.text ? truncate(item.text, 200) : ''
      case 'fact':
      case 'joke':
      case 'encourage':
        return item.text ? truncate(item.text, 220) : ''
      default:
        return ''
    }
  }, [item])

  const shareListText = useMemo(() => {
    if (!list?.length) return ''
    return list
      .map((entry, idx) => {
        const title = entry.title || entry.text || `Item ${idx + 1}`
        return entry.url ? `${title}\n${entry.url}` : title
      })
      .join('\n\n')
  }, [list])

  const shareHeadline = useMemo(() => contentTitle || siteName, [contentTitle, siteName])

  const shareMessage = useMemo(() => {
    const snippet = contentSnippet || shareHeadline
    const parts = new Set([shareHeadline, snippet, siteName])
    const main = Array.from(parts).filter(Boolean).join('\n')
    return shareListText ? `${main}\n\n${shareListText}` : main
  }, [contentSnippet, shareHeadline, shareListText, siteName])

  const shareText = useMemo(() => {
    const snippet = contentSnippet || shareHeadline
    const main = `${snippet}\n${siteName}`
    return shareListText ? `${main}\n\n${shareListText}` : main
  }, [contentSnippet, shareHeadline, shareListText, siteName])

  const urls = useMemo(() => buildShareUrls(shareUrl || '', shareMessage || siteName), [shareMessage, shareUrl, siteName])

  if (!open) return null

  const bg = theme?.deep ?? '#111'
  const fg = theme?.cream ?? '#fff'
  const text = theme?.text ?? '#fff'
  const soft = 'rgba(255,255,255,0.12)'
  const softer = 'rgba(255,255,255,0.08)'

  const canNativeShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  async function nativeShare() {
    try {
      const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
      const baseData: ShareData = {
        title: shareHeadline,
        text: shareText,
        url: shareUrl,
      }
      const logoFile = typeof nav.canShare === 'function' ? await getShareLogoFile() : null
      if (logoFile) {
        const withFile = { ...baseData, files: [logoFile] }
        if (nav.canShare?.(withFile)) {
          await nav.share(withFile)
          onClose()
          return
        }
      }
      await nav.share(baseData)
      onClose()
    } catch {
      /* ignore */
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 900)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center" aria-modal="true" role="dialog">
      {/* Backdrop */}
      <div className="absolute inset-0" onClick={onClose} style={{ background: 'rgba(0,0,0,0.5)' }} />

      {/* Panel */}
      <div
        className="relative w-[92vw] max-w-[520px] rounded-2xl shadow-2xl p-5"
        style={{ background: bg, color: fg }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold tracking-wide">{t('shareMenu.title', 'Share')}</h3>
          <button
            className="rounded-full px-3 py-1 text-sm"
            onClick={onClose}
            style={{ background: softer }}
            aria-label={t('shareMenu.close', 'Close')}
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          {canNativeShare && (
            <button
              onClick={nativeShare}
              className="w-full rounded-xl py-3 font-semibold"
              style={{ background: soft }}
            >
              {t('shareMenu.native', 'Share by message')}
            </button>
          )}

          <div className="grid grid-cols-3 gap-3">
            <a className="rounded-xl py-2 text-center font-medium" href={urls.twitter} target="_blank" rel="noreferrer" style={{ background: soft, color: text }}>
              Twitter/X
            </a>
            <a className="rounded-xl py-2 text-center font-medium" href={urls.facebook} target="_blank" rel="noreferrer" style={{ background: soft, color: text }}>
              Facebook
            </a>
            <a className="rounded-xl py-2 text-center font-medium" href={urls.reddit} target="_blank" rel="noreferrer" style={{ background: soft, color: text }}>
              Reddit
            </a>
            <a className="rounded-xl py-2 text-center font-medium" href={urls.whatsapp} target="_blank" rel="noreferrer" style={{ background: soft, color: text }}>
              WhatsApp
            </a>
            <a className="rounded-xl py-2 text-center font-medium" href={urls.telegram} target="_blank" rel="noreferrer" style={{ background: soft, color: text }}>
              Telegram
            </a>
          </div>

          <div className="flex gap-2">
            <input
              className="flex-1 rounded-xl px-3 py-2 text-sm"
              value={shareUrl}
              readOnly
              style={{ background: softer, color: fg, outline: 'none' }}
            />
            <button
              onClick={copy}
              className="rounded-xl px-4 text-sm font-semibold"
              style={{ background: soft }}
            >
              {copied ? t('shareMenu.copied', 'Copied!') : t('shareMenu.copy', 'Copy')}
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}
