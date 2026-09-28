/**
 * The games' sounds and tunes, written into files for the iPhone and the iPad.
 *
 *   node --import tsx scripts/games/sounds.ts
 *
 * Those devices play Random's sounds as files, never through a live engine
 * (which takes the videos' sound away there), and the games do the same. The
 * samples come from `lib/games/chiptune.ts`, the very ones a computer plays,
 * so both hear the same thing. Mono, 16 bits, 22 050 Hz, like Random's own.
 * A test checks the files still match what the code makes.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { renderSound, renderTune, SOUND_NAMES, SOUND_RATE, TUNE_NAMES } from '../../lib/games/chiptune'

export const SOUNDS_DIR = path.join(process.cwd(), 'public', 'sounds', 'games')

/** Samples as a WAV file. */
export function wav(samples: Float32Array): Buffer {
  const buffer = Buffer.alloc(44 + samples.length * 2)
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + samples.length * 2, 4); buffer.write('WAVE', 8)
  buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(SOUND_RATE, 24); buffer.writeUInt32LE(SOUND_RATE * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36); buffer.writeUInt32LE(samples.length * 2, 40)
  samples.forEach((v, i) => buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32_767), 44 + i * 2))
  return buffer
}

/** Every file, by name. */
export function soundFiles(): Map<string, Buffer> {
  const files = new Map<string, Buffer>()
  for (const name of SOUND_NAMES) files.set(`${name}.wav`, wav(renderSound(name)))
  for (const name of TUNE_NAMES) files.set(`tune-${name}.wav`, wav(renderTune(name)))
  return files
}

if (process.argv[1]?.endsWith('sounds.ts')) {
  mkdirSync(SOUNDS_DIR, { recursive: true })
  let total = 0
  for (const [name, data] of soundFiles()) {
    writeFileSync(path.join(SOUNDS_DIR, name), data)
    total += data.length
    console.log(name.padEnd(18), `${(data.length / 1024).toFixed(0)} KB`)
  }
  console.log('total', `${(total / 1024).toFixed(0)} KB`)
}
