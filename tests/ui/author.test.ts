import assert from 'node:assert/strict'
import test from 'node:test'

import { AUTHOR_SERIES_MIN, AUTHOR_SERIES_SIZE, authorChannelUrl, authorPlatform, knownChannelKey, offersAuthorSeries, rememberDailymotionOwner } from '../../lib/random/author'

test("an author's channel page at its platform, from the site's channel key", () => {
  assert.equal(authorChannelUrl('youtube:UCX6OQ3DkcsbYNE6H8uQQuVA'), 'https://www.youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA')
  assert.equal(authorChannelUrl('bilibili:123456'), 'https://space.bilibili.com/123456')
  assert.equal(authorPlatform('dailymotion:x2b1rhk'), 'Dailymotion')
  assert.equal(authorPlatform('youtube:UCX6OQ3DkcsbYNE6H8uQQuVA'), 'YouTube')
})

test("a Dailymotion author's page by their name, which Dailymotion gives with the video; the video's own page until then", () => {
  // 24 October: dailymotion.com/x1cfbdd answered "Not Found", seven accounts of seven; dailymotion.com/c1115830 opens the channel.
  assert.equal(knownChannelKey('dailymotion:x1cfbdd'), true)
  assert.equal(authorChannelUrl('dailymotion:x1cfbdd'), null, 'never the account id alone')
  assert.equal(authorChannelUrl('dailymotion:x1cfbdd', 'x17dqg9'), 'https://www.dailymotion.com/video/x17dqg9')
  rememberDailymotionOwner('x17dqg9', 'https://www.dailymotion.com/c1115830')
  assert.equal(authorChannelUrl('dailymotion:x1cfbdd', 'x17dqg9'), 'https://www.dailymotion.com/c1115830')
  rememberDailymotionOwner('x8zzzzz', 'https://elsewhere.example/c1115830')
  rememberDailymotionOwner('x8zzzzz', 'https://www.dailymotion.com/user/c1115830/videos')
  assert.equal(authorChannelUrl('dailymotion:x1cfbdd', 'x8zzzzz'), 'https://www.dailymotion.com/video/x8zzzzz', "only an account's own page at Dailymotion is kept")
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
