import assert from 'node:assert/strict'
import test from 'node:test'

import { createRandomSequence, RANDOM_SEQUENCE_SIZE } from '../../lib/random/sequence'

test('the cycle keeps its quotas, and never two non-videos in a row', () => {
  let seed = 7
  const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
  for (let trial = 0; trial < 200; trial += 1) {
    const cycle = createRandomSequence(random)
    assert.equal(cycle.length, RANDOM_SEQUENCE_SIZE)
    const videos = cycle.filter((entry) => entry.kind === 'fixed' && entry.itemType === 'video').length
    const images = cycle.filter((entry) => entry.kind === 'fixed' && entry.itemType === 'image').length
    assert.ok(videos >= 24 && videos <= 25, `${videos} videos`)
    assert.ok(images >= 9 && images <= 10, `${images} images`)
    for (let index = 1; index < cycle.length; index += 1) {
      const previous = cycle[index - 1], current = cycle[index]
      const nonVideo = (entry: typeof current) => !(entry.kind === 'fixed' && entry.itemType === 'video')
      assert.ok(!(nonVideo(previous) && nonVideo(current)), `two non-videos in a row at ${index} (trial ${trial})`)
    }
  }
})
