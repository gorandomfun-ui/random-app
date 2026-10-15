import test from 'node:test'
import assert from 'node:assert/strict'

import { blobKeyFor, blobPathnameOf, extensionOf, keyBelongsTo, MEDIA_MAX_BYTES } from '@/lib/comm/blob'
import { imageSizeOf } from '@/lib/comm/imageSize'
import { captureEmbedUrl, formatSeconds, parseStartSeconds, pickRecorderType } from '@/lib/comm/capture'

const ITEM = '0123456789abcdef01234567'

test('une clé Blob vit dans le dossier de son élément, avec un nom que personne ne devine', () => {
  const key = blobKeyFor(ITEM, 'video/webm')
  assert.match(key, /^comm\/0123456789abcdef01234567\/[a-f\d]{24}\.webm$/)
  assert.ok(keyBelongsTo(key, ITEM))
  assert.ok(!keyBelongsTo(key, 'ffffffffffffffffffffffff'))
  assert.ok(!keyBelongsTo(`comm/${ITEM}/sub/x.png`, ITEM), 'pas de sous-dossier')
  assert.ok(!keyBelongsTo('comm/../x.png', ITEM))
  assert.equal(extensionOf('image/jpeg'), 'jpg'); assert.equal(extensionOf('video/quicktime'), 'mov'); assert.equal(extensionOf('text/html'), '')
  assert.equal(MEDIA_MAX_BYTES, 200 * 1024 * 1024)
})

test('une adresse Blob donne son chemin ; une autre adresse non', () => {
  assert.equal(blobPathnameOf(`https://abc123.public.blob.vercel-storage.com/comm/${ITEM}/aa.png`), `comm/${ITEM}/aa.png`)
  assert.equal(blobPathnameOf('https://example.com/comm/x.png'), null)
  assert.equal(blobPathnameOf('http://abc.public.blob.vercel-storage.com/x'), null)
  assert.equal(blobPathnameOf('nope'), null)
})

test('les dimensions se lisent dans l_en-tête d_un PNG, d_un GIF, d_un JPEG', () => {
  const png = new Uint8Array(32); png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  new DataView(png.buffer).setUint32(16, 1080); new DataView(png.buffer).setUint32(20, 1920)
  assert.deepEqual(imageSizeOf(png), { width: 1080, height: 1920 })
  const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x2c, 0x01, 0xf4, 0x01, 0, 0])
  assert.deepEqual(imageSizeOf(gif), { width: 300, height: 500 })
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58, 0x03, 0x20, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  assert.deepEqual(imageSizeOf(jpeg), { width: 800, height: 600 })
  assert.equal(imageSizeOf(new Uint8Array([1, 2, 3])), null)
})

test('le temps de départ se lit en secondes ou en minutes:secondes', () => {
  assert.equal(parseStartSeconds('83'), 83); assert.equal(parseStartSeconds('1:23'), 83); assert.equal(parseStartSeconds('1:02:03'), 3723)
  assert.equal(parseStartSeconds(''), 0); assert.equal(parseStartSeconds('abc'), 0); assert.equal(parseStartSeconds('1:-2'), 0)
  assert.equal(formatSeconds(83), '1:23'); assert.equal(formatSeconds(3723), '1:02:03'); assert.equal(formatSeconds(0), '0:00')
})

test('le lecteur de capture : YouTube sans commandes ni sous-titres à la seconde voulue, Dailymotion sur notre lecteur', () => {
  const yt = captureEmbedUrl('https://youtu.be/aFniMntPUbc', 'youtube', 83, 'https://gorandom.fun')
  assert.ok(yt && yt.provider === 'youtube')
  const url = new URL(yt.src)
  assert.equal(url.host, 'www.youtube-nocookie.com'); assert.equal(url.pathname, '/embed/aFniMntPUbc')
  assert.equal(url.searchParams.get('controls'), '0'); assert.equal(url.searchParams.get('cc_load_policy'), '0'); assert.equal(url.searchParams.get('start'), '83'); assert.equal(url.searchParams.get('autoplay'), '1'); assert.equal(url.searchParams.get('origin'), 'https://gorandom.fun')
  const dm = captureEmbedUrl('https://www.dailymotion.com/video/xe41mj', 'dailymotion', 10, '')
  assert.ok(dm && dm.provider === 'dailymotion')
  assert.ok(dm.src.startsWith('https://geo.dailymotion.com/player/x1nqci.html?video=xe41mj'), dm.src)
  assert.ok(dm.src.includes('startTime=10'))
  assert.equal(captureEmbedUrl('https://vimeo.com/123', 'vimeo', 0, ''), null)
})

test('le format d_enregistrement : mp4 quand le navigateur l_offre, sinon WebM', () => {
  assert.equal(pickRecorderType((t) => t.startsWith('video/mp4')), 'video/mp4;codecs=avc1.640028,mp4a.40.2')
  assert.equal(pickRecorderType((t) => t === 'video/webm;codecs=vp8,opus' || t === 'video/webm'), 'video/webm;codecs=vp8,opus')
  assert.equal(pickRecorderType(() => false), null)
})
