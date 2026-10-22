import test from 'node:test'
import assert from 'node:assert/strict'

import { captureEmbedUrl, parseStartSeconds, parseYoutubeMessage, scoutEmbedUrl, youtubeCommandMessage } from '@/lib/comm/capture'

const YT = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'

test('the scouting player keeps its controls and the API, the capture player loses them; both start at the second', () => {
  const scout = scoutEmbedUrl(YT, 'YouTube', 83, 'https://www.gorandom.fun')!
  const capture = captureEmbedUrl(YT, 'YouTube', 83, 'https://www.gorandom.fun')!
  assert.equal(scout.provider, 'youtube')
  const s = new URL(scout.src).searchParams, c = new URL(capture.src).searchParams
  assert.equal(s.get('controls'), '1'); assert.equal(c.get('controls'), '0')
  assert.equal(s.get('enablejsapi'), '1'); assert.equal(s.get('origin'), 'https://www.gorandom.fun')
  assert.equal(s.get('start'), '83'); assert.equal(c.get('start'), '83')
  assert.equal(scoutEmbedUrl('https://example.com/page', 'web', 0, ''), null)
})

test('the YouTube player’s messages give its time and length; anything else gives nothing', () => {
  assert.deepEqual(parseYoutubeMessage(JSON.stringify({ event: 'infoDelivery', info: { currentTime: 12.4, duration: 300 } })), { currentTime: 12.4, duration: 300 })
  assert.deepEqual(parseYoutubeMessage(JSON.stringify({ event: 'infoDelivery', info: { playerState: 1 } })), {})
  assert.equal(parseYoutubeMessage(JSON.stringify({ event: 'onReady' })), null)
  assert.equal(parseYoutubeMessage('not json'), null)
  assert.equal(parseYoutubeMessage({ event: 'infoDelivery' }), null)
  assert.deepEqual(JSON.parse(youtubeCommandMessage('seekTo', [42, true])), { event: 'command', func: 'seekTo', args: [42, true], id: 1, channel: 'widget' })
})

test('a start typed as minutes and seconds reads as seconds', () => {
  assert.equal(parseStartSeconds('1:23'), 83); assert.equal(parseStartSeconds('83'), 83); assert.equal(parseStartSeconds('x'), 0)
})
