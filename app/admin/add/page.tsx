/* eslint-disable @next/next/no-img-element */
'use client'

import clsx from 'clsx'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'

import MonoIcon from '@/components/MonoIcon'
import { THEMES } from '@/lib/theme'
import type { PublicSubmission } from '@/lib/submissions'

type SubmissionCardState = {
  textKind: 'joke' | 'quote' | 'fact'
}

function useAdminKey() {
  const [adminKey, setAdminKey] = useState<string>('')

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('add-admin-key')
      if (stored) setAdminKey(stored)
    } catch {
      /* ignore */
    }
  }, [])

  const store = useCallback((value: string) => {
    setAdminKey(value)
    try {
      sessionStorage.setItem('add-admin-key', value)
    } catch {
      /* ignore */
    }
  }, [])

  const clear = useCallback(() => {
    setAdminKey('')
    try {
      sessionStorage.removeItem('add-admin-key')
    } catch {
      /* ignore */
    }
  }, [])

  return { adminKey, store, clear }
}

export default function AdminAddPage() {
  const { adminKey, store, clear } = useAdminKey()
  const [keyInput, setKeyInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submissions, setSubmissions] = useState<PublicSubmission[]>([])
  const [usage, setUsage] = useState<{ remaining: number; limit: number } | null>(null)
  const [usageAllowed, setUsageAllowed] = useState<boolean | null>(null)
  const [cardState, setCardState] = useState<Record<string, SubmissionCardState>>({})

  const theme = THEMES[0]

  const loadSubmissions = useCallback(async (key: string) => {
    setLoading(true)
    try {
      const res = await fetch('/api/submissions', {
        method: 'GET',
        headers: { 'x-admin-key': key },
      })
      if (!res.ok) {
        setError(res.status === 401 ? 'Wrong admin key' : 'Unable to fetch submissions')
        setSubmissions([])
        setUsage(null)
        setUsageAllowed(null)
        setLoading(false)
        return false
      }
      const json = (await res.json()) as {
        submissions: PublicSubmission[]
        usage?: { remaining: number; limit: number }
        allowed?: boolean
      }
      setSubmissions(json.submissions || [])
      setUsage(json.usage ?? null)
      setUsageAllowed(typeof json.allowed === 'boolean' ? json.allowed : null)
      setError(null)
      setCardState((prev) => {
        const next: Record<string, SubmissionCardState> = { ...prev }
        for (const item of json.submissions || []) {
          if (!next[item.id] && item.type === 'text') {
            next[item.id] = { textKind: item.data.kind === 'text' ? item.data.textKind : 'joke' }
          }
        }
        return next
      })
      return true
    } catch (err) {
      console.error('[admin-submissions]', err)
      setError('Network error while loading submissions')
      setSubmissions([])
      setUsage(null)
      setUsageAllowed(null)
      return false
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!adminKey) return
    loadSubmissions(adminKey).catch(() => undefined)
  }, [adminKey, loadSubmissions])

  useEffect(() => {
    if (!adminKey) {
      setUsage(null)
      setUsageAllowed(null)
    }
  }, [adminKey])

  const handleLogin = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!keyInput.trim()) {
      setError('Enter the admin key to continue')
      return
    }
    const success = await loadSubmissions(keyInput.trim())
    if (success) {
      store(keyInput.trim())
      setKeyInput('')
    }
  }, [keyInput, loadSubmissions, store])

  const handleAction = useCallback(
    async (id: string, action: 'approve' | 'reject') => {
      if (!adminKey) return
      const body: Record<string, unknown> = { id, action }
      const state = cardState[id]
      if (action === 'approve' && state?.textKind) body.textKind = state.textKind

      const res = await fetch('/api/submissions', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey,
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setError(typeof json?.error === 'string' ? json.error : 'Action failed')
        return
      }
      setError(null)
      await loadSubmissions(adminKey)
    },
    [adminKey, cardState, loadSubmissions],
  )

  const authenticated = Boolean(adminKey && !error)

  const content = useMemo(() => {
    if (!authenticated) return null
    if (loading) {
      return <p className="mt-6 text-sm opacity-80">Loading pending submissions...</p>
    }
    if (!submissions.length) {
      return <p className="mt-6 text-sm opacity-80">No pending submissions.</p>
    }
    return (
      <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {submissions.map((submission) => (
          <SubmissionCard
            key={submission.id}
            submission={submission}
            state={cardState[submission.id]}
            setState={(next) => setCardState((prev) => ({ ...prev, [submission.id]: next }))}
            onApprove={() => handleAction(submission.id, 'approve')}
            onReject={() => handleAction(submission.id, 'reject')}
          />
        ))}
      </div>
    )
  }, [authenticated, cardState, handleAction, loading, submissions])

  return (
    <main className="min-h-screen bg-[#111] text-[#f7f4e2]">
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <div className="flex items-center gap-2">
          <MonoIcon src="/icons/plus.svg" color={theme.text} size={20} />
          <h1 className="text-lg font-semibold uppercase tracking-wide">Add Submissions</h1>
        </div>
        <Link href="/" className="text-sm underline">
          Back to site
        </Link>
      </header>

      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        {!adminKey ? (
          <form onSubmit={handleLogin} className="max-w-md space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide">Enter admin key</h2>
            <input
              type="password"
              value={keyInput}
              onChange={(event) => setKeyInput(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white focus:border-white"
              placeholder="Admin key"
            />
            {error ? <p className="text-sm text-rose-300">{error}</p> : null}
            <button type="submit" className="w-full rounded-xl bg-white px-3 py-2 text-sm font-semibold text-black">
              Unlock
            </button>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold">Pending submissions</p>
                <p className="text-xs opacity-70">{submissions.length} item(s)</p>
              </div>
              {usage ? (
                <div className="rounded-xl border border-white/15 px-3 py-2 text-xs text-white/80">
                  Remaining: {formatBytesToMb(usage.remaining)} MB / {formatBytesToMb(usage.limit)} MB
                  {usageAllowed === false ? <span className="ml-2 text-rose-300">(Queue full)</span> : null}
                </div>
              ) : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => loadSubmissions(adminKey)}
                  className="rounded-xl border border-white/20 px-3 py-2 text-sm"
                >
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clear()
                    setSubmissions([])
                  }}
                  className="rounded-xl border border-white/20 px-3 py-2 text-sm"
                >
                  Forget key
                </button>
              </div>
            </div>
            {error ? <p className="text-sm text-rose-300">{error}</p> : null}
            {content}
          </div>
        )}
      </div>
    </main>
  )
}

function SubmissionCard({
  submission,
  state,
  setState,
  onApprove,
  onReject,
}: {
  submission: PublicSubmission
  state?: SubmissionCardState
  setState: (state: SubmissionCardState) => void
  onApprove: () => void
  onReject: () => void
}) {
  const createdAt = useMemo(() => new Date(submission.createdAt).toLocaleString(), [submission.createdAt])
  const textKind = state?.textKind ?? (submission.type === 'text' ? (submission.data.kind === 'text' ? submission.data.textKind : 'joke') : 'joke')

  const renderPreview = () => {
    if (submission.type === 'image') {
      const data = submission.data
      const url = data.kind === 'image' ? data.previewDataUri || data.imageUrl : undefined
      if (!url) return <p className="text-sm opacity-70">No image attached</p>
      return <img src={url} alt="submission" className="w-full rounded-lg object-cover" />
    }
    if (submission.type === 'text') {
      return <p className="text-sm leading-relaxed whitespace-pre-line">{submission.data.kind === 'text' ? submission.data.text : ''}</p>
    }
    if (submission.type === 'web') {
      const meta = submission.metadata
      return (
        <div className="space-y-2 text-sm">
          {meta?.title ? <p className="font-semibold">{meta.title}</p> : null}
          <p className="break-words text-xs text-white/60">{submission.data.kind === 'web' ? submission.data.url : ''}</p>
          {meta?.description ? <p className="opacity-70">{meta.description}</p> : null}
        </div>
      )
    }
    const meta = submission.data.kind === 'video' || submission.data.kind === 'web' ? submission.data.meta ?? submission.metadata : submission.metadata
    const metaProvider = submission.type === 'video' && meta && 'provider' in meta ? (meta as { provider?: string | null }).provider : null
    const metaCanEmbed = submission.type === 'video' && meta && 'canEmbed' in meta ? (meta as { canEmbed?: boolean | null }).canEmbed ?? null : null
    return (
      <div className="space-y-2 text-sm">
        {meta?.image ? <img src={meta.image} alt="preview" className="w-full rounded-lg object-cover" /> : null}
        {meta?.title ? <p className="font-semibold">{meta.title}</p> : null}
        <p className="break-words text-xs text-white/60">{submission.data.kind === 'video' ? submission.data.url : ''}</p>
        {metaProvider ? <p className="text-xs text-white/60">Provider: {metaProvider}</p> : null}
        {typeof metaCanEmbed === 'boolean' ? (
          <p className="text-xs text-white/60">Embeddable: {metaCanEmbed ? 'yes' : 'needs review'}</p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/60">
        <span>{submission.type}</span>
        <span>{createdAt}</span>
      </div>
      <div className="space-y-3 text-sm">
        <p className="text-xs text-white/60">{submission.email}</p>
        {renderPreview()}
        {submission.type === 'image' && submission.data.kind === 'image' ? (
          <>
            {submission.data.imageUrl ? (
              <p className="break-words text-xs text-white/60">{submission.data.imageUrl}</p>
            ) : null}
            <p className="text-xs text-white/60">
              Contributor: {submission.data.contributor.firstName} {submission.data.contributor.lastName}
            </p>
            {submission.data.keywords?.length ? (
              <p className="text-xs text-white/60">Keywords: {submission.data.keywords.join(', ')}</p>
            ) : null}
          </>
        ) : null}
        {submission.type === 'text' && submission.data.kind === 'text' && submission.data.author ? (
          <p className="text-xs text-white/60">Author: {submission.data.author}</p>
        ) : null}
      </div>
      {submission.type === 'text' ? (
        <div className="flex items-center gap-2">
          {(['joke', 'quote', 'fact'] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => setState({ textKind: kind })}
              className={clsx(
                'rounded-full px-3 py-1 text-xs font-semibold',
                textKind === kind ? 'bg-white text-black' : 'bg-white/10 text-white/70',
              )}
            >
              {kind}
            </button>
          ))}
        </div>
      ) : null}
      <div className="mt-auto flex gap-2 pt-2">
        <button
          type="button"
          onClick={onApprove}
          className="flex-1 rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-black hover:bg-emerald-400"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={onReject}
          className="rounded-xl border border-white/30 px-3 py-2 text-sm hover:bg-white/10"
        >
          Delete
        </button>
      </div>
    </div>
  )
}

function formatBytesToMb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1)
}
