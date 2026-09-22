import test from 'node:test'
import assert from 'node:assert/strict'

import { dayOf, fetchGiphyTrending, fetchTrendsSignals, fetchWikipediaSignals, fetchYouTubeMostPopular, TREND_COUNTRIES } from '@/lib/v3/trend/signals'

/**
 * The real sources, in a dry run: do they answer, and in the shape the line
 * reads. Network only, no database, no write. Skipped unless asked for:
 *   RANDOM_LIVE_SOURCES=1 node --import tsx --test tests/v3/trend-sources.live.test.ts
 */
const live = process.env.RANDOM_LIVE_SOURCES === '1'

test('Google Trends répond pour chaque pays, avec des titres et des gros titres', { skip: !live }, async () => {
  for (const country of TREND_COUNTRIES) {
    const signals = await fetchTrendsSignals(country, dayOf(new Date()))
    assert.ok(signals.length >= 5, `${country} : ${signals.length} signaux`)
    assert.ok(signals[0].title.length > 0)
    assert.ok(signals.some((signal) => (signal.news ?? []).length > 0), `${country} : aucun gros titre`)
  }
})

test('Wikipédia donne le top d_hier ou d_avant-hier pour chaque édition', { skip: !live }, async () => {
  for (const country of TREND_COUNTRIES) {
    const signals = await fetchWikipediaSignals(country, new Date())
    assert.ok(signals.length >= 50, `${country} : ${signals.length} signaux`)
    assert.ok(signals.every((signal) => signal.page && !signal.page.startsWith('Special:')))
  }
})

test('Giphy et YouTube répondent avec les clés du poste', { skip: !live || !process.env.GIPHY_API_KEY || !process.env.YOUTUBE_API_KEY }, async () => {
  const giphy = await fetchGiphyTrending(process.env.GIPHY_API_KEY!, dayOf(new Date()))
  assert.ok(giphy.length >= 10, `giphy : ${giphy.length}`)
  const youtube = await fetchYouTubeMostPopular(process.env.YOUTUBE_API_KEY!, 'FR', dayOf(new Date()))
  assert.ok(youtube.length >= 10, `youtube : ${youtube.length}`)
})
