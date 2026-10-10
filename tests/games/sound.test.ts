import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { CATCHER_CASH, createCatcher, stepCatcher } from '@/lib/games/catcher'
import { renderSound, renderTune, SOUND_NAMES, SOUND_RATE, TUNE_NAMES, tuneSeconds } from '@/lib/games/chiptune'
import { createEater, EATER_BONUSES, stepEater } from '@/lib/games/eater'
import { createRacing, stepRacing } from '@/lib/games/racing-rules'
import { GAME_SOUNDS } from '@/lib/games/sound'

import { soundFiles, SOUNDS_DIR } from '../../scripts/games/sounds'
import { catcherRobot } from './catcher-robot'

const peakOf = (data: Float32Array) => data.reduce((top, v) => Math.max(top, Math.abs(v)), 0)

test('les sons : chacun se fabrique propre, à son niveau, court, et toujours pareil', () => {
  for (const name of SOUND_NAMES) {
    const a = renderSound(name), b = renderSound(name)
    assert.ok(a.every(Number.isFinite), `${name} : des valeurs finies`)
    const peak = peakOf(a)
    // ATTACKS' squirt comes several times a second, a chipped plate, torn foil, a diver, a hit on a boss often: lower on purpose; RACING's public, heard along the road, a little lower; its engine, under everything, lowest
    const share = ({ squirt: 0.6, clink: 0.7, rip: 0.8, whoosh: 0.8, thud: 0.75, cheer: 0.85, engine: 0.42 } as Partial<Record<string, number>>)[name] ?? 1
    assert.ok(peak > 0.29 * share && peak <= 0.3601 * share, `${name} : crête ${peak}`)
    assert.ok(a.length / SOUND_RATE <= 2, `${name} : court`)
    assert.ok(a.every((v, i) => v === b[i]), `${name} : identique d'une fois à l'autre`)
  }
})

test('les musiques : des boucles sans couture, basses, de la bonne durée', () => {
  for (const name of TUNE_NAMES) {
    const loop = renderTune(name)
    assert.equal(loop.length, Math.round(tuneSeconds(name) * SOUND_RATE), `${name} : la durée de ses mesures`)
    assert.ok(Math.abs(peakOf(loop) - 0.2) < 1e-6, `${name} : sous les sons`)
    // the seam: the jump from the last sample to the first is no bigger than an ordinary step in the tune
    let steps = 0
    for (let i = 1; i < loop.length; i += 1) steps = Math.max(steps, Math.abs(loop[i] - loop[i - 1]))
    assert.ok(Math.abs(loop[0] - loop[loop.length - 1]) <= steps, `${name} : sans couture`)
  }
})

test('les sons ne touchent jamais au hasard de la page (Math.random)', () => {
  const real = Math.random
  Math.random = () => { throw new Error('Math.random') }
  try {
    for (const name of SOUND_NAMES) renderSound(name)
    for (const name of TUNE_NAMES) renderTune(name)
  } finally { Math.random = real }
})

test("les fichiers de l'iPhone et de l'iPad sont exactement ceux que le code fabrique", () => {
  for (const [name, data] of soundFiles()) {
    const file = readFileSync(path.join(SOUNDS_DIR, name))
    assert.ok(file.equals(data), `${name} : à refaire avec node --import tsx scripts/games/sounds.ts`)
  }
})

test('chaque jeu a un son pour tout ce que ses règles font entendre', () => {
  const eater = new Set(GAME_SOUNDS.eater.sounds), catcher = new Set(GAME_SOUNDS.catcher.sounds)
  for (const name of ['bite', 'crash', 'level', 'over', 'winner', ...Object.keys(EATER_BONUSES)]) assert.ok(eater.has(name as never), `EATER : ${name}`)
  for (const name of ['item', 'sauce', 'slip', 'caught', 'level', 'over', 'winner', ...Object.keys(CATCHER_CASH)]) assert.ok(catcher.has(name as never), `CATCHER : ${name}`)
  // RACING: what its rules make heard, and its two ends
  const racing = new Set(GAME_SOUNDS.racing.sounds)
  const s = createRacing('landscape', 1, 1)
  const heard = new Set<string>()
  for (let i = 0; i < 200 * 60 && s.phase !== 'over'; i += 1) { stepRacing(s, i % 400 < 200 ? 1 : -1, true, false); s.heard.forEach((h) => heard.add(h)) }
  for (const name of [...heard, 'over', 'winner']) assert.ok(racing.has(name as never), `RACING : ${name}`)
})

test('les règles font entendre ce qui arrive : le burger avalé, le choc', () => {
  const s = createEater('landscape', 1, 7)
  const head = s.body[0]
  s.food = { x: head.x + 1, y: head.y }
  const heard: string[] = []
  for (let i = 0; i < 120 && !heard.includes('bite'); i += 1) { stepEater(s); heard.push(...s.heard) }
  assert.ok(heard.includes('bite'), 'le burger avalé')
  // straight on into the wall: the crash
  for (let i = 0; i < 4000 && s.phase === 'play'; i += 1) { s.food = null; s.bonus = null; stepEater(s); heard.push(...s.heard) }
  assert.equal(s.phase, 'over')
  assert.equal(heard.at(-1), 'crash')
})

test('CATCHER fait entendre chaque article pris, et chaque fois qu\'on l\'attrape', () => {
  const s = createCatcher('landscape', 1, 3)
  const items = s.items.length
  let picked = 0, caught = 0
  for (let i = 0; i < 60 * 240 && s.phase !== 'clear' && s.phase !== 'over'; i += 1) {
    stepCatcher(s, catcherRobot(s))
    picked += s.heard.filter((h) => h === 'item').length
    caught += s.heard.filter((h) => h === 'caught').length
  }
  assert.equal(picked, items - s.items.length, 'un son par article pris')
  assert.equal(caught, 3 - s.lives, 'un son par vie perdue')
})
