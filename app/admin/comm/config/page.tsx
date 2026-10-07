'use client'

/** The platforms: configured, missing or expired, and the steps to do by hand. Nothing secret is shown. */

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

import type { InstagramState } from '@/lib/comm/configStore'

type Config = { blob: boolean; instagram: InstagramState; destinations: Array<{ key: string; name: string; direct: boolean; note: string }> }
const small = 'rounded border border-white/40 px-2 py-1 text-xs disabled:opacity-40'

export default function ConfigPage() {
  const [config, setConfig] = useState<Config | null>(null)
  const [error, setError] = useState('')
  const [fresh, setFresh] = useState<{ token: string; expiresInDays: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const reload = useCallback(async () => {
    const body = await fetch('/api/admin/comm/config', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({}))
    if (!body.destinations) { setError('Configuration indisponible.'); return }
    setConfig(body)
  }, [])
  useEffect(() => { void reload() }, [reload])
  const refresh = useCallback(async () => {
    if (!window.confirm('Demander un nouveau jeton longue durée à Instagram ? Il sera affiché une seule fois, à coller dans Vercel.')) return
    setBusy(true); setError('')
    const body = await fetch('/api/admin/comm/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'refresh-token' }) }).then((r) => r.json()).catch(() => ({}))
    setBusy(false)
    if (body.token) setFresh(body); else setError(body.error ?? 'Renouvellement impossible.')
  }, [])
  const ig = config?.instagram
  const dot = (ok: boolean, warn = false) => <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: ok ? (warn ? '#E5972B' : '#0FC55D') : '#D90845' }} />
  return (
    <main className="min-h-screen bg-black px-5 py-8 text-white">
      <div className="mx-auto max-w-3xl space-y-6 text-sm">
        <nav><Link href="/admin/comm" className="underline">← La file</Link></nav>
        <h1 className="text-2xl font-bold">Configuration</h1>
        {error ? <p role="alert" className="text-red-300">{error}</p> : null}
        {!config ? <p role="status">Chargement…</p> : (
          <>
            <section className="space-y-1">
              <h2 className="font-bold">Stockage des médias</h2>
              <p>{dot(config.blob)}Vercel Blob : {config.blob ? 'configuré' : 'manquant — crée le store dans le tableau de bord Vercel, le jeton s’ajoute seul'}</p>
            </section>
            <section className="space-y-2">
              <h2 className="font-bold">Instagram</h2>
              {ig?.configured ? (
                <>
                  <p>{dot(!ig.error)}Jeton et compte : configurés{ig.account?.username ? ` — @${ig.account.username}${ig.account.type ? ` (${ig.account.type.toLowerCase()})` : ''}` : ''}{ig.error ? ` — ${ig.error}` : ''}</p>
                  <p>{dot((ig.expiresInDays ?? 0) > 7, (ig.expiresInDays ?? 0) <= 14)}Jeton vu pour la première fois le {ig.tokenSeenAt ? new Date(ig.tokenSeenAt).toLocaleDateString('fr-FR') : '?'} ; il expire dans {ig.expiresInDays} jours environ (60 jours de vie).</p>
                  {ig.quota ? <p>{dot(true)}Publications par l’API ces 24 h : {ig.quota.used}{ig.quota.total ? ` / ${ig.quota.total}` : ''}</p> : null}
                  <div className="flex flex-wrap items-center gap-2"><button className={small} disabled={busy || (ig.tokenAgeDays ?? 0) < 1} onClick={refresh}>Renouveler le jeton</button><span className="text-xs text-gray-300">possible dès 24 h après son émission, tant qu’il n’a pas expiré</span></div>
                  {fresh ? <div className="rounded border border-amber-300 p-3 text-xs"><p className="mb-1 text-amber-200">Nouveau jeton, valable {fresh.expiresInDays} jours. Colle-le dans Vercel, variable INSTAGRAM_ACCESS_TOKEN, puis redéploie. Il ne sera plus affiché.</p><code className="break-all">{fresh.token}</code></div> : null}
                </>
              ) : (
                <>
                  <p>{dot(false)}Non configuré : INSTAGRAM_ACCESS_TOKEN et INSTAGRAM_ACCOUNT_ID manquent.</p>
                  <ol className="list-decimal space-y-1 pl-5 text-gray-300">
                    <li>Un compte Instagram <b>professionnel</b> (créateur ou entreprise).</li>
                    <li>Sur developers.facebook.com, une application avec le produit « Instagram », API avec connexion Instagram ; ton compte ajouté comme <b>testeur Instagram</b> et l’invitation acceptée dans Instagram (Paramètres, Site web et applications).</li>
                    <li>Permissions : instagram_business_basic, instagram_business_content_publish, instagram_business_manage_comments.</li>
                    <li>Un jeton d’accès <b>longue durée</b> généré depuis le tableau de bord de l’application, et l’identifiant du compte (le champ user_id).</li>
                    <li>Dans Vercel : INSTAGRAM_ACCESS_TOKEN et INSTAGRAM_ACCOUNT_ID, puis redéployer. Cette page dira alors « configuré ».</li>
                  </ol>
                </>
              )}
            </section>
            <section className="space-y-1">
              <h2 className="font-bold">Destinations</h2>
              {config.destinations.map((d) => <p key={d.key}>{dot(d.direct, !d.direct)}{d.name} : {d.direct ? 'publication directe' : 'export de fichiers'} — <span className="text-gray-300">{d.note}</span></p>)}
            </section>
          </>
        )}
      </div>
    </main>
  )
}
