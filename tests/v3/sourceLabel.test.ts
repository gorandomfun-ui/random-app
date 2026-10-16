import assert from 'node:assert/strict'
import test from 'node:test'

import { shownSourceName } from '../../lib/random/sourceName'

test("the line under a video names the platform, never the dig's own label (16 October: \"dig:people\" under a Dailymotion video)", () => {
  for (const label of ['dig:people', 'dig:keywords', 'dig:likes', 'dig:trends']) assert.equal(shownSourceName(label, 'dailymotion'), 'dailymotion')
  assert.equal(shownSourceName('Arte', 'dailymotion'), 'Arte', 'a real source keeps its name')
  assert.equal(shownSourceName(undefined, 'youtube'), 'youtube')
  assert.equal(shownSourceName('', 'youtube'), 'youtube')
})
