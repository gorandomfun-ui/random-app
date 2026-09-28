import assert from 'node:assert/strict'
import test from 'node:test'

import { screenJunk } from '../../lib/ingest/junkStore'
import { fakeDb } from '../support/fakeDb'

test('at the door, a video that says it is made by AI is refused; a video about AI is not', async () => {
  const videos = [
    { videoId: 'a', provider: 'youtube', title: 'Cute Baby Fruits Eating ASMR #aivideo', channelTitle: 'Ai Studio Magic' },
    { videoId: 'b', provider: 'youtube', title: 'The snail that carries a castle', description: 'Made with AI (Kling 2.1)' },
    { videoId: 'c', provider: 'youtube', title: 'Artificial intelligence explained by a teacher' },
    { videoId: 'd', provider: 'youtube', title: 'REACTION ai VIDEO POPOLARI di FAVIJ' },
  ]
  const result = await screenJunk(fakeDb([]), videos, { dryRun: true })
  assert.deepEqual(result.videos.map((video) => video.videoId), ['c', 'd'])
  assert.equal(result.refused, 2)
})
