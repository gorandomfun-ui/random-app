import assert from 'node:assert/strict'
import test from 'node:test'

import { alike, BYTES, centres, DIMS, fromRow, pack, textOf, toBinary, towards, unpack } from '../../lib/v3/ai/fingerprint'

/** A seeded vector in [-1, 1]; `near(base, n)` is the base with a little noise, a stranger is another seed. */
const vector = (seed: number) => { let x = Math.floor(seed * 2654435761) >>> 0 || 1; return Float32Array.from({ length: DIMS }, () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return (x / 0xffffffff) * 2 - 1 }) }
const near = (base: Float32Array, seed: number) => { const noise = vector(seed); return base.map((v, i) => v + 0.3 * noise[i]) }

test('the signs of a vector pack into forty-eight bytes and back, and a vector is wholly like itself', () => {
  const bits = pack(vector(1))
  assert.equal(bits.length, BYTES)
  const signs = unpack(bits)
  for (let i = 0; i < DIMS; i += 1) assert.equal(signs[i], vector(1)[i] > 0 ? 1 : -1)
  assert.equal(alike(bits, bits), 1)
  assert.ok(Math.abs(alike(bits, pack(vector(2))) - 0.5) < 0.12, 'two strangers agree on about half their bits')
  assert.equal(alike(bits, pack(vector(1).map((x) => -x))), 0)
})

test('a fingerprint is stored as binary on the row and read back; anything else reads as none', () => {
  const bits = pack(vector(3))
  const stored = toBinary(bits)
  assert.deepEqual(fromRow(stored), bits)
  assert.equal(fromRow('nope'), null)
  assert.equal(fromRow(toBinary(new Uint8Array(3))), null)
})

test('centres of taste sit nearer the likes they summarise than strangers, and a video leans towards its centre', () => {
  const a = vector(1), b = vector(5)
  const liked = [a, near(a, 11), near(a, 12), b, near(b, 13)].map((v) => pack(v))
  const means = centres(liked, 2, 6)
  assert.equal(means.length, 2)
  const close = Math.max(...means.map((mean) => towards(pack(near(a, 14)), mean)))
  const far = Math.max(...means.map((mean) => towards(pack(vector(9)), mean)))
  assert.ok(close > far + 0.2, `${close} vs ${far}`)
  assert.equal(centres([], 3).length, 0)
})

test('the model reads the title then the first lines of the description', () => {
  assert.equal(textOf({ title: 'Jacques Brel - Ne me quitte pas', description: 'Diffusé   le 12/03/1972\nsur la première chaîne.' }), 'Jacques Brel - Ne me quitte pas. Diffusé le 12/03/1972 sur la première chaîne.')
  assert.equal(textOf({ title: 'A' }), 'A.')
})
