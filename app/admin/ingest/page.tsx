'use client'

import React, { useEffect, useMemo, useState } from 'react'
import videoKeywordSource from '@/lib/ingest/keywords/videos.json'

type VideoKeywordSource = {
  energies?: string[]
  subjects?: string[]
  formats?: string[]
  locales?: string[]
  eras?: string[]
  extras?: string[]
}

type VideoKeywordField = 'energy' | 'subject' | 'format' | 'locale' | 'era' | 'extra'

type VideoBuilderState = Record<VideoKeywordField, string> & { custom: string }

function normalizeKeywordList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const trimmed = entry.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out
}

const RAW_VIDEO_KEYWORDS = videoKeywordSource as VideoKeywordSource

const VIDEO_KEYWORD_FIELDS: Array<{ key: VideoKeywordField; label: string; options: string[] }> = [
  { key: 'energy', label: 'Énergie', options: normalizeKeywordList(RAW_VIDEO_KEYWORDS.energies) },
  { key: 'era', label: 'Époque', options: normalizeKeywordList(RAW_VIDEO_KEYWORDS.eras) },
  { key: 'subject', label: 'Sujet', options: normalizeKeywordList(RAW_VIDEO_KEYWORDS.subjects) },
  { key: 'format', label: 'Format', options: normalizeKeywordList(RAW_VIDEO_KEYWORDS.formats) },
  { key: 'locale', label: 'Lieu', options: normalizeKeywordList(RAW_VIDEO_KEYWORDS.locales) },
  { key: 'extra', label: 'Extra', options: normalizeKeywordList(RAW_VIDEO_KEYWORDS.extras) },
]

const INITIAL_VIDEO_BUILDER: VideoBuilderState = {
  energy: '',
  era: '',
  subject: '',
  format: '',
  locale: '',
  extra: '',
  custom: '',
}

type IngestResult = {
  ok?: boolean
  error?: string
  scanned?: number
  unique?: number
  inserted?: number
  updated?: number
  params?: Record<string, unknown>
  sample?: Array<Record<string, unknown>>
  queries?: string[]
  providers?: string[]
  dryRun?: boolean
  providerCounts?: Record<string, number>
  _rawStatus?: number
  _rawText?: string
  warnings?: Array<{
    label?: string
    status?: number
    statusText?: string
    body?: string
    message?: string
  }>
}

const IMAGE_PROVIDERS = ['giphy', 'pixabay', 'tenor', 'pexels'] as const

type ImageProviderState = { id: string; enabled: boolean }
type ImageState = { per: number; manualCSV: string; providers: ImageProviderState[] }

const DEFAULT_IMAGE_STATE: ImageState = {
  per: 40,
  manualCSV: '',
  providers: IMAGE_PROVIDERS.map((id) => ({ id, enabled: true })),
}

function normalizeImageState(value: unknown): ImageState {
  if (!value || typeof value !== 'object') return DEFAULT_IMAGE_STATE
  const record = value as Partial<ImageState>
  const per = typeof record.per === 'number' && Number.isFinite(record.per) ? record.per : DEFAULT_IMAGE_STATE.per
  const manualCSV = typeof record.manualCSV === 'string' ? record.manualCSV : ''
  const incoming = Array.isArray(record.providers) ? record.providers : []
  const mapped = IMAGE_PROVIDERS.map((id) => {
    const existing = incoming.find((entry) => typeof entry === 'object' && entry && 'id' in entry && (entry as ImageProviderState).id === id) as ImageProviderState | undefined
    return existing ? { id, enabled: Boolean(existing.enabled) } : { id, enabled: true }
  })
  return { per, manualCSV, providers: mapped }
}

function qs(params: Record<string, string | number | boolean | undefined>) {
  const u = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '' || v === false) continue
    u.set(k, String(v))
  }
  return u.toString()
}

function buildAuthHeaders(key: string): HeadersInit | undefined {
  const trimmed = key.trim()
  return trimmed ? { 'x-admin-ingest-key': trimmed } : undefined
}

/** Parser sûr: lit le body UNE seule fois (texte), tente un JSON.parse derrière */
async function parseResponse(res: Response): Promise<IngestResult> {
  const txt = await res.text()
  try {
    const parsed = JSON.parse(txt) as unknown
    if (parsed && typeof parsed === 'object') {
      return {
        ...(parsed as Record<string, unknown>),
        _rawStatus: res.status,
        _rawText: txt,
      } as IngestResult
    }
    return { _rawStatus: res.status, _rawText: txt }
  } catch {
    return { _rawStatus: res.status, _rawText: txt }
  }
}

/* ---------- PRESETS ---------- */
const WEB_PRESETS: Record<string, string[]> = {
  Oddities: ['weird interactive site','surreal net art experiment','retro flash toy','bizarre web generator','strange online museum'],
  Foodie_web: ['street food blog','indie recipe zine','home cooking diary','global snack review','cooking hack newsletter'],
  Sweet_web: ['dessert recipe archive','pastry chef tips','chocolate dessert blog','candy making tutorial','baking secrets newsletter'],
  After_dark: ['retro dating advice column','boudoir magazine article','sensual storytelling blog','late night relationship tips','vintage glamour archive'],
  Playful_toys: ['quirky quiz website','nostalgic web game','creative puzzle toy','ascii art playground','odd meme generator'],
  Hidden_travel: ['underground city guide','odd museum list','subculture event calendar','retro travel diary','secret bar blog'],
  Nostalgia_tech: ['walkman repair log','minidisc appreciation','dialup memory lane','bbs archive','screensaver gallery'],
  Collectors_den: ['flashlight enthusiast site','pen nib collection','typewriter repair diary','vintage eyewear boutique','lantern restoration'],
  DIY_workshop: ['small engine repair tips','sewing machine manual','woodcarving pattern vault','home lapidary guide','ceramic glaze lab'],
  Rural_life: ['village cheese cooperative','mountain beekeeping diary','lighthouse keeper log','farmers market directory','folk craft tutorial']
}
const QUOTE_PRESETS: Record<string, string[]> = {
  Generiques: ['typefit','toscrape','passiton'],
}

/* ---------- APPELS GET avec fallback de noms de paramètres ---------- */
async function callVideosGET(
  key: string,
  termsCSV: string | undefined,
  per: number,
  pages: number,
  days: number,
  reddit: boolean,
  dryRun = false,
  count?: number,
): Promise<IngestResult> {
  const trimmedKey = key.trim()
  // moderne
  const modern: Record<string, string | number | boolean | undefined> = {
    key: trimmedKey,
    mode: 'search',
    q: termsCSV,
    per: Math.min(Math.max(per,1),50),
    pages: Math.max(pages,1),
    days: Math.max(days,0),
    reddit: reddit ? 1 : undefined,
    dry: dryRun ? '1' : undefined,
    count: count && count > 0 ? Math.max(3, Math.min(60, count)) : undefined,
  }
  const headers = buildAuthHeaders(trimmedKey)
  let res = await fetch(`/api/ingest/videos?${qs(modern)}`, headers ? { headers } : undefined)
  let parsed = await parseResponse(res)
  if (parsed.ok || (parsed.scanned ?? 0) > 0 || (parsed.unique ?? 0) > 0) return parsed

  // legacy (query/max/n/freshDays/fallbackReddit)
  const legacy: Record<string, string | number | boolean | undefined> = {
    key: trimmedKey,
    mode: 'search',
    query: termsCSV,
    max: Math.min(Math.max(per,1),50),
    n: Math.max(pages,1),
    freshDays: Math.max(days,0),
    fallbackReddit: reddit ? 1 : undefined,
    dry: dryRun ? '1' : undefined,
    count: count && count > 0 ? Math.max(3, Math.min(60, count)) : undefined,
  }
  res = await fetch(`/api/ingest/videos?${qs(legacy)}`, headers ? { headers } : undefined)
  parsed = await parseResponse(res)
  return parsed
}

async function callImagesGET(
  key: string,
  queriesCSV: string | undefined,
  per: number,
  providers: string[] | undefined,
  dryRun: boolean,
): Promise<IngestResult> {
  const trimmedKey = key.trim()
  const params: Record<string, string | number | boolean | undefined> = {
    key: trimmedKey,
    per,
    q: queriesCSV,
    providers: providers?.join(','),
    dry: dryRun ? '1' : undefined,
  }
  const headers = buildAuthHeaders(trimmedKey)
  const res = await fetch(`/api/ingest/images?${qs(params)}`, headers ? { headers } : undefined)
  return parseResponse(res)
}

async function callWebGET(
  key: string,
  termsCSV: string,
  per: number,
  pages: number,
  dryRun = false,
): Promise<IngestResult> {
  const trimmedKey = key.trim()
  // moderne
  const modern: Record<string, string | number | boolean | undefined> = {
    key: trimmedKey, q: termsCSV, per: Math.min(Math.max(per,1),10), pages: Math.max(pages,1), dry: dryRun ? '1' : undefined
  }
  const headers = buildAuthHeaders(trimmedKey)
  let res = await fetch(`/api/ingest/web?${qs(modern)}`, headers ? { headers } : undefined)
  let parsed = await parseResponse(res)
  if (parsed.ok || (parsed.scanned ?? 0) > 0 || (parsed.unique ?? 0) > 0) return parsed

  // legacy (query/max/n)
  const legacy: Record<string, string | number | boolean | undefined> = {
    key: trimmedKey, query: termsCSV, max: Math.min(Math.max(per,1),10), n: Math.max(pages,1), dry: dryRun ? '1' : undefined
  }
  res = await fetch(`/api/ingest/web?${qs(legacy)}`, headers ? { headers } : undefined)
  parsed = await parseResponse(res)
  return parsed
}

async function callQuotesGET(
  key: string, sitesCSV: string, pages: number
): Promise<IngestResult> {
  const trimmedKey = key.trim()
  // moderne
  const modern: Record<string, string | number | boolean | undefined> = {
    key: trimmedKey, sites: sitesCSV, pages: Math.max(pages,1)
  }
  const headers = buildAuthHeaders(trimmedKey)
  let res = await fetch(`/api/ingest/quotes?${qs(modern)}`, headers ? { headers } : undefined)
  let parsed = await parseResponse(res)
  if (parsed.ok || (parsed.scanned ?? 0) > 0 || (parsed.unique ?? 0) > 0) return parsed

  // legacy (sources/n)
  const legacy: Record<string, string | number | boolean | undefined> = {
    key: trimmedKey, sources: sitesCSV, n: Math.max(pages,1)
  }
  res = await fetch(`/api/ingest/quotes?${qs(legacy)}`, headers ? { headers } : undefined)
  parsed = await parseResponse(res)
  return parsed
}

/* ---------- Composant ---------- */
export default function AdminIngestPage() {
  const [key, setKey] = useState('')

  const [iState, setIState] = useState<ImageState>(DEFAULT_IMAGE_STATE)
  const [imageSummary, setImageSummary] = useState<IngestResult | null>(null)
  const [videoSummary, setVideoSummary] = useState<IngestResult | null>(null)
  const [webSummary, setWebSummary] = useState<IngestResult | null>(null)
  const videoWarnings = videoSummary?.warnings ?? []
  const videoHasQuotaWarning = videoWarnings.some((warning) => {
    const body = (warning.body || warning.message || '').toLowerCase()
    return body.includes('quota')
  })

  // VIDEOS
  const [vState, setVState] = useState({
    per: 20,
    pages: 2,
    days: 180,
    reddit: false,
    manualCSV: '',
    count: 12,
  })
  const [videoBuilder, setVideoBuilder] = useState<VideoBuilderState>({ ...INITIAL_VIDEO_BUILDER })
  const manualVideoQueries = useMemo(() => (
    vState.manualCSV
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  ), [vState.manualCSV])
  const builderTokens = useMemo(() => {
    const tokens: string[] = []
    if (videoBuilder.energy) tokens.push(videoBuilder.energy)
    if (videoBuilder.era) tokens.push(videoBuilder.era)
    if (videoBuilder.subject) tokens.push(videoBuilder.subject)
    if (videoBuilder.format) tokens.push(videoBuilder.format)
    if (videoBuilder.locale) tokens.push(`${videoBuilder.locale} scene`)
    if (videoBuilder.extra) tokens.push(videoBuilder.extra)
    const custom = videoBuilder.custom.trim()
    if (custom) tokens.push(custom)
    return tokens
  }, [videoBuilder])
  const builderQuery = useMemo(() => builderTokens.join(' ').replace(/\s+/g, ' ').trim(), [builderTokens])

  const updateManualVideoQueries = (next: string[]) => {
    setVState((prev) => ({ ...prev, manualCSV: next.join(', ') }))
  }

  const handleAddBuilderQuery = () => {
    if (!builderQuery) {
      pushLog('⚠️ Sélectionne ou saisis des mots-clés avant d’ajouter')
      return
    }
    const next = Array.from(new Set([...manualVideoQueries, builderQuery]))
    updateManualVideoQueries(next)
    pushLog(`➕ Ajouté à la liste vidéos: ${builderQuery}`)
    setVideoBuilder((prev) => ({ ...prev, custom: '' }))
  }

  const handleClearBuilder = () => {
    setVideoBuilder({ ...INITIAL_VIDEO_BUILDER })
  }

  const handleRemoveManualQuery = (target: string) => {
    const next = manualVideoQueries.filter((query) => query !== target)
    updateManualVideoQueries(next)
  }

  const handleClearManualQueries = () => {
    updateManualVideoQueries([])
  }

  // WEB
  const [wState, setWState] = useState({
    per: 8, pages: 2,
    manualCSV: '',
    presets: Object.keys(WEB_PRESETS).slice(0,3),
  })
  const allWebTerms = useMemo(() => {
    const p = wState.presets.flatMap(n => WEB_PRESETS[n]||[])
    const m = wState.manualCSV.split(',').map(s=>s.trim()).filter(Boolean)
    const rr: string[] = []
    const L = Math.max(p.length,m.length)
    for (let i=0;i<L;i++){ if(p[i]) rr.push(p[i]); if(m[i]) rr.push(m[i]) }
    return rr.length ? rr : ['weird interactive site','dessert recipe blog','late night advice column','hidden travel diary']
  }, [wState.presets, wState.manualCSV])

  // QUOTES
  const [qState, setQState] = useState({ pages: 3, presets:['Generiques'] as string[], manualSitesCSV: '' })
  const quoteSites = useMemo(() => {
    const p = qState.presets.flatMap(n => QUOTE_PRESETS[n]||[])
    const m = qState.manualSitesCSV.split(',').map(s=>s.trim()).filter(Boolean)
    return Array.from(new Set([...p, ...m])).filter(Boolean)
  }, [qState.presets, qState.manualSitesCSV])

  // LOG
  const [log, setLog] = useState<string[]>([])
  const pushLog = (line: string) =>
    setLog(prev => [`${new Date().toLocaleTimeString()}  ${line}`, ...prev].slice(0, 400))

  const logWarnings = (warnings?: IngestResult['warnings']) => {
    if (!warnings || !warnings.length) return
    warnings.forEach((warning) => {
      const statusPart = warning.status ? ` (${warning.status}${warning.statusText ? ` ${warning.statusText}` : ''})` : ''
      const message = warning.body || warning.message || ''
      pushLog(`⚠️ ${warning.label || 'fetch'}${statusPart} — ${message.slice(0, 200)}`)
    })
  }

  // Persist confort
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('ingest_admin_state_v3')||'{}')
      if (saved.key) setKey(saved.key)
      if (saved.images) setIState(normalizeImageState(saved.images))
      if (saved.videos) {
        const { includeArchive: _deprecated, ...restVideos } = saved.videos
        setVState((prev)=>({ ...prev, ...restVideos }))
      }
      if (saved.web) setWState((prev)=>({ ...prev, ...saved.web }))
      if (saved.quotes) setQState((prev)=>({ ...prev, ...saved.quotes }))
    } catch {}
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem('ingest_admin_state_v3', JSON.stringify({
        key,
        images: iState,
        videos: vState,
        web: wState,
        quotes: qState,
      }))
    } catch {}
  }, [key, iState, vState, wState, qState])

  // utils
  const chunk = (arr: string[], n: number) => {
    const out: string[][] = []
    for (let i=0;i<arr.length;i+=n) out.push(arr.slice(i,i+n))
    return out
  }

  async function previewVideos() {
    const authKey = key.trim()
    if (!authKey) return pushLog('⚠️ Renseigne ADMIN_INGEST_KEY')
    pushLog('🔍 VIDEOS preview…')
    const manual = manualVideoQueries
    const csv = manual.length ? manual.join(',') : undefined
    const res = await callVideosGET(authKey, csv, vState.per, vState.pages, vState.days, vState.reddit, true, vState.count)
    if (res.ok) {
      setVideoSummary(res)
      if (Array.isArray(res.queries) && res.queries.length) {
        pushLog(`✅ VIDEOS preview (${res.queries.length}) — ${res.queries.join(' | ')}`)
      } else {
        pushLog('✅ VIDEOS preview')
      }
      logWarnings(res.warnings)
    } else if (res._rawStatus || res._rawText) {
      pushLog(`❌ VIDEOS preview — raw(${res._rawStatus}): ${String(res._rawText).slice(0,240)}`)
      logWarnings(res.warnings)
    } else {
      pushLog(`❌ VIDEOS preview — ${res.error || 'Erreur inconnue'}`)
      logWarnings(res.warnings)
    }
  }

  async function ingestVideos() {
    const authKey = key.trim()
    if (!authKey) return pushLog('⚠️ Renseigne ADMIN_INGEST_KEY')
    pushLog('▶️ VIDEOS: start (GET only)')
    setVideoSummary(null)
    const manual = manualVideoQueries
    const csv = manual.length ? manual.join(',') : undefined
    const res = await callVideosGET(authKey, csv, vState.per, vState.pages, vState.days, vState.reddit, false, vState.count)
    if (res.ok) {
      setVideoSummary(res)
      pushLog(`✅ VIDEOS — scanned:${res.scanned??0} unique:${res.unique??0} inserted:${res.inserted??0} updated:${res.updated??0}`)
      if (res.queries?.length) {
        pushLog(`🔁 VIDEOS requêtes — ${res.queries.join(' | ')}`)
      }
      logWarnings(res.warnings)
    } else if (res._rawStatus || res._rawText) {
      pushLog(`❌ VIDEOS — raw(${res._rawStatus}): ${String(res._rawText).slice(0,240)}`)
      logWarnings(res.warnings)
    } else {
      pushLog(`❌ VIDEOS — ${res.error || 'Erreur inconnue'}`)
      logWarnings(res.warnings)
    }
  }

  async function previewWeb() {
    const authKey = key.trim()
    if (!authKey) return pushLog('⚠️ Renseigne ADMIN_INGEST_KEY')
    pushLog('🔍 WEB preview…')
    const groups = chunk(allWebTerms, 2)
    const previewGroup = groups.length ? groups[0] : allWebTerms.slice(0, 2)
    const label = (previewGroup && previewGroup.length ? previewGroup : allWebTerms.slice(0, 2)).join(', ')
    const res = await callWebGET(authKey, label, wState.per, wState.pages, true)
    if (res.ok) {
      setWebSummary(res)
      if (Array.isArray(res.queries) && res.queries.length) {
        pushLog(`✅ WEB preview (${res.queries.length}) — ${res.queries.join(' | ')}`)
      } else {
        pushLog('✅ WEB preview')
      }
    } else if (res._rawStatus || res._rawText) {
      pushLog(`❌ WEB preview — raw(${res._rawStatus}): ${String(res._rawText).slice(0,240)}`)
    } else {
      pushLog(`❌ WEB preview — ${res.error || 'Erreur inconnue'}`)
    }
  }

  async function ingestWeb() {
    const authKey = key.trim()
    if (!authKey) return pushLog('⚠️ Renseigne ADMIN_INGEST_KEY')
    pushLog('▶️ WEB: start (GET only)')
    setWebSummary(null)
    const groups = chunk(allWebTerms, 2)
    const total = { scanned:0, unique:0, inserted:0, updated:0 }
    for (const g of groups) {
      const label = g.join(', ')
      const res = await callWebGET(authKey, label, wState.per, wState.pages)
      if (res.ok) {
        setWebSummary(res)
        pushLog(`✅ WEB ${label} — scanned:${res.scanned??0} unique:${res.unique??0} inserted:${res.inserted??0} updated:${res.updated??0}`)
        total.scanned += res.scanned||0; total.unique += res.unique||0; total.inserted += res.inserted||0; total.updated += res.updated||0
      } else if (res._rawStatus || res._rawText) {
        pushLog(`❌ WEB ${label} — raw(${res._rawStatus}): ${String(res._rawText).slice(0,240)}`)
      } else {
        pushLog(`❌ WEB ${label} — ${res.error || 'Erreur inconnue'}`)
      }
      await new Promise(r=>setTimeout(r, 120))
    }
    pushLog(`📦 WEB total — scanned:${total.scanned} unique:${total.unique} inserted:${total.inserted} updated:${total.updated}`)
  }

  async function ingestQuotes() {
    const authKey = key.trim()
    if (!authKey) return pushLog('⚠️ Renseigne ADMIN_INGEST_KEY')
    pushLog('▶️ QUOTES: start (GET only)')
    const sitesCSV = quoteSites.join(',')
    const res = await callQuotesGET(authKey, sitesCSV, qState.pages)
    if (res.ok) {
      pushLog(`✅ QUOTES — scanned:${res.scanned??0} unique:${res.unique??0} inserted:${res.inserted??0} updated:${res.updated??0}`)
    } else if (res._rawStatus || res._rawText) {
      pushLog(`❌ QUOTES — raw(${res._rawStatus}): ${String(res._rawText).slice(0,240)}`)
    } else {
      pushLog(`❌ QUOTES — ${res.error || 'Erreur inconnue'}`)
    }
  }

  const selectedProviders = useMemo(() => iState.providers.filter((p) => p.enabled).map((p) => p.id), [iState.providers])

  async function previewImages() {
    const authKey = key.trim()
    if (!authKey) return pushLog('⚠️ Renseigne ADMIN_INGEST_KEY')
    pushLog('🔍 IMAGES preview…')
    const manual = iState.manualCSV.split(',').map((s) => s.trim()).filter(Boolean)
    const providerList = selectedProviders.length ? selectedProviders : undefined
    const res = await callImagesGET(authKey, manual.length ? manual.join(',') : undefined, iState.per, providerList, true)
    if (res.ok) {
      setImageSummary(res)
      if (Array.isArray(res.queries)) {
        pushLog(`✅ IMAGES preview (${res.queries.length}) — ${res.queries.join(' | ')}`)
      } else {
        pushLog('✅ IMAGES preview')
      }
    } else if (res._rawStatus || res._rawText) {
      pushLog(`❌ IMAGES preview — raw(${res._rawStatus}): ${String(res._rawText).slice(0,240)}`)
    } else {
      pushLog(`❌ IMAGES preview — ${res.error || 'Erreur inconnue'}`)
    }
  }

  async function ingestImages() {
    const authKey = key.trim()
    if (!authKey) return pushLog('⚠️ Renseigne ADMIN_INGEST_KEY')
    pushLog('▶️ IMAGES: start')
    const manual = iState.manualCSV.split(',').map((s) => s.trim()).filter(Boolean)
    const providerList = selectedProviders.length ? selectedProviders : undefined
    const res = await callImagesGET(authKey, manual.length ? manual.join(',') : undefined, iState.per, providerList, false)
    if (res.ok) {
      setImageSummary(res)
      pushLog(`✅ IMAGES — scanned:${res.scanned ?? 0} unique:${res.unique ?? 0} inserted:${res.inserted ?? 0} updated:${res.updated ?? 0}`)
      if (res.queries?.length) pushLog(`🔁 IMAGES requêtes — ${res.queries.join(' | ')}`)
    } else if (res._rawStatus || res._rawText) {
      pushLog(`❌ IMAGES — raw(${res._rawStatus}): ${String(res._rawText).slice(0,240)}`)
    } else {
      pushLog(`❌ IMAGES — ${res.error || 'Erreur inconnue'}`)
    }
  }

  return (
    <div style={{ maxWidth: 980, margin: '40px auto', padding: 24 }}>
      <h1>Admin · Ingestion</h1>

      {/* KEY */}
      <section style={{ marginTop: 16, padding: 16, border: '1px solid #eee', borderRadius: 12 }}>
        <h2>Clé admin</h2>
        <input
          type="password"
          placeholder="ADMIN_INGEST_KEY"
          value={key}
          onChange={e=>setKey(e.target.value)}
          style={{ width:'100%', marginTop:6, padding:8 }}
        />
      </section>

      {/* IMAGES */}
      <section style={{ marginTop: 16, padding: 16, border: '1px solid #eee', borderRadius: 12 }}>
        <h2>Images (Pexels / Giphy / Tenor / Pixabay)</h2>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3, minmax(0,1fr))', gap:10 }}>
          <label>per
            <input type="number" min={5} max={80} value={iState.per}
              onChange={(e) => setIState((prev) => ({ ...prev, per: parseInt(e.target.value || '5', 10) }))}
              style={{ width:'100%', marginTop:6, padding:8 }}
            />
          </label>
          <label>Providers
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:6 }}>
              {iState.providers.map((entry, idx) => (
                <label key={entry.id} style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <input
                    type="checkbox"
                    checked={entry.enabled}
                    onChange={() => setIState((prev) => ({
                      ...prev,
                      providers: prev.providers.map((p, pIdx) => pIdx === idx ? { ...p, enabled: !p.enabled } : p),
                    }))}
                  />
                  {entry.id}
                </label>
              ))}
            </div>
          </label>
          <label style={{ display:'block' }}>Requêtes manuelles (CSV)
            <input
              type="text"
              value={iState.manualCSV}
              onChange={(e) => setIState((prev) => ({ ...prev, manualCSV: e.target.value }))}
              placeholder="surreal toy sculpture, neon night food, analog festival"
              style={{ width:'100%', marginTop:6, padding:8 }}
            />
          </label>
        </div>

        <div style={{ marginTop:12, display:'flex', gap:10, flexWrap:'wrap' }}>
          <button onClick={previewImages} style={{ padding:'10px 16px', borderRadius:10, border:'1px solid #ddd' }}>
            Prévisualiser les requêtes
          </button>
          <button onClick={ingestImages} style={{ padding:'10px 16px', borderRadius:10, border:'1px solid #ddd' }}>
            Lancer l’ingestion Images
          </button>
        </div>

        {imageSummary?.providerCounts || imageSummary?.sample?.length ? (
          <div style={{ marginTop:12, background:'#fafafa', padding:12, borderRadius:10 }}>
            {imageSummary?.queries?.length ? (
              <>
                <div style={{ fontWeight:600, marginBottom:6 }}>Requêtes générées</div>
                <ul style={{ margin:0, paddingLeft:16 }}>
                  {imageSummary.queries.map((query) => (
                    <li key={query}>{query}</li>
                  ))}
                </ul>
              </>
            ) : null}

            {imageSummary?.providerCounts ? (
              <div style={{ marginTop:12 }}>
                <div style={{ fontWeight:600, marginBottom:6 }}>Répartition fournisseurs</div>
                <ul style={{ margin:0, paddingLeft:16 }}>
                  {Object.entries(imageSummary.providerCounts).map(([provider, count]) => (
                    <li key={provider}>{provider}: {count}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {imageSummary?.sample?.length ? (
              <div style={{ marginTop:12 }}>
                <div style={{ fontWeight:600, marginBottom:6 }}>Extraits (max {imageSummary.sample.length})</div>
                <div style={{ display:'grid', gap:8 }}>
                  {imageSummary.sample.map((doc, idx) => (
                    <div key={(doc.url as string) || idx} style={{ padding:8, border:'1px solid #eee', borderRadius:8, background:'#fff' }}>
                      <div style={{ fontWeight:600 }}>{String(doc.provider || '').toUpperCase() || 'provider?'}</div>
                      {doc.url ? (
                        <div style={{ fontSize:12, wordBreak:'break-all' }}>{doc.url as string}</div>
                      ) : null}
                      {Array.isArray(doc.tags) && doc.tags.length ? (
                        <div style={{ marginTop:4, fontSize:12 }}>
                          <strong>Tags:</strong> {(doc.tags as string[]).join(', ')}
                        </div>
                      ) : null}
                      {Array.isArray(doc.keywords) && doc.keywords.length ? (
                        <div style={{ marginTop:2, fontSize:12 }}>
                          <strong>Mots-clés:</strong> {(doc.keywords as string[]).join(', ')}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* VIDEOS */}
      <section style={{ marginTop: 16, padding: 16, border: '1px solid #eee', borderRadius: 12 }}>
        <h2>Vidéos (YouTube + optional Reddit)</h2>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(5, minmax(0,1fr))', gap:10 }}>
          <label>per
            <input type="number" min={1} max={50} value={vState.per}
              onChange={e=>setVState({...vState, per:parseInt(e.target.value||'1',10)})}
              style={{ width:'100%', marginTop:6, padding:8 }}/>
          </label>
          <label>pages
            <input type="number" min={1} value={vState.pages}
              onChange={e=>setVState({...vState, pages:parseInt(e.target.value||'1',10)})}
              style={{ width:'100%', marginTop:6, padding:8 }}/>
          </label>
          <label>days
            <input type="number" min={0} value={vState.days}
              onChange={e=>setVState({...vState, days:parseInt(e.target.value||'0',10)})}
              style={{ width:'100%', marginTop:6, padding:8 }}/>
          </label>
          <label>Reddit
            <select value={vState.reddit?'1':'0'} onChange={e=>setVState({...vState, reddit:e.target.value==='1'})}
              style={{ width:'100%', marginTop:6, padding:8 }}>
              <option value="0">Off</option><option value="1">On</option>
            </select>
          </label>
          <label>Requêtes auto
            <input type="number" min={3} max={60} value={vState.count}
              onChange={e=>setVState({...vState, count:parseInt(e.target.value||'12',10) || 12})}
              style={{ width:'100%', marginTop:6, padding:8 }}/>
          </label>
        </div>

        <div style={{ marginTop:12, padding:12, border:'1px solid #f0f0f0', borderRadius:10, background:'#fbfbfb' }}>
          <div style={{ fontWeight:600, marginBottom:8 }}>Composer une requête vidéo</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3, minmax(0,1fr))', gap:10 }}>
            {VIDEO_KEYWORD_FIELDS.map((field) => (
              <label key={field.key} style={{ display:'block' }}>
                {field.label}
                <select
                  value={videoBuilder[field.key]}
                  onChange={(e) => setVideoBuilder((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  style={{ width:'100%', marginTop:6, padding:8 }}
                >
                  <option value="">—</option>
                  {field.options.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
            ))}
            <label style={{ display:'block' }}>
              Texte libre (ajout)
              <input
                type="text"
                value={videoBuilder.custom}
                onChange={(e) => setVideoBuilder((prev) => ({ ...prev, custom: e.target.value }))}
                placeholder="tiny desk concert"
                style={{ width:'100%', marginTop:6, padding:8 }}
              />
            </label>
          </div>
          <div style={{ marginTop:10, fontSize:13, fontFamily:'monospace', background:'#fff', padding:'8px 10px', borderRadius:8, border:'1px dashed #ddd' }}>
            {builderQuery ? builderQuery : 'Sélectionne des éléments pour prévisualiser la requête'}
          </div>
          <div style={{ marginTop:10, display:'flex', gap:10, flexWrap:'wrap' }}>
            <button
              onClick={handleAddBuilderQuery}
              disabled={!builderQuery}
              style={{ padding:'8px 14px', borderRadius:10, border:'1px solid #d0d0d0', background: builderQuery ? '#fff' : '#f5f5f5', cursor: builderQuery ? 'pointer' : 'not-allowed' }}
            >
              Ajouter à la liste
            </button>
            <button
              onClick={handleClearBuilder}
              style={{ padding:'8px 14px', borderRadius:10, border:'1px solid #d0d0d0' }}
            >
              Réinitialiser le compositeur
            </button>
          </div>
          <details style={{ marginTop:12 }}>
            <summary style={{ cursor:'pointer' }}>Voir les mots-clés disponibles</summary>
            <div style={{ marginTop:10, display:'grid', gridTemplateColumns:'repeat(3, minmax(0,1fr))', gap:12 }}>
              {VIDEO_KEYWORD_FIELDS.map((field) => (
                <div key={field.key} style={{ padding:8, border:'1px solid #f2f2f2', borderRadius:8, background:'#fff' }}>
                  <div style={{ fontWeight:600, marginBottom:6 }}>{field.label}</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                    {field.options.map((option) => (
                      <span key={option} style={{ fontSize:12, padding:'4px 6px', background:'#f6f6f6', borderRadius:6 }}>{option}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </details>
        </div>

        <label style={{ display:'block', marginTop:12 }}>
          Mots-clés (CSV)
          <input type="text" value={vState.manualCSV}
            onChange={e=>setVState({...vState, manualCSV:e.target.value})}
            placeholder="fun chaotic clip, street food recipe, absurd animation, daring dance"
            style={{ width:'100%', marginTop:6, padding:8 }}/>
        </label>
        <div style={{ marginTop:12, display:'flex', flexWrap:'wrap', gap:8, alignItems:'center' }}>
          <div style={{ fontWeight:600 }}>Requêtes manuelles ({manualVideoQueries.length})</div>
          {manualVideoQueries.length ? (
            <button onClick={handleClearManualQueries} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #ddd' }}>
              Vider la liste
            </button>
          ) : null}
        </div>
        {manualVideoQueries.length ? (
          <div style={{ marginTop:8, display:'flex', flexWrap:'wrap', gap:8 }}>
            {manualVideoQueries.map((query) => (
              <span key={query} style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'6px 10px', background:'#f3f3f3', borderRadius:999, fontSize:13 }}>
                {query}
                <button
                  type="button"
                  onClick={() => handleRemoveManualQuery(query)}
                  style={{ border:'none', background:'transparent', cursor:'pointer', fontSize:14, padding:0, lineHeight:1 }}
                  aria-label={`Retirer ${query}`}
                >
                  x
                </button>
              </span>
            ))}
          </div>
        ) : (
          <div style={{ marginTop:6, fontSize:12, color:'#666' }}>
            Utilise le compositeur ci-dessus ou saisis ton propre CSV pour forcer certaines requêtes.
          </div>
        )}
        <div style={{ marginTop:12, display:'flex', gap:10, flexWrap:'wrap' }}>
          <button onClick={previewVideos} style={{ padding:'10px 16px', borderRadius:10, border:'1px solid #ddd' }}>
            Prévisualiser les vidéos
          </button>
          <button onClick={ingestVideos} style={{ padding:'10px 16px', borderRadius:10, border:'1px solid #ddd' }}>
            Lancer l’ingestion Vidéos
          </button>
        </div>

        {videoSummary ? (
          <div style={{ marginTop:12, background:'#fafafa', padding:12, borderRadius:10 }}>
            <div style={{ fontWeight:600, marginBottom:6 }}>Statistiques</div>
            <ul style={{ margin:0, paddingLeft:16 }}>
              <li>Scannés: {videoSummary.scanned ?? 0}</li>
              <li>Uniq.: {videoSummary.unique ?? 0}</li>
              <li>Insérés: {videoSummary.inserted ?? 0}</li>
              <li>Mis à jour: {videoSummary.updated ?? 0}</li>
              <li>Mode dry-run: {videoSummary.dryRun ? 'oui' : 'non'}</li>
            </ul>

            {videoWarnings.length ? (
              <div style={{ marginTop:12, padding:12, border:'1px solid #f5c6cb', background:'#fff5f5', borderRadius:8 }}>
                <div style={{ fontWeight:600, color:'#8a1f1f', marginBottom:4 }}>Alertes</div>
                <ul style={{ margin:0, paddingLeft:16 }}>
                  {videoWarnings.map((warning, idx) => {
                    const warnTextRaw = warning.body || warning.message || ''
                    const warnText = warnTextRaw.replace(/\s+/g, ' ').trim()
                    return (
                      <li key={`${warning.label || 'warn'}-${idx}`}>
                        <strong>{warning.label || 'fetch'}</strong>
                        {warning.status ? ` (${warning.status}${warning.statusText ? ` ${warning.statusText}` : ''})` : ''}
                        {warnText ? ` — ${warnText.slice(0, 220)}` : null}
                      </li>
                    )
                  })}
                </ul>
                {videoHasQuotaWarning ? (
                  <div style={{ marginTop:8, fontSize:12 }}>
                    Tu as atteint le quota YouTube Data API pour la journée. Les crons échoueront aussi jusqu’au reset (minuit heure Pacifique) ou jusqu’à augmentation de quota.
                  </div>
                ) : null}
              </div>
            ) : null}

            {videoSummary.queries?.length ? (
              <div style={{ marginTop:12 }}>
                <div style={{ fontWeight:600, marginBottom:6 }}>Requêtes utilisées</div>
                <ul style={{ margin:0, paddingLeft:16 }}>
                  {videoSummary.queries.map((query) => (
                    <li key={query}>{query}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {videoSummary.providerCounts && Object.keys(videoSummary.providerCounts).length ? (
              <div style={{ marginTop:12 }}>
                <div style={{ fontWeight:600, marginBottom:6 }}>Répartition fournisseurs</div>
                <ul style={{ margin:0, paddingLeft:16 }}>
                  {Object.entries(videoSummary.providerCounts).map(([provider, count]) => (
                    <li key={provider}>{provider}: {count}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {videoSummary.sample?.length ? (
              <div style={{ marginTop:12 }}>
                <div style={{ fontWeight:600, marginBottom:6 }}>Extraits (max {videoSummary.sample.length})</div>
                <div style={{ display:'grid', gap:8 }}>
                  {videoSummary.sample.map((doc, idx) => {
                    const key = typeof doc.videoId === 'string' && doc.videoId ? doc.videoId : typeof doc.url === 'string' ? doc.url : String(idx)
                    return (
                      <div key={key} style={{ padding:8, border:'1px solid #eee', borderRadius:8, background:'#fff' }}>
                        <div style={{ fontWeight:600 }}>{String(doc.provider || '').toUpperCase() || 'provider?'}</div>
                        {doc.title ? (
                          <div style={{ marginTop:2 }}>{String(doc.title)}</div>
                        ) : null}
                        {doc.url ? (
                          <div style={{ fontSize:12, wordBreak:'break-all' }}>{String(doc.url)}</div>
                        ) : null}
                        {Array.isArray(doc.tags) && doc.tags.length ? (
                          <div style={{ marginTop:4, fontSize:12 }}>
                            <strong>Tags:</strong> {(doc.tags as string[]).join(', ')}
                          </div>
                        ) : null}
                        {Array.isArray(doc.keywords) && doc.keywords.length ? (
                          <div style={{ marginTop:2, fontSize:12 }}>
                            <strong>Mots-clés:</strong> {(doc.keywords as string[]).join(', ')}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* WEB */}
      <section style={{ marginTop: 16, padding: 16, border: '1px solid #eee', borderRadius: 12 }}>
        <h2>Web (Google CSE)</h2>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3, minmax(0,1fr))', gap:10 }}>
          <label>per
            <input type="number" min={1} max={10} value={wState.per}
              onChange={e=>setWState({...wState, per:parseInt(e.target.value||'1',10)})}
              style={{ width:'100%', marginTop:6, padding:8 }}/>
          </label>
          <label>pages
            <input type="number" min={1} value={wState.pages}
              onChange={e=>setWState({...wState, pages:parseInt(e.target.value||'1',10)})}
              style={{ width:'100%', marginTop:6, padding:8 }}/>
          </label>
          <div />
        </div>

        <label style={{ display:'block', marginTop:12 }}>
          Requêtes (CSV)
          <input type="text" value={wState.manualCSV}
            onChange={e=>setWState({...wState, manualCSV:e.target.value})}
            placeholder="dessert recipe blog, playful web toy, late night advice, hidden travel diary"
            style={{ width:'100%', marginTop:6, padding:8 }}/>
        </label>

        <div style={{ marginTop:12 }}>
          <div style={{ fontWeight:600, marginBottom:6 }}>Presets</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0,1fr))', gap:8 }}>
            {Object.keys(WEB_PRESETS).map(name=>{
              const checked = wState.presets.includes(name)
              return (
                <label key={name} style={{ display:'flex', gap:8, alignItems:'center', padding:8, border:'1px solid #f0f0f0', borderRadius:10 }}>
                  <input type="checkbox" checked={checked}
                    onChange={()=>setWState(prev=>({
                      ...prev,
                      presets: checked ? prev.presets.filter(p=>p!==name) : [...prev.presets, name]
                    }))}/>
                  <b>{name}</b>
                  <span style={{ opacity:.65 }}>({WEB_PRESETS[name].slice(0,3).join(', ')}…)</span>
                </label>
              )
            })}
          </div>
        </div>

        <div style={{ marginTop:12, display:'flex', gap:10, flexWrap:'wrap' }}>
          <button onClick={previewWeb} style={{ padding:'10px 16px', borderRadius:10, border:'1px solid #ddd' }}>
            Prévisualiser le web
          </button>
          <button onClick={ingestWeb} style={{ padding:'10px 16px', borderRadius:10, border:'1px solid #ddd' }}>
            Lancer l’ingestion Web
          </button>
        </div>

        {webSummary?.providerCounts || webSummary?.sample?.length ? (
          <div style={{ marginTop:12, background:'#fafafa', padding:12, borderRadius:10 }}>
            {webSummary?.queries?.length ? (
              <>
                <div style={{ fontWeight:600, marginBottom:6 }}>Requêtes utilisées</div>
                <ul style={{ margin:0, paddingLeft:16 }}>
                  {webSummary.queries.map((query) => (
                    <li key={query}>{query}</li>
                  ))}
                </ul>
              </>
            ) : null}

            {webSummary?.providerCounts ? (
              <div style={{ marginTop:12 }}>
                <div style={{ fontWeight:600, marginBottom:6 }}>Répartition fournisseurs</div>
                <ul style={{ margin:0, paddingLeft:16 }}>
                  {Object.entries(webSummary.providerCounts).map(([provider, count]) => (
                    <li key={provider}>{provider}: {count}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {webSummary?.sample?.length ? (
              <div style={{ marginTop:12 }}>
                <div style={{ fontWeight:600, marginBottom:6 }}>Extraits (max {webSummary.sample.length})</div>
                <div style={{ display:'grid', gap:8 }}>
                  {webSummary.sample.map((doc, idx) => {
                    const key = typeof doc.url === 'string' && doc.url ? doc.url : String(idx)
                    return (
                      <div key={key} style={{ padding:8, border:'1px solid #eee', borderRadius:8, background:'#fff' }}>
                        <div style={{ fontWeight:600 }}>{String(doc.provider || '').toUpperCase() || 'WEB'}</div>
                        {doc.title ? (
                          <div style={{ marginTop:2 }}>{String(doc.title)}</div>
                        ) : null}
                        {doc.url ? (
                          <div style={{ fontSize:12, wordBreak:'break-all' }}>{String(doc.url)}</div>
                        ) : null}
                        {doc.host ? (
                          <div style={{ marginTop:2, fontSize:12 }}>Host: {String(doc.host)}</div>
                        ) : null}
                        {Array.isArray(doc.tags) && doc.tags.length ? (
                          <div style={{ marginTop:4, fontSize:12 }}>
                            <strong>Tags:</strong> {(doc.tags as string[]).join(', ')}
                          </div>
                        ) : null}
                        {Array.isArray(doc.keywords) && doc.keywords.length ? (
                          <div style={{ marginTop:2, fontSize:12 }}>
                            <strong>Mots-clés:</strong> {(doc.keywords as string[]).join(', ')}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* QUOTES */}
      <section style={{ marginTop: 16, padding: 16, border: '1px solid #eee', borderRadius: 12 }}>
        <h2>Quotes</h2>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3, minmax(0,1fr))', gap:10 }}>
          <label>pages
            <input type="number" min={1} value={qState.pages}
              onChange={e=>setQState({...qState, pages:parseInt(e.target.value||'1',10)})}
              style={{ width:'100%', marginTop:6, padding:8 }}/>
          </label>
        </div>

        <div style={{ marginTop:12 }}>
          <div style={{ fontWeight:600, marginBottom:6 }}>Presets</div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {Object.keys(QUOTE_PRESETS).map(name=>{
              const checked = qState.presets.includes(name)
              return (
                <label key={name} style={{ display:'flex', gap:8, alignItems:'center', padding:8, border:'1px solid #f0f0f0', borderRadius:10 }}>
                  <input type="checkbox" checked={checked}
                    onChange={()=>setQState(prev=>({
                      ...prev,
                      presets: checked ? prev.presets.filter(p=>p!==name) : [...prev.presets, name]
                    }))}/>
                  <b>{name}</b>
                  <span style={{ opacity:.65 }}>({QUOTE_PRESETS[name].join(', ')})</span>
                </label>
              )
            })}
          </div>
        </div>

        <label style={{ display:'block', marginTop:12 }}>
          Sites (CSV)
          <input type="text" value={qState.manualSitesCSV}
            onChange={e=>setQState({...qState, manualSitesCSV:e.target.value})}
            placeholder="toscrape,typefit,passiton"
            style={{ width:'100%', marginTop:6, padding:8 }}/>
        </label>

        <button onClick={ingestQuotes} style={{ marginTop:12, padding:'10px 16px', borderRadius:10, border:'1px solid #ddd' }}>
          Lancer l’ingestion Quotes
        </button>
      </section>

      {/* LOG */}
      <section style={{ marginTop: 16, padding: 16, border: '1px solid #eee', borderRadius: 12 }}>
        <h2>Log</h2>
        <button onClick={()=>setLog([])} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #ddd', marginBottom:8 }}>
          Effacer le log
        </button>
        <pre style={{ whiteSpace:'pre-wrap', background:'#fafafa', padding:12, borderRadius:8, maxHeight:420, overflow:'auto' }}>
{log.join('\n')}
        </pre>
      </section>
    </div>
  )
}
