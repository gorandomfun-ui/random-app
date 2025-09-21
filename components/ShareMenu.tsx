'use client'

import React, { useMemo, useState } from 'react'

type Theme = { deep: string; cream: string; text: string }
type Props = {
  open: boolean
  onClose: () => void
  title?: string
  url?: string
  theme?: Theme
}

function buildShareUrls(url: string, text: string) {
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
  title = 'Random',
  url = '',
  theme,
}: Props) {
  const [copied, setCopied] = useState(false)
  const urls = useMemo(() => buildShareUrls(url, title), [url, title])

  if (!open) return null

  const bg = theme?.deep ?? '#111'
  const fg = theme?.cream ?? '#fff'
  const text = theme?.text ?? '#fff'
  const soft = 'rgba(255,255,255,0.12)'
  const softer = 'rgba(255,255,255,0.08)'

  const canNativeShare =
    typeof navigator !== 'undefined' && typeof (navigator as any).share === 'function'

  async function nativeShare() {
    try {
      await (navigator as any).share({ title, url })
      onClose()
    } catch {
      /* ignore */
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
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
              href={`/api/share/og?title=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`}
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
              value={url}
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
