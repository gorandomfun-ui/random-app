import test from 'node:test'
import assert from 'node:assert/strict'

import { countZones, pickZone, summarise, zonesOfLikes, type PoolZone } from '@/lib/v3/cool/likePool'
import type { LikeZone } from '@/lib/v3/cool/likes'

const rolls = (values: number[]) => { let index = 0; return () => values[index++ % values.length] }
const like = (id: string, extra: Partial<LikeZone> = {}): LikeZone => ({ id, type: 'video', subjectIds: [], universe: 'other', angle: 'other', era: 'unknown', ...extra })
const zone = (kind: PoolZone['kind'], key: string, video: number, image = 0): PoolZone => ({ id: `${kind}:${key}`, kind, key, likeIds: ['l'], video, image })

test('une zone par auteur liké et par sujet nommé : deux likes d_un auteur font une zone', () => {
  const zones = zonesOfLikes([
    like('a', { channelKey: 'youtube:UC1', subjectIds: ['artist:x'] }),
    like('b', { channelKey: 'youtube:UC1' }),
    like('c', { subjectIds: ['artist:x', 'topic:arcade'] }),
    like('d'),
  ])
  assert.deepEqual(zones.map((z) => z.id).sort(), ['author:youtube:UC1', 'subject:artist:x', 'subject:topic:arcade'])
  assert.deepEqual(zones.find((z) => z.id === 'author:youtube:UC1')?.likeIds, ['a', 'b'])
  assert.deepEqual(zones.find((z) => z.id === 'subject:artist:x')?.likeIds, ['a', 'c'])
})

test('les tailles comptent les contenus servables de la zone, les likes exclus', async () => {
  const { fakeDb, fakeVideo } = await import('../support/fakeDb')
  const liked = fakeVideo('music', { v3: { registers: ['music'], channelKey: 'youtube:UC1', subjects: [{ id: 'artist:x' }], usable: true } })
  const rows = [
    liked,
    fakeVideo('music', { v3: { registers: ['music'], channelKey: 'youtube:UC1', usable: true } }),
    fakeVideo('music', { v3: { registers: ['music'], channelKey: 'youtube:UC1', usable: true }, isSuppressed: true }),
    fakeVideo('music', { v3: { registers: ['music'], subjects: [{ id: 'artist:x' }], usable: true } }),
    fakeVideo('music', { type: 'image', v3: { registers: ['music'], subjects: [{ id: 'artist:x' }], usable: true } }),
    fakeVideo('music', { v3: { registers: ['music'], subjects: [{ id: 'artist:x' }], usable: false } }),
  ]
  const zones = zonesOfLikes([like(String(liked._id), { channelKey: 'youtube:UC1', subjectIds: ['artist:x'] })])
  const { zones: counted, uncounted } = await countZones(fakeDb(rows), zones, [String(liked._id)])
  assert.deepEqual(uncounted, [])
  assert.deepEqual(counted.map((z) => [z.id, z.video, z.image]), [['author:youtube:UC1', 1, 0], ['subject:artist:x', 1, 1]])
  const summary = summarise(counted, 1, new Date(0), 300)
  assert.equal(summary.connected, 3)
  assert.equal(summary.effective, 3)
})

test('une zone pèse ce qu_elle contient pour le format, plafonné ; une zone vide ne sort jamais', () => {
  const zones = [zone('author', 'big', 3000), zone('author', 'small', 2), zone('subject', 'gifs', 0, 50), zone('author', 'none', 0)]
  // Video weights: 300 + 2 + 0 + 0 = 302. A roll just under 300/302 is the big author; just above, the small one.
  assert.equal(pickZone(zones, 'video', rolls([299 / 302]))?.key, 'big')
  assert.equal(pickZone(zones, 'video', rolls([300.5 / 302]))?.key, 'small')
  assert.equal(pickZone(zones, 'video', rolls([0.999999]))?.key, 'small', 'la fin de la roue tombe sur la dernière zone de poids non nul')
  // Image weights: only the subject zone with GIFs.
  assert.equal(pickZone(zones, 'image', rolls([0.2]))?.key, 'gifs')
  assert.equal(pickZone([zone('author', 'none', 0)], 'video', rolls([0.5])), null)
  assert.equal(summarise(zones, 4, new Date(0), 300).effective, 352)
  assert.equal(summarise(zones, 4, new Date(0), 300).connected, 3052)
})

test('une zone trop grande pour être comptée garde son compte d_avant, ou pèse le plafond', async () => {
  const failing = { collection: () => ({ countDocuments: async () => { throw new Error('operation exceeded time limit') } }) } as unknown as import('mongodb').Db
  const zones = zonesOfLikes([like('a', { channelKey: 'youtube:UC1', subjectIds: ['topic:arcade'] })])
  const previous = new Map([['author:youtube:UC1', { ...zones[0], video: 2847, image: 0 }]])
  const { zones: counted, uncounted } = await countZones(failing, zones, ['a'], previous, 10)
  assert.deepEqual(uncounted, ['author:youtube:UC1', 'subject:topic:arcade'])
  assert.equal(counted.find((z) => z.kind === 'author')?.video, 2847, 'le compte d_avant')
  assert.equal(counted.find((z) => z.kind === 'subject')?.video, 300, 'sans compte d_avant, le plafond')
})
