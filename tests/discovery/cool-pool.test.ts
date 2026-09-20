import test from 'node:test'
import assert from 'node:assert/strict'

import { currentThread, THREAD_REACH, THREAD_SIZE } from '../../lib/discovery/coolPool'
import { THREAD_PREFIX } from '../../lib/v3/cool/thread'
import type { Seen } from '../../lib/discovery/types'

function seen(key: string, extra: Partial<Seen> = {}): Seen {
  return { key, type: 'video', stock: false, family: 'unknown', ...extra }
}
const thread = `${THREAD_PREFIX}youtube:graine`

test('sans membre de fil parmi les derniers contenus vus : pas de fil en cours', () => {
  assert.equal(currentThread([]), null)
  assert.equal(currentThread([seen('youtube:a'), seen('youtube:b')]), null)
})

test('le fil se lit dans ce que le visiteur a vu : la graine, puis chaque voisin', () => {
  const afterSeed = currentThread([seen('youtube:x'), seen('youtube:graine', { seriesKey: thread, authorKey: 'youtube:UC1' })])
  assert.equal(afterSeed?.seedKey, 'youtube:graine')
  assert.equal(afterSeed?.served, 1)

  const afterOne = currentThread([
    seen('youtube:graine', { seriesKey: thread, authorKey: 'youtube:UC1' }),
    seen('joke:text:1:2', { type: 'joke' }),
    seen('giphy:v1', { type: 'image', seriesKey: thread, authorKey: 'giphy:archive' }),
  ])
  assert.equal(afterOne?.served, 2)
  assert.deepEqual([...afterOne!.authors].sort(), ['giphy:archive', 'youtube:uc1'], 'les auteurs déjà montrés, en minuscules')

  const complete = currentThread([
    seen('youtube:graine', { seriesKey: thread }),
    seen('giphy:v1', { type: 'image', seriesKey: thread }),
    seen('youtube:v2', { seriesKey: thread }),
  ])
  assert.equal(complete?.served, THREAD_SIZE, 'trois membres : le fil est complet')
})

test('un fil trop loin derrière ne se poursuit pas', () => {
  const recent = [
    seen('youtube:graine', { seriesKey: thread }),
    ...Array.from({ length: THREAD_REACH }, (_, index) => seen(`youtube:autre${index}`)),
  ]
  assert.equal(currentThread(recent), null)
  assert.equal(currentThread(recent.slice(0, THREAD_REACH))?.served, 1, 'juste à portée, il continue')
})

test('le dernier fil compte, pas un fil plus ancien', () => {
  const older = `${THREAD_PREFIX}youtube:ancienne`
  const recent = [
    seen('youtube:ancienne', { seriesKey: older }),
    seen('youtube:o1', { seriesKey: older }),
    seen('youtube:graine', { seriesKey: thread }),
  ]
  assert.equal(currentThread(recent)?.seedKey, 'youtube:graine')
  assert.equal(currentThread(recent)?.served, 1)
})
