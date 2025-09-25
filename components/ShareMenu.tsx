'use client'

import React, { useMemo, useState } from 'react'
import type { DisplayItem } from '../lib/random/clientTypes'
import { getSourceLabel } from '../lib/random/clientTypes'

type Theme = { deep: string; cream: string; text: string }
type ShareableItem = DisplayItem | null | undefined

type Props = {
  open: boolean
  onClose: () => void
  title?: string
  url?: string
  theme?: Theme
  item?: ShareableItem
}

type ShareUrls = {
  twitter: string
  facebook: string
  reddit: string
  whatsapp: string
  telegram: string
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
}: Props) {
  const [copied, setCopied] = useState(false)
  const shareUrl = url || (item && 'url' in item ? item.url || '' : '')
  const shareTitle = useMemo(() => {
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

  const urls = useMemo(() => buildShareUrls(shareUrl || '', shareTitle || 'Random'), [shareUrl, shareTitle])

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
      await navigator.share({ title: shareTitle, url: shareUrl })
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
          <h3 className="text-lg font-bold tracking-wide">Share</h3>
          <button
            className="rounded-full px-3 py-1 text-sm"
            onClick={onClose}
            style={{ background: softer }}
            aria-label="Close"
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
              Share with device…
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
            <a
              className="rounded-xl py-2 text-center font-medium"
              href={`/api/share/og?title=${encodeURIComponent(shareTitle)}&url=${encodeURIComponent(shareUrl)}`}
              target="_blank"
              rel="noreferrer"
              style={{ background: soft, color: text }}
            >
              OG image
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
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
