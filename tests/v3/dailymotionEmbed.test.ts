import test from 'node:test'
import assert from 'node:assert/strict'

import { DAILYMOTION_PLAYERS, dailymotionEmbedUrl } from '../../lib/players/dailymotionPlayer'

/**
 * The address the Dailymotion player is asked for.
 *
 * On 28 September 2026 the generic player (`geo.dailymotion.com/player.html`)
 * answered 403 to everyone and 62 % of the videos turned black; the old
 * `dailymotion.com/embed/video/<id>` redirects to it. RANDOM's own players are
 * asked for instead, and the sound is chosen by choosing the player.
 */

test('RANDOM\'s own player, never the generic one nor the old embed address', () => {
  for (const muted of [true, false]) {
    const url = new URL(dailymotionEmbedUrl('x8abcde', muted))
    assert.equal(url.hostname, 'geo.dailymotion.com')
    assert.match(url.pathname, /^\/player\/x[0-9a-z]+\.html$/)
    assert.notEqual(url.pathname, '/player.html', 'the generic player answers 403')
    assert.ok(!url.href.includes('/embed/video/'))
  }
})

test('muted and with sound are two players: switching gives the sound back', () => {
  assert.equal(new URL(dailymotionEmbedUrl('x8abcde', true)).pathname, `/player/${DAILYMOTION_PLAYERS.muted}.html`)
  assert.equal(new URL(dailymotionEmbedUrl('x8abcde', false)).pathname, `/player/${DAILYMOTION_PLAYERS.sound}.html`)
  assert.notEqual(DAILYMOTION_PLAYERS.muted, DAILYMOTION_PLAYERS.sound)
})

test('the video is named in the address, and it starts on its own', () => {
  const url = new URL(dailymotionEmbedUrl('x8abcde', false))
  assert.equal(url.searchParams.get('video'), 'x8abcde')
  assert.equal(url.searchParams.get('autoplay'), 'true')
})
