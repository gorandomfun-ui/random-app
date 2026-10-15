'use client'

/** The publications and their numbers, links and clicks: the one measure of the tool. */

import Link from 'next/link'
import { useEffect, useState } from 'react'

import type { PostDoc } from '@/lib/comm/model'

const STATUS: Record<string, string> = { draft: 'brouillon', exported: 'exporté', published: 'publié', failed: 'échec' }

export default function StatsPage() {
  const [posts, setPosts] = useState<PostDoc[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    void fetch('/api/admin/comm/posts', { cache: 'no-store' }).then((r) => r.json()).then((body) => { if (body.posts) setPosts(body.posts); else setError('Indisponible.') }).catch(() => setError('Indisponible.'))
  }, [])
  return (
    <main className="min-h-screen bg-black px-5 py-8 text-white">
      <div className="mx-auto max-w-4xl space-y-5">
        <nav className="flex gap-4 text-sm"><Link href="/admin/comm" className="underline">← La file</Link><Link href="/liens" className="underline" target="_blank">La page liens</Link></nav>
        <h1 className="text-2xl font-bold">Publications</h1>
        {error ? <p role="alert" className="text-red-300">{error}</p> : null}
        <table className="w-full text-left text-sm">
          <thead><tr className="text-gray-400"><th className="py-1">n°</th><th>Destination</th><th>Format</th><th>État</th><th>Date</th><th>Clics</th><th>Lien</th><th></th></tr></thead>
          <tbody>
            {posts.map((post) => (
              <tr key={post._id} className="border-t border-white/10">
                <td className="py-1">{post.number}</td><td>{post.destination}</td><td>{post.format}</td><td>{STATUS[post.status] ?? post.status}</td>
                <td>{new Date(post.publishedAt ?? post.updatedAt).toLocaleDateString('fr-FR')}</td><td>{post.clicks}</td>
                <td><a href={`/l/${post.linkKey}`} className="underline" target="_blank" rel="noreferrer">/l/{post.linkKey}</a>{post.remoteUrl ? <> · <a href={post.remoteUrl} className="underline" target="_blank" rel="noreferrer">post</a></> : null}</td>
                <td>{post.status === 'draft' || post.status === 'failed' ? <Link href={`/admin/comm/compose?post=${post._id}`} className="underline">reprendre</Link> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!posts.length && !error ? <p className="text-gray-300">Aucune publication encore.</p> : null}
      </div>
    </main>
  )
}
