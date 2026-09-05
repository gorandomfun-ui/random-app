'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function EffectsTestLogin({ configured }: { configured: boolean }) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState(configured ? '' : 'ACCESS NOT CONFIGURED')
  const [loading, setLoading] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!password || loading || !configured) return
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/effects-test/access', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!response.ok) {
        setError(response.status === 429 ? 'TRY AGAIN LATER' : 'WRONG PASSWORD')
        return
      }
      router.refresh()
    } catch {
      setError('CONNECTION ERROR')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-black text-[#fffbea] flex items-center justify-center px-6">
      <form onSubmit={submit} className="w-full max-w-[320px] flex flex-col gap-4">
        <h1 className="font-tomorrow text-center text-2xl font-bold uppercase">Effects test</h1>
        <label htmlFor="effects-test-password" className="sr-only">Password</label>
        <input
          id="effects-test-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          autoFocus
          placeholder="PASSWORD"
          disabled={!configured || loading}
          className="h-12 w-full border border-[#fffbea] bg-transparent px-4 text-center font-inter text-base outline-none placeholder:text-[#fffbea]/45 focus:border-[#ff1678]"
        />
        <button
          type="submit"
          disabled={!configured || loading || !password}
          className="h-12 w-full bg-[#fffbea] font-tomorrow font-bold uppercase text-black disabled:opacity-45"
        >
          {loading ? 'OPENING...' : 'ENTER'}
        </button>
        <p aria-live="polite" className="h-5 text-center font-inter text-xs font-semibold uppercase text-[#ff4d78]">
          {error}
        </p>
      </form>
    </main>
  )
}
