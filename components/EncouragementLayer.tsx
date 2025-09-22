'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { getDictionary, normalizeLocale, type Language } from '@/lib/i18n/config'
import { playAppear } from '@/lib/encourage/sound'

/** Early milestones, then we expand spacing */
const BASE_MILESTONES = [6, 12, 24, 36, 60, 84, 120] as const
const LATE_INCREMENT = 36
const LATE_JITTER = 6
const EARLY_JITTER_MAX = 3

/** Card sizing */
const MIN_W = 180
const MAX_W = 280

/** Icons 1.png..N.png */
const DEFAULT_ICON_COUNT = 30
declare global {
  interface Window {
    __ENCOURAGE_ICON_COUNT?: number
    __RANDOM_THEMES?: Array<{ bg: string; deep?: string; cream?: string; text: string }>
  }
}

type Popup = {
  id: number
  x: number
  y: number
  w: number
  msg: string
  icon: number
  z: number
  colors: { bg: string; text: string }
}
type Theme = { bg: string; text: string }

const ri = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a
const shuffle = <T,>(arr: T[]) => [...arr].sort(() => Math.random() - 0.5)

/* ---------- THEMES ---------- */
function getExternalThemes(): Theme[] | null {
  if (typeof window === 'undefined') return null
  try {
    const bag = window.__RANDOM_THEMES
    if (Array.isArray(bag) && bag.length) {
      return bag.map(t => ({ bg: t.bg, text: t.text })).filter(t => t.bg && t.text)
    }
  } catch {}
  return null
}
const FALLBACK_THEMES: Theme[] = [
  { bg:'#65002d', text:'#00b176' },
  { bg:'#191916', text:'#d90845' },
  { bg:'#08203d', text:'#0078a4' },
  { bg:'#0c390d', text:'#ff978f' },
  { bg:'#4ecc7f', text:'#007861' },
  { bg:'#ff978f', text:'#463b46' },
]
const pickTheme = (): Theme => {
  const themes = getExternalThemes() || FALLBACK_THEMES
  return themes[Math.floor(Math.random() * themes.length)]
}

/* ---------- DICTS: encourage.messages ---------- */
function extractEncourageMessages(dict: any): string[] {
  if (!dict) return []
  if (Array.isArray(dict?.encourage?.messages)) return dict.encourage.messages
  if (Array.isArray(dict?.encouragement?.messages)) return dict.encouragement.messages
  if (Array.isArray(dict?.encourageMessages)) return dict.encourageMessages
  if (Array.isArray(dict?.encourage)) return dict.encourage
  return []
}
function* makeMessageGen(list: string[]) {
  while (true) { const bag = shuffle(list); for (const m of bag) yield m }
}

/* ---------- ICON TIERS (1–10 / 11–20 / 21–30) ---------- */
function getIconCount(): number {
  const seed = typeof window !== 'undefined' ? window.__ENCOURAGE_ICON_COUNT : DEFAULT_ICON_COUNT
  const n = Number(seed || DEFAULT_ICON_COUNT)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_ICON_COUNT
}
function splitInTiers(total: number): Array<{start:number,end:number}> {
  // hard-fixed 3 tiers even if total != 30
  const size = Math.ceil(total / 3)
  return [
    { start: 1, end: Math.min(size, total) },
    { start: size + 1, end: Math.min(size * 2, total) },
    { start: size * 2 + 1, end: total }
  ]
}
function sampleIcons(start: number, end: number, k: number): number[] {
  const pool: number[] = []
  for (let i = start; i <= end; i++) pool.push(i)
  return shuffle(pool).slice(0, Math.min(k, Math.max(0, end - start + 1)))
}

/* ---------- NEXT MILESTONE ---------- */
function nextMilestone(afterCount: number, currentTarget: number) {
  for (const m of BASE_MILESTONES) {
    if (m > afterCount) return m + ri(0, EARLY_JITTER_MAX) // slight +jitter
  }
  const jitter = ri(-LATE_JITTER, LATE_JITTER)
  const candidate = afterCount + LATE_INCREMENT + jitter
  return Math.max(candidate, currentTarget + 1)
}

export default function EncouragementLayer({ lang }: { lang?: Language }) {
  /* Locale */
  const [locale, setLocale] = useState<Language>(() => {
    if (lang) return lang
    const htmlLang = typeof document !== 'undefined'
      ? document.documentElement.getAttribute('lang') || ''
      : ''
    const navLang = typeof navigator !== 'undefined' ? navigator.language : 'en'
    return normalizeLocale(htmlLang || navLang || 'en')
  })
  useEffect(() => { if (lang) setLocale(lang) }, [lang])
  useEffect(() => {
    if (typeof document === 'undefined') return
    const el = document.documentElement
    const obs = new MutationObserver(() => setLocale(normalizeLocale(el.getAttribute('lang') || '')))
    obs.observe(el, { attributes: true, attributeFilter: ['lang'] })
    const onCustom = (e: Event) => {
      const d = (e as CustomEvent).detail as string | undefined
      if (d) setLocale(normalizeLocale(d))
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('i18n:changed', onCustom as any)
    }
    return () => {
      obs.disconnect()
      if (typeof window !== 'undefined') {
        window.removeEventListener('i18n:changed', onCustom as any)
      }
    }
  }, [])

  /* Messages */
  const [messages, setMessages] = useState<string[] | null>(null)
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const dict = await getDictionary(locale)
      const list = extractEncourageMessages(dict)
      if (mounted) setMessages(list.length ? list : null)
    })()
    return () => { mounted = false }
  }, [locale])
  const msgs = useMemo(() => (
    messages && messages.length ? messages : [
      'Keep exploring','New finds ahead','Deeper into the unknown'
    ]
  ), [messages])
  const genRef = useRef<Generator<string>>(makeMessageGen(msgs))
  useEffect(() => { genRef.current = makeMessageGen(msgs) }, [msgs])

  /* Popups & thresholds */
  const [popups, setPopups] = useState<Popup[]>([])
  const zRef = useRef(10000)
  const idRef = useRef(1)
  const nextAtRef = useRef<number>(BASE_MILESTONES[0]) // start at 6
  const clicksRef = useRef<number>(0)

  /* Icon tiers: show 3 icons per tier, then rotate */
  const [iconTotal] = useState<number>(() => getIconCount())
  const tiersRef = useRef(splitInTiers(iconTotal))
  const tierIdxRef = useRef(0)
  const tierPoolRef = useRef<number[]>(sampleIcons(tiersRef.current[0].start, tiersRef.current[0].end, 3))
  const tierUsedRef = useRef(0)
  function nextIcon(): number {
    const pool = tierPoolRef.current
    if (!pool.length) {
      const seg = tiersRef.current[tierIdxRef.current]
      tierPoolRef.current = sampleIcons(seg.start, seg.end, 3)
      tierUsedRef.current = 0
    }
    const icon = pool[tierUsedRef.current % pool.length]
    tierUsedRef.current += 1
    if (tierUsedRef.current >= 3) {
      tierIdxRef.current = (tierIdxRef.current + 1) % 3
      const seg = tiersRef.current[tierIdxRef.current]
      tierPoolRef.current = sampleIcons(seg.start, seg.end, 3)
      tierUsedRef.current = 0
    }
    return icon
  }

  /* Listen to unified click event(s) and count internally */
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = () => {
      clicksRef.current += 1
      const count = clicksRef.current

      if (count >= nextAtRef.current) {
        // build popup
        const vw = window.innerWidth
        const vh = window.innerHeight
        const w = ri(MIN_W, MAX_W)
        const x = Math.max(12, Math.min(vw - (w + 20), ri(12, vw - (w + 20))))
        const y = Math.max(12, Math.min(vh - 200, ri(12, vh - 200)))

        const msg = genRef.current.next().value as string
        const icon = nextIcon()
        const id = idRef.current++
        const z = ++zRef.current
        const th = pickTheme()
        const colors = { bg: th.bg, text: th.text }

        setPopups(p => [...p, { id, x, y, w, msg, icon, z, colors }])
        try { playAppear?.() } catch {}

        // compute next threshold
        const nxt = nextMilestone(count, nextAtRef.current)
        nextAtRef.current = Math.max(nxt, count + 1)
      }
    }

    window.addEventListener('random:clicked', handler)
    window.addEventListener('random:click', handler) // tolerance if old name remains
    return () => {
      window.removeEventListener('random:clicked', handler)
      window.removeEventListener('random:click', handler)
    }
  }, [])

  const bringToFront = (id: number) => setPopups(p => p.map(pp => (pp.id === id ? { ...pp, z: ++zRef.current } : pp)))
  const moveTo = (id: number, x: number, y: number) => setPopups(p => p.map(pp => (pp.id === id ? { ...pp, x, y } : pp)))
  const closeOne = (id: number) => setPopups(p => p.filter(pp => pp.id !== id))

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999 }}>
      {popups.map(pp => (
        <PopupCard key={pp.id} data={pp} onFront={() => bringToFront(pp.id)} onMove={(x, y) => moveTo(pp.id, x, y)} onClose={() => closeOne(pp.id)} />
      ))}
    </div>
  )
}

function PopupCard({ data, onFront, onMove, onClose }: {
  data: Popup
  onFront: () => void
  onMove: (x: number, y: number) => void
  onClose: () => void
}) {
  const { x, y, w, z, msg, icon, colors } = data
  const dragRef = useRef<{ sx: number; sy: number; x: number; y: number } | null>(null)
  const iconSize = Math.max(90, Math.min(168, Math.round(w * 0.6)))

  const startDragMouse = (e: React.MouseEvent) => {
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'BUTTON' || tag === 'A') return
    e.preventDefault(); onFront()
    dragRef.current = { sx: e.clientX, sy: e.clientY, x, y }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }
  const onMouseMove = (e: MouseEvent) => {
    const s = dragRef.current; if (!s) return
    onMove(s.x + (e.clientX - s.sx), s.y + (e.clientY - s.sy))
  }
  const onMouseUp = () => {
    dragRef.current = null
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  const startDragTouch = (e: React.TouchEvent) => {
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'BUTTON' || tag === 'A') return
    const t = e.touches[0]; onFront()
    dragRef.current = { sx: t.clientX, sy: t.clientY, x, y }
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd)
  }
  const onTouchMove = (e: TouchEvent) => {
    const s = dragRef.current; if (!s) return
    const t = e.touches[0]
    onMove(s.x + (t.clientX - s.sx), s.y + (t.clientY - s.sy))
    e.preventDefault()
  }
  const onTouchEnd = () => {
    dragRef.current = null
    window.removeEventListener('touchmove', onTouchMove)
    window.removeEventListener('touchend', onTouchEnd)
  }

  return (
    <div
      role="dialog"
      aria-live="polite"
      onMouseDown={startDragMouse}
      onTouchStart={startDragTouch}
      style={{
        position: 'absolute',
        transform: `translate(${x}px, ${y}px)`,
        width: w, minHeight: 120,
        background: colors.bg,
        borderRadius: 14,
        boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
        backdropFilter: 'saturate(1.2) blur(6px)',
        pointerEvents: 'auto',
        userSelect: 'none',
        zIndex: z,
        cursor: 'grab',
        touchAction: 'none',
        border: 'none'
      }}
    >
      <div style={{ height: 34, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 8px' }}>
        <button
          aria-label="Close"
          onClick={(e) => { e.stopPropagation(); onClose() }}
          style={{ width: 24, height: 24, background:'transparent', border:'none', color:'#fff', fontSize:20, textShadow:'0 0 2px rgba(0,0,0,.35)', cursor:'pointer' }}
        >
          ×
        </button>
      </div>

      <div style={{ padding: 12, textAlign: 'center' }}>
        <img
          src={`/encourage/${icon}.png`}
          alt=""
          width={iconSize}
          height={iconSize}
          style={{ display: 'block', margin: '2px auto 10px auto', pointerEvents: 'none' }}
        />
        <div
          style={{
            fontFamily: "'Tomorrow', ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial",
            fontWeight: 700, fontSize: 16, lineHeight: 1.25, color: colors.text
          }}
        >
          {msg}
        </div>
      </div>
    </div>
  )
}
