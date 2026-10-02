import assert from 'node:assert/strict'
import test from 'node:test'

import { OLD_LINES, sortOldLines, titleRule } from '../../lib/v3/dig/oldLines'

test('the title rules of the dig, read on a stored row', () => {
  assert.equal(titleRule({ title: 'Banh-mi-thit @Vietnam', channelTitle: 'MARIKO WILSON' }), null)
  assert.equal(titleRule({ title: 'The Debut - Official Trailer', channelTitle: 'LionsgateFilmsUK' }), 'bande-annonce')
  assert.equal(titleRule({ title: "Don't Let Go", channelTitle: 'Zavyre - Topic' }), 'album fixe')
  assert.equal(titleRule({ title: 'Minecraft survival ep. 12 — let\'s play', channelTitle: 'Gamer' }), "let's play")
  assert.equal(titleRule({ title: '' }), 'titre')
})

test('the week\'s cap keeps a channel\'s first twenty, judged on what the titles let through', () => {
  const rows = [
    ...Array.from({ length: 25 }, (_, i) => ({ _id: `a${i}`, title: `Village fair ${i}`, channelKey: 'dailymotion:fair' })),
    { _id: 'trailer', title: 'Big Film - Official Trailer', channelKey: 'dailymotion:fair' },
    { _id: 'b', title: 'A dinner on super 8', channelKey: 'dailymotion:home' },
    { _id: 'c', title: 'Nameless upload', channelTitle: 'Someone' },
  ]
  const sorted = sortOldLines(rows, 20)
  assert.equal(sorted.kept.length, 22)
  assert.equal(sorted.byRule['chaîne cette semaine'], 5)
  assert.equal(sorted.byRule['bande-annonce'], 1)
  assert.deepEqual(sorted.aside.filter(({ rule }) => rule === 'chaîne cette semaine').map(({ video }) => video._id), ['a20', 'a21', 'a22', 'a23', 'a24'])
  assert.ok(sorted.kept.some((video) => video._id === 'b') && sorted.kept.some((video) => video._id === 'c'))
  assert.deepEqual([...OLD_LINES], ['legacy', 'pools', 'trend', 'music-live', 'authors'])
})
