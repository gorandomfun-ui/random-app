import type { Metadata } from 'next'
import Link from 'next/link'

import { getDb } from '@/lib/db'
import { publishedPosts } from '@/lib/comm/posts'
import { BASE_BACKGROUND, BASE_CREAM, TEXT_COLORS } from '@/lib/theme'

/**
 * The link in the bio. What the curator shared lately, by number, with the
 * way to the original: the page Instagram and TikTok profiles point to. Built
 * once every five minutes, so no visitor reads the base.
 */
export const revalidate = 300
export const metadata: Metadata = { title: 'Random — les liens', robots: { index: false, follow: true } }

const DESTINATION_WORDS: Record<string, string> = { instagram: 'Instagram', tiktok: 'TikTok', x: 'X' }

export default async function LinksPage() {
  let posts: Awaited<ReturnType<typeof publishedPosts>> = []
  try { posts = await publishedPosts(await getDb(), 100) } catch { posts = [] }
  const accent = TEXT_COLORS[new Date().getUTCDate() % TEXT_COLORS.length]
  return (
    <main className="min-h-screen px-4 py-10" style={{ background: BASE_BACKGROUND, color: BASE_CREAM }}>
      <div className="mx-auto max-w-xl">
        <h1 className="font-tomorrow text-3xl font-black uppercase" style={{ color: accent }}>Les liens</h1>
        <p className="mt-2 text-sm opacity-80">Les découvertes partagées, et d’où elles viennent. Le numéro est celui de la publication.</p>
        {posts.length ? (
          <ol className="mt-6 space-y-4">
            {posts.map((post) => (
              <li key={post.number} className="rounded-xl border p-4" style={{ borderColor: `${BASE_CREAM}33` }}>
                <p className="text-xs opacity-70">n° {post.number}{post.publishedAt ? ` · ${post.publishedAt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}{post.destination ? ` · ${DESTINATION_WORDS[post.destination] ?? post.destination}` : ''}</p>
                <p className="mt-1 font-bold">{post.title || 'Sans titre'}</p>
                <p className="text-sm opacity-80">{[post.author, post.provider].filter(Boolean).join(' · ')}</p>
                <a href={`/l/${post.linkKey}`} className="mt-2 inline-block text-sm font-bold uppercase underline" style={{ color: accent }} rel="noreferrer">Voir l’original</a>
              </li>
            ))}
          </ol>
        ) : <p className="mt-6 text-sm opacity-80">Rien encore.</p>}
        <p className="mt-10 text-xs opacity-70"><Link href="/" className="underline">Random</Link> — tombe sur des choses que tu ne cherchais pas.</p>
      </div>
    </main>
  )
}
