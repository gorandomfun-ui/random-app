'use client'
import { useState } from 'react'
export default function CuratorLogin({ configured }: { configured: boolean }) {
  const [error, setError] = useState(''), [pending, setPending] = useState(false)
  return <main className="p-8 max-w-lg mx-auto"><h1>Curation privée — Random</h1>
    {!configured ? <p>La curation privée doit être configurée sur le serveur.</p> : <form onSubmit={async event => {
      event.preventDefault(); if (pending) return
      const secret = new FormData(event.currentTarget).get('secret'); setPending(true); setError('')
      try {
        const response = await fetch('/api/discovery/curation/access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret }) })
        if (!response.ok) throw new Error('Accès refusé ou temporairement indisponible.')
        window.location.reload()
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Accès indisponible.'); setPending(false) }
    }}><label>Clé privée <input name="secret" type="password" autoComplete="current-password" required maxLength={512} /></label>
      <button type="submit" disabled={pending}>Entrer</button><p role="status">{error}</p></form>}
  </main>
}
