import assert from 'node:assert/strict'
import test from 'node:test'

import { BILIBILI_FOR_EVERYONE, onComputer } from '../../lib/v3/bilibili'
import { bilibiliDocument } from '../../lib/v3/ingest/lines/bilibili'

const row = { bvid: 'BV1q3pS6tE4J', title: '以善为饵，比恶更恶', desc: '一个故事', duration: 261, pubdate: 1792023600, tname: '音乐综合', owner: { mid: 42, name: '我爱吃派大星' }, stat: { view: 109000 }, rights: { pay: 0, arc_pay: 0, ugc_pay: 0 }, videos: 1 }

test("a Bilibili video for a computer: its player's address, its uploader, Chinese, marked for a computer only, no picture", () => {
  const built = bilibiliDocument(row, new Date('2026-10-17T00:00:00Z'))
  assert.ok('doc' in built)
  const { doc } = built as { doc: Record<string, unknown> }
  assert.equal(doc.provider, 'bilibili')
  assert.equal(doc.videoId, 'bilibili:BV1q3pS6tE4J')
  assert.equal(doc.url, 'https://www.bilibili.com/video/BV1q3pS6tE4J')
  assert.equal(doc.duration, 'PT4M21S')
  assert.equal(doc.channelId, 'bilibili:42')
  assert.equal(doc.lang, 'zh')
  assert.equal((doc.v3 as { desktopOnly?: boolean }).desktopOnly, true)
  assert.equal(doc.thumb, undefined, "Bilibili's pictures refuse to show on another site")
})

test('never a licensed or paid programme, a video in several parts, a very long one, nor a short one', () => {
  const refused = (change: Record<string, unknown>) => (bilibiliDocument({ ...row, ...change }, new Date()) as { refused?: string }).refused
  assert.equal(refused({ is_ogv: true }), 'programme sous licence ou payant')
  assert.equal(refused({ rights: { pay: 1 } }), 'programme sous licence ou payant')
  assert.equal(refused({ videos: 3 }), 'en plusieurs parties')
  assert.equal(refused({ duration: 1743 }), 'durée', 'cut at three minutes without an account (16 October)')
  assert.equal(refused({ duration: 12 }), 'durée')
  assert.equal(refused({ bvid: 'nope' }), 'incomplète')
})

test('a computer as its browser says it, never a phone nor an Android tablet; everyone waits for the curator\'s test', () => {
  assert.equal(onComputer('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'), true)
  assert.equal(onComputer('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'), true)
  assert.equal(onComputer('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'), false)
  assert.equal(onComputer('Mozilla/5.0 (Linux; Android 14; SM-X910) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'), false)
  assert.equal(onComputer(''), false)
  assert.equal(BILIBILI_FOR_EVERYONE, false)
})
