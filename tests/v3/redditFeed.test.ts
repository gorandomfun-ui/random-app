import test from 'node:test'
import assert from 'node:assert/strict'

import type { FetchWarning } from '@/lib/ingest/videos'
import { redditYouTube } from '@/lib/ingest/sources/redditFeed'

/**
 * Reading a community through its feed. Reddit answers 403 to its own JSON from
 * a datacentre address, measured on the ingestion server; the feed of the same
 * page answers 200, so the feed is what the line reads.
 */

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>A cat that plays the piano</title>
    <link href="https://www.reddit.com/r/videos/comments/abc/a_cat/" />
    <content type="html">&lt;a href="https://youtu.be/dQw4w9WgXcQ"&gt;[link]&lt;/a&gt;</content>
  </entry>
  <entry>
    <title>Un volcan de très près</title>
    <link href="https://www.reddit.com/r/videos/comments/def/volcan/" />
    <content type="html">&lt;a href="https://www.youtube.com/watch?v=abcdefghijk&amp;amp;t=30"&gt;[link]&lt;/a&gt;</content>
  </entry>
  <entry>
    <title>Just a discussion</title>
    <link href="https://www.reddit.com/r/videos/comments/ghi/talk/" />
    <content type="html">&lt;a href="https://example.com/article"&gt;[link]&lt;/a&gt;</content>
  </entry>
  <entry>
    <title>The same cat again</title>
    <link href="https://www.reddit.com/r/videos/comments/jkl/again/" />
    <content type="html">&lt;a href="https://youtu.be/dQw4w9WgXcQ"&gt;[link]&lt;/a&gt;</content>
  </entry>
</feed>`

function serve(body: string, status = 200): void {
  globalThis.fetch = (async () => new Response(body, { status, headers: { 'content-type': 'application/atom+xml' } })) as typeof fetch
}

test('le flux donne les vidéos, leur titre et le lien vers la discussion', async () => {
  serve(FEED)
  const videos = await redditYouTube('videos', 25)
  assert.equal(videos.length, 2, 'deux vidéos, le lien qui n_en est pas une est ignoré')
  assert.equal(videos[0].videoId, 'dQw4w9WgXcQ')
  assert.equal(videos[0].title, 'A cat that plays the piano')
  assert.equal(videos[0].source?.url, 'https://www.reddit.com/r/videos/comments/abc/a_cat/')
  assert.equal(videos[1].videoId, 'abcdefghijk', 'une adresse longue avec des paramètres marche aussi')
  assert.ok(videos[0].contextQueries?.includes('reddit:videos'))
})

test('une vidéo partagée deux fois dans le même flux ne compte qu_une fois', async () => {
  serve(FEED)
  const videos = await redditYouTube('videos', 25)
  assert.equal(new Set(videos.map((v) => v.videoId)).size, videos.length)
})

test('un refus de Reddit est signalé et ne fait rien tomber', async () => {
  serve('<html>Blocked</html>', 403)
  const warnings: FetchWarning[] = []
  const videos = await redditYouTube('videos', 25, warnings)
  assert.deepEqual(videos, [])
  assert.equal(warnings[0]?.status, 403)
  assert.equal(warnings[0]?.label, 'reddit:videos:hot')
})

test('le top de la semaine est demandé à la bonne adresse', async () => {
  let asked = ''
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    asked = String(input)
    return new Response(FEED, { status: 200 })
  }) as typeof fetch
  await redditYouTube('ObscureMedia', 40, [], { listing: 'top', time: 'week' })
  assert.ok(asked.includes('/r/ObscureMedia/top/.rss'), asked)
  assert.ok(asked.includes('t=week'), asked)
})
