'use client'

import React, { useEffect, useMemo, useState } from 'react'

type IngestResult = {
  ok?: boolean
  error?: string
  scanned?: number
  unique?: number
  inserted?: number
  updated?: number
  params?: any
  sample?: any[]
  _rawStatus?: number
  _rawText?: string
}

function qs(params: Record<string, string | number | boolean | undefined>) {
  const u = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '' || v === false) continue
    u.set(k, String(v))
  }
  return u.toString()
}

/** Parser sûr: lit le body UNE seule fois (texte), tente un JSON.parse derrière */
async function parseResponse(res: Response): Promise<IngestResult> {
  const txt = await res.text()
  try {
    const j = JSON.parse(txt)
    return j
  } catch {
    return { _rawStatus: res.status, _rawText: txt }
  }
}

/* ---------- PRESETS ---------- */
const VIDEO_PRESETS: Record<string, string[]> = {
  Classiques_live: ['tiny desk cover','kexp live','sofar sounds','balcony tv','unplugged live'],
  Street_perform: ['busking','street performance','subway musicians','street drummer solo','street violin'],
  Obscur_vintage: ['vhs concert','old camcorder live','public access tv music','1998 festival'],
}
const WEB_PRESETS: Record<string, string[]> = {
  Old_web: ['geocities archive','blogspot personal site','webring directory','freewebs gallery'],
  Toys: ['ascii art generator','pixel art toy','retro web toy','weird web game'],
}
const QUOTE_PRESETS: Record<string, string[]> = {
  Generiques: ['typefit','toscrape','passiton'],
}

/* ---------- APPELS GET avec fallback de noms de paramètres ---------- */
async function callVideosGET(
  key: string, termsCSV: string, per: number, pages: number, days: number, reddit: boolean
): Promise<IngestResult> {
  // moderne
  const modern: Record<string, string | number | boolean | undefined> = {
    key, mode: 'search', q: termsCSV,
    per: Math.min(Math.max(per,1),50),
    pages: Math.max(pages,1),
    days: Math.max(days,0),
    reddit: reddit ? 1 : undefined,
  }
  let res = await fetch(`/api/ingest/videos?${qs(modern)}`)
  let parsed = await parseResponse(res)
  if (parsed.ok || (parsed.scanned ?? 0) > 0 || (parsed.unique ?? 0) > 0) return parsed

  // legacy (query/max/n/freshDays/fallbackReddit)
  const legacy: Record<string, string | number | boolean | undefined> = {
    key, mode: 'search',
    query: termsCSV,
    max: Math.min(Math.max(per,1),50),
    n: Math.max(pages,1),
    freshDays: Math.max(days,0),
    fallbackReddit: reddit ? 1 : undefined,
  }
  res = await fetch(`/api/ingest/videos?${qs(legacy)}`)
  parsed = await parseResponse(res)
  return parsed
}

async function callWebGET(
  key: string, termsCSV: string, per: number, pages: number
): Promise<IngestResult> {
  // moderne
  const modern: Record<string, string | number | boolean | undefined> = {
    key, q: termsCSV, per: Math.min(Math.max(per,1),10), pages: Math.max(pages,1)
  }
  let res = await fetch(`/api/ingest/web?${qs(modern)}`)
  let parsed = await parseResponse(res)
  if (parsed.ok || (parsed.scanned ?? 0) > 0 || (parsed.unique ?? 0) > 0) return parsed

  // legacy (query/max/n)
  const legacy: Record<string, string | number | boolean | undefined> = {
    key, query: termsCSV, max: Math.min(Math.max(per,1),10), n: Math.max(pages,1)
  }
  res = await fetch(`/api/ingest/web?${qs(legacy)}`)
  parsed = await parseResponse(res)
  return parsed
}

async function callQuotesGET(
  key: string, sitesCSV: string, pages: number
): Promise<IngestResult> {
  // moderne
  const modern: Record<string, string | number | boolean | undefined> = {
    key, sites: sitesCSV, pages: Math.max(pages,1)
  }
  let res = await fetch(`/api/ingest/quotes?${qs(modern)}`)
  let parsed = await parseResponse(res)
  if (parsed.ok || (parsed.scanned ?? 0) > 0 || (parsed.unique ?? 0) > 0) return parsed

  // legacy (sources/n)
  const legacy: Record<string, string | number | boolean | undefined> = {
    key, sources: sitesCSV, n: Math.max(pages,1)
  }
  res = await fetch(`/api/ingest/quotes?${qs(legacy)}`)
  parsed = await parseResponse(res)
  return parsed
}

/* ---------- Composant ---------- */
export default function AdminIngestPage() {
  const [key, setKey] = useState('')

  // VIDEOS
  const [vState, setVState] = useState({
    per: 20, pages: 2, days: 180, reddit: false,
    manualCSV: 'weird, retro, lofi, street performance, odd sport',
    presets: Object.keys(VIDEO_PRESETS).slice(0,2),
  })
  const allVideoTerms = useMemo(() => {
    const p = vState.presets.flatMap(n => VIDEO_PRESETS[n]||[])
    const m = vState.manualCSV.split(',').map(s=>s.trim()).filter(Boolean)
    const rr: string[] = []
    const L = Math.max(p.length,m.length)
    for (let i=0;i<L;i++){ if(p[i]) rr.push(p[i]); if(m[i]) rr.push(m[i]) }
    return rr.length ? rr : ['weird','retro','lofi']
  }, [vState.presets, vState.manualCSV])

  // WEB
  const [wState, setWState] = useState({
    per: 8, pages: 2,
    manualCSV: 'weird museum, ascii toy, old web zine, radio obscure, blogspot archive',
    presets: Object.keys(WEB_PRESETS).slice(0,2),
  })
  const allWebTerms = useMemo(() => {
    const p = wState.presets.flatMap(n => WEB_PRESETS[n]||[])
    const m = wState.manualCSV.split(',').map(s=>s.trim()).filter(Boolean)
    const rr: string[] = []
    const L = Math.max(p.length,m.length)
    for (let i=0;i<L;i++){ if(p[i]) rr.push(p[i]); if(m[i]) rr.push(m[i]) }
    return rr.length ? rr : ['weird museum','old web site']
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

  // Persist confort
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('ingest_admin_state_v3')||'{}')
      if (saved.key) setKey(saved.key)
      if (saved.videos) setVState((prev)=>({ ...prev, ...saved.videos }))
      if (saved.web) setWState((prev)=>({ ...prev, ...saved.web }))
      if (saved.quotes) setQState((prev)=>({ ...prev, ...saved.quotes }))
    } catch {}
  }, [])
  useEffect(() => {
    try { localStorage.setItem('ingest_admin_state_v3', JSON.stringify({ key, videos:vState, web:wState, quotes:qState })) } catch {}
  }, [key, vState, wState, qState])

  // utils
  const chunk = (arr: string[], n: number) => {
    const out: string[][] = []
    for (let i=0;i<arr.length;i+=n) out.push(arr.slice(i,i+n))
    return out
  }

  async function ingestVideos() {
    if (!key) return pushLog('⚠️ Renseigne ADMIN_INGEST_KEY')
    pushLog('▶️ VIDEOS: start (GET only)')
    const groups = chunk(allVideoTerms, 3)
    let total = { scanned:0, unique:0, inserted:0, updated:0 }
    for (const g of groups) {
      const label = g.join(', ')
      const res = await callVideosGET(key, label, vState.per, vState.pages, vState.days, vState.reddit)
      if (res.ok) {
        pushLog(`✅ VIDEOS ${label} — scanned:${res.scanned??0} unique:${res.unique??0} inserted:${res.inserted??0} updated:${res.updated??0}`)
        total.scanned += res.scanned||0; total.unique += res.unique||0; total.inserted += res.inserted||0; total.updated += res.updated||0
      } else if (res._rawStatus || res._rawText) {
        pushLog(`❌ VIDEOS ${label} — raw(${res._rawStatus}): ${String(res._rawText).slice(0,240)}`)
      } else {
        pushLog(`❌ VIDEOS ${label} — ${res.error || 'Erreur inconnue'}`)
      }
      await new Promise(r=>setTimeout(r, 120))
    }
    pushLog(`📦 VIDEOS total — scanned:${total.scanned} unique:${total.unique} inserted:${total.inserted} updated:${total.updated}`)
  }

  async function ingestWeb() {
    if (!key) return pushLog('⚠️ Renseigne ADMIN_INGEST_KEY')
    pushLog('▶️ WEB: start (GET only)')
    const groups = chunk(allWebTerms, 2)
    let total = { scanned:0, unique:0, inserted:0, updated:0 }
    for (const g of groups) {
      const label = g.join(', ')
      const res = await callWebGET(key, label, wState.per, wState.pages)
      if (res.ok) {
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
    if (!key) return pushLog('⚠️ Renseigne ADMIN_INGEST_KEY')
    pushLog('▶️ QUOTES: start (GET only)')
    const sitesCSV = quoteSites.join(',')
    const res = await callQuotesGET(key, sitesCSV, qState.pages)
    if (res.ok) {
      pushLog(`✅ QUOTES — scanned:${res.scanned??0} unique:${res.unique??0} inserted:${res.inserted??0} updated:${res.updated??0}`)
    } else if (res._rawStatus || res._rawText) {
      pushLog(`❌ QUOTES — raw(${res._rawStatus}): ${String(res._rawText).slice(0,240)}`)
    } else {
      pushLog(`❌ QUOTES — ${res.error || 'Erreur inconnue'}`)
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

      {/* VIDEOS */}
      <section style={{ marginTop: 16, padding: 16, border: '1px solid #eee', borderRadius: 12 }}>
        <h2>Vidéos (YouTube + optional Reddit)</h2>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4, minmax(0,1fr))', gap:10 }}>
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
        </div>

        <label style={{ display:'block', marginTop:12 }}>
          Mots-clés (CSV)
          <input type="text" value={vState.manualCSV}
            onChange={e=>setVState({...vState, manualCSV:e.target.value})}
            placeholder="weird, retro, lofi, street performance, odd sport"
            style={{ width:'100%', marginTop:6, padding:8 }}/>
        </label>

        <div style={{ marginTop:12 }}>
          <div style={{ fontWeight:600, marginBottom:6 }}>Presets</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0,1fr))', gap:8 }}>
            {Object.keys(VIDEO_PRESETS).map(name=>{
              const checked = vState.presets.includes(name)
              return (
                <label key={name} style={{ display:'flex', gap:8, alignItems:'center', padding:8, border:'1px solid #f0f0f0', borderRadius:10 }}>
                  <input type="checkbox" checked={checked}
                    onChange={()=>setVState(prev=>({
                      ...prev,
                      presets: checked ? prev.presets.filter(p=>p!==name) : [...prev.presets, name]
                    }))}/>
                  <b>{name}</b>
                  <span style={{ opacity:.65 }}>({VIDEO_PRESETS[name].slice(0,3).join(', ')}…)</span>
                </label>
              )
            })}
          </div>
        </div>

        <button onClick={ingestVideos} style={{ marginTop:12, padding:'10px 16px', borderRadius:10, border:'1px solid #ddd' }}>
          Lancer l’ingestion Vidéos
        </button>
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
            placeholder="weird museum, ascii toy, old web zine, radio obscure, blogspot archive"
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

        <button onClick={ingestWeb} style={{ marginTop:12, padding:'10px 16px', borderRadius:10, border:'1px solid #ddd' }}>
          Lancer l’ingestion Web
        </button>
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
