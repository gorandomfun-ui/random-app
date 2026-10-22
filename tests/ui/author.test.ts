import assert from 'node:assert/strict'
import test from 'node:test'

import { AUTHOR_SERIES_MIN, AUTHOR_SERIES_SIZE, authorChannelUrl, authorPlatform, knownChannelKey, offersAuthorSeries } from '../../lib/random/author'

test("an author's channel page at its platform, from the site's channel key", () => {
  assert.equal(authorChannelUrl('youtube:UCX6OQ3DkcsbYNE6H8uQQuVA'), 'https://www.youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA')
  // The owner's zoo video, 22 October: the account's id opens "Vidéos de 2 Girls 1 Adventure".
  assert.equal(authorChannelUrl('dailymotion:x2b1rhk'), 'https://www.dailymotion.com/x2b1rhk')
  assert.equal(authorChannelUrl('bilibili:123456'), 'https://space.bilibili.com/123456')
  assert.equal(authorPlatform('dailymotion:x2b1rhk'), 'Dailymotion')
  assert.equal(authorPlatform('youtube:UCX6OQ3DkcsbYNE6H8uQQuVA'), 'YouTube')
})

test('no channel for a key the site cannot read: a Dailymotion category, an unknown platform, nothing', () => {
  assert.equal(authorChannelUrl('dailymotion:news'), null)
  assert.equal(authorChannelUrl('vimeo:123'), null)
  assert.equal(authorChannelUrl('youtube:not-a-channel'), null)
  assert.equal(authorChannelUrl(undefined), null)
  assert.equal(knownChannelKey(''), false)
  assert.equal(authorPlatform('reddit:abc'), null)
})

test('the légende offers the author in Random from three of their other videos; fewer, the name opens the channel', () => {
  assert.equal(AUTHOR_SERIES_MIN, 3)
  assert.equal(AUTHOR_SERIES_SIZE, 5)
  assert.equal(offersAuthorSeries(5), true)
  assert.equal(offersAuthorSeries(3), true)
  assert.equal(offersAuthorSeries(2), false)
  assert.equal(offersAuthorSeries(undefined), false, 'a video drawn elsewhere than the draw: the channel')
})
