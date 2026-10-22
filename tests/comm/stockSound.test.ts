import test from 'node:test'
import assert from 'node:assert/strict'

import { audioSampleMean, hasSoundHead, pexelsCandidates, pixabayCandidates, probe, soundHostAllowed } from '@/lib/comm/stockSound'

/** An MP4 box: its size, its type, its payload. */
const box = (type: string, ...parts: Array<Buffer | string>): Buffer => {
  const body = Buffer.concat(parts.map((p) => (typeof p === 'string' ? Buffer.from(p, 'latin1') : p)))
  const head = Buffer.alloc(8); head.writeUInt32BE(body.length + 8, 0); head.write(type, 4, 'latin1')
  return Buffer.concat([head, body])
}
const u32 = (...values: number[]) => { const b = Buffer.alloc(values.length * 4); values.forEach((v, i) => b.writeUInt32BE(v, i * 4)); return b }
const hdlr = (handler: string) => box('hdlr', u32(0, 0), handler, u32(0, 0, 0), 'name\0')
const stsz = (sizes: number[], constant = 0) => box('stsz', u32(0, constant, sizes.length), u32(...sizes))
const trak = (handler: string, sizes: number[], constant = 0) => box('trak', box('mdia', hdlr(handler), box('minf', box('stbl', box('stsd', u32(0, 1), box(handler === 'soun' ? 'mp4a' : 'avc1', u32(0, 0))), stsz(sizes, constant)))))
const file = (...traks: Buffer[]) => new Uint8Array(Buffer.concat([box('ftyp', 'isom', u32(512)), box('moov', box('mvhd', u32(0, 0, 0)), ...traks), box('mdat', 'xxxxxxxx')]))

test('the head of an MP4 tells a sounding audio track by its sample sizes; a silent one by their smallness; nothing when moov is not there', () => {
  const loud = file(trak('vide', [9000, 1200, 1300]), trak('soun', Array.from({ length: 40 }, (_, i) => 300 + i)))
  assert.equal(Math.round(audioSampleMean(loud)!), 320)
  assert.equal(hasSoundHead(loud), true)
  const silent = file(trak('vide', [9000, 1200, 1300]), trak('soun', Array.from({ length: 40 }, () => 9)))
  assert.equal(hasSoundHead(silent), false)
  assert.equal(hasSoundHead(file(trak('vide', [9000, 1200, 1300]))), false)
  assert.equal(hasSoundHead(file(trak('vide', [1, 2]), trak('soun', [], 180))), true)
  assert.equal(hasSoundHead(new Uint8Array(Buffer.concat([box('ftyp', 'isom'), box('mdat', 'soun mp4a')]))), null)
  // A head cut inside the sample table judges on what it has.
  assert.equal(hasSoundHead(loud.subarray(0, loud.length - 60)), true)
})

test('only https on the platforms’ own video hosts', () => {
  assert.ok(soundHostAllowed('https://cdn.pixabay.com/video/2024/01/01/x_small.mp4'))
  assert.ok(soundHostAllowed('https://videos.pexels.com/video-files/1/1.mp4'))
  assert.ok(!soundHostAllowed('http://cdn.pixabay.com/video/x.mp4'))
  assert.ok(!soundHostAllowed('https://example.com/x.mp4'))
})

const fakeFetch = (answer: (url: string, init?: RequestInit) => Response): typeof fetch => (async (url: string | URL | Request, init?: RequestInit) => answer(String(url), init)) as typeof fetch

test('candidates keep the light renditions on known hosts, within 4 to 90 seconds', async () => {
  const px = fakeFetch(() => new Response(JSON.stringify({ hits: [
    { id: 1, pageURL: 'https://pixabay.com/videos/1/', duration: 20, user: 'ann', videos: { small: { url: 'https://cdn.pixabay.com/video/a_small.mp4', size: 2_000_000 }, tiny: { url: 'https://cdn.pixabay.com/video/a_tiny.mp4', size: 500_000 } } },
    { id: 2, pageURL: 'https://pixabay.com/videos/2/', duration: 20, user: 'bob', videos: { small: { url: 'https://cdn.pixabay.com/video/b_small.mp4', size: 9_000_000 }, tiny: { url: 'https://cdn.pixabay.com/video/b_tiny.mp4', size: 900_000 } } },
    { id: 3, pageURL: 'https://pixabay.com/videos/3/', duration: 2, user: 'cy', videos: { tiny: { url: 'https://cdn.pixabay.com/video/c_tiny.mp4', size: 100_000 } } },
    { id: 4, pageURL: 'https://pixabay.com/videos/4/', duration: 20, user: 'dee', videos: { tiny: { url: 'https://evil.example/d.mp4', size: 100_000 } } },
  ] }), { status: 200 }))
  const found = await pixabayCandidates('k', 'rain', px)
  assert.deepEqual(found.map((c) => [c.key, c.url, c.author]), [['pixabay:1', 'https://cdn.pixabay.com/video/a_small.mp4', 'ann'], ['pixabay:2', 'https://cdn.pixabay.com/video/b_tiny.mp4', 'bob']])
  const pe = fakeFetch(() => new Response(JSON.stringify({ videos: [
    { id: 7, duration: 12, url: 'https://www.pexels.com/video/7/', user: { name: 'eve' }, video_files: [{ link: 'https://videos.pexels.com/video-files/7/1080.mp4', width: 1080, file_type: 'video/mp4', size: 20_000_000 }, { link: 'https://videos.pexels.com/video-files/7/360.mp4', width: 360, file_type: 'video/mp4', size: 1_000_000 }, { link: 'https://videos.pexels.com/video-files/7/640.mp4', width: 640, file_type: 'video/mp4', size: 3_000_000 }] },
  ] }), { status: 200 }))
  const pexels = await pexelsCandidates('k', 'rain', pe)
  assert.deepEqual(pexels.map((c) => [c.key, c.url]), [['pexels:7', 'https://videos.pexels.com/video-files/7/640.mp4']])
})

test('a probe reads a range of the head and judges it; a refusal tells nothing', async () => {
  let range = ''
  const ok = fakeFetch((_, init) => { range = String((init?.headers as Record<string, string>)?.Range); return new Response(Buffer.from(file(trak('soun', Array.from({ length: 20 }, () => 250)))), { status: 206 }) })
  assert.equal(await probe('https://cdn.pixabay.com/video/x.mp4', ok), true)
  assert.equal(range, 'bytes=0-262143')
  assert.equal(await probe('https://cdn.pixabay.com/video/x.mp4', fakeFetch(() => new Response('', { status: 403 }))), null)
})
