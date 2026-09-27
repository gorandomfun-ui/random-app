import test from 'node:test'
import assert from 'node:assert/strict'

import { HN_FIRST_YEAR, HN_QUERIES, hnNextPage, hnQueries, hnSearchUrl, hnSite } from '@/lib/v3/web/hackerNews'
import { boringWebReason } from '@/lib/v3/web/quality'

test('a Show HN post becomes the site it shows, without the prefix', () => {
  const site = hnSite({ objectID: '1', title: 'Show HN: Looptap – A minimal game to waste your time', url: 'https://looptap.vasanthv.com/', points: 1241, story_text: '<p>I made this &amp; it&#x27;s fun</p>' })
  assert.deepEqual(site, { url: 'https://looptap.vasanthv.com/', title: 'Looptap – A minimal game to waste your time', text: "I made this & it's fun", points: 1241, postId: '1' })
})

test('code, stores, videos, text posts and tools for developers are not sites to land on', () => {
  assert.equal(hnSite({ title: 'Show HN: I wrote my own RTS game engine in C', url: 'https://github.com/eduard-permyakov/permafrost-engine' }), null)
  assert.equal(hnSite({ title: "Show HN: I'm 48 and finally learning how to be a game developer", url: 'https://apps.apple.com/us/app/slingshot-effect/id1537916631' }), null)
  assert.equal(hnSite({ title: 'Show HN: A friend and I spent 6 years making a simulation game', url: null }), null)
  assert.equal(hnSite({ title: 'Show HN: Acme – Observability dashboard for LLM agents (YC W24)', url: 'https://acme.dev' }), null)
  assert.equal(hnSite({ title: 'Show HN: A Chrome extension to gamify your tabs', url: 'https://tabs.example' }), null)
  assert.equal(hnSite({ title: 'Show HN: CSV Explorer (YC F1) - Explore CSVs with Millions of Rows', url: 'https://www.csvexplorer.com/' }), null)
  assert.equal(hnSite({ title: 'Show HN: Marple – Interactive time series visualization for engineers', url: 'https://www.marpledata.com/' }), null)
  assert.equal(hnSite({ title: 'Show HN: Foxglove – Web-based visualization for robotics', url: 'https://foxglove.dev/' }), null)
  assert.equal(hnSite({ title: 'Show HN: A simple hand drawn HTML/CSS theme', url: 'https://chr15m.github.io/DoodleCSS/' }), null)
  assert.equal(hnSite({ title: 'Show HN: Redis City – Explore how Redis works in an interactive 3D model', url: 'https://poltora.dev/redis' }), null)
  assert.equal(hnSite({ title: 'Show HN: Anyone interested in a tool helps to explore C++ ASTs', url: 'https://uvic-aurora.github.io/acav-manual/index.html' }), null)
})

test('the playful ones pass the site sort too, deep address or not', () => {
  for (const [url, title] of [
    ['https://www.lessmilk.com/almost-pong/', 'I made a web game called Almost Pong'],
    ['https://backofyourhand.com/51.89863,-8.47039', 'A game that tests how well you know your local area'],
    ['https://benoitessiambre.com/macro.html', 'A central bank simulator game with a realistic economic model'],
    ['https://sinerider.com/', 'SineRider - A game about love, math, and graphing built by teenagers'],
  ]) {
    assert.ok(hnSite({ title: `Show HN: ${title}`, url }), url)
    assert.equal(boringWebReason(url, title, 'hn'), null, url)
  }
})

test('searches cover the whole archive over the days and never the same word twice in a run', () => {
  assert.equal(hnNextPage(0, () => 0.5), null)
  assert.equal(hnNextPage(1, () => 0.5), null)
  assert.equal(hnNextPage(9, () => 0), 1)
  assert.equal(hnNextPage(9, () => 0.999999), 8)
  const words = hnQueries(8, Math.random)
  assert.equal(new Set(words).size, 8)
  assert.ok(words.every((word) => (HN_QUERIES as readonly string[]).includes(word)))
  const url = new URL(hnSearchUrl('game', 3))
  assert.equal(url.searchParams.get('tags'), 'show_hn')
  assert.equal(url.searchParams.get('restrictSearchableAttributes'), 'title')
  assert.equal(url.searchParams.get('page'), '3')
  assert.equal(url.searchParams.get('numericFilters'), `points>=40,created_at_i>${Date.UTC(HN_FIRST_YEAR, 0, 1) / 1000}`)
})
