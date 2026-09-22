import test from 'node:test'
import assert from 'node:assert/strict'

import { DEFAULT_SCORE, DEFAULT_SCORE_TEXT, beatAt, beats, coolScore, parseScore, type Beat } from '@/lib/v3/cool/score'
import { commitDraw, newSession, planDraw, restartRhythm, type Session } from '@/lib/discovery/pool'
import { buildProfile } from '@/lib/discovery/profile'
import type { Candidate, Format } from '@/lib/discovery/types'

type Run = { beat: Beat; length: number }
const runs = (sequence: Beat[]): Run[] => sequence.reduce<Run[]>((acc, beat) => {
  const last = acc[acc.length - 1]
  if (last?.beat === beat) last.length += 1
  else acc.push({ beat, length: 1 })
  return acc
}, [])
const C = (length: number): Run => ({ beat: 'cool', length })
const R = (length: number): Run => ({ beat: 'random', length })

const item = (key: string, type: Format): Candidate<string> => ({
  key, type, provider: 'youtube', profile: buildProfile({ title: `contenu ${key}` }), payload: key, stock: false, available: true,
})

test('la partition par défaut s_écrit dans sa notation, et la notation la redonne', () => {
  assert.deepEqual(parseScore(DEFAULT_SCORE_TEXT), DEFAULT_SCORE)
  assert.deepEqual(coolScore(''), DEFAULT_SCORE)
  assert.deepEqual(coolScore(undefined), DEFAULT_SCORE)
  assert.deepEqual(coolScore('C3 X2'), DEFAULT_SCORE, 'un réglage illisible laisse la partition par défaut')
  assert.deepEqual(parseScore('C3 R1 | C1 R1'), { intro: [{ beat: 'cool', min: 3, max: 3 }, { beat: 'random', min: 1, max: 1 }], loop: [{ beat: 'cool', min: 1, max: 1 }, { beat: 'random', min: 1, max: 1 }] })
  assert.deepEqual(parseScore('c2 r2-4'), { intro: [], loop: [{ beat: 'cool', min: 2, max: 2 }, { beat: 'random', min: 2, max: 4 }] }, 'sans barre, tout se répète')
  assert.equal(parseScore('R0'), null)
  assert.equal(parseScore('R5-3'), null)
  assert.equal(parseScore('C1 | R1 | C1'), null)
  assert.equal(parseScore('C1 |'), null, 'une boucle vide ne tourne pas')
})

test('sur 600 visuels, les cool tombent exactement où la partition les met, et les blocs 30-40 restent dans leurs bornes', () => {
  const releases = new Set<number>()
  for (let seed = 1; seed <= 50; seed += 1) {
    const sequence = beats(seed, 600)
    assert.ok(sequence.slice(0, 10).every((beat) => beat === 'cool'), 'les dix premiers visuels sont cool')
    const r = runs(sequence)
    // Accroche puis bascule, au visuel près.
    assert.deepEqual(r.slice(0, 11), [C(10), R(2), C(6), R(2), C(4), R(2), C(1), R(3), C(1), R(6), C(1)], `graine ${seed}`)
    // R10 de la bascule puis le lâcher de 30 à 40 : un seul bloc de hasard, de 40 à 50.
    assert.equal(r[11].beat, 'random')
    assert.ok(r[11].length >= 40 && r[11].length <= 50, `lâcher ${r[11].length}`)
    releases.add(r[11].length - 10)
    // Croisière, répétée : C6 R2 C3 R2 C1, puis R2 et R30-40 en un bloc de 32 à 42.
    let index = 12
    let cruises = 0
    while (index + 6 < r.length) {
      const group = r.slice(index, index + 6)
      assert.deepEqual(group.slice(0, 5), [C(6), R(2), C(3), R(2), C(1)], `graine ${seed}, croisière ${cruises + 1}`)
      assert.equal(group[5].beat, 'random')
      assert.ok(group[5].length >= 32 && group[5].length <= 42, `hasard de croisière ${group[5].length}`)
      index += 6
      cruises += 1
    }
    assert.ok(cruises >= 8, `${cruises} croisières complètes en 600 visuels`)
  }
  assert.ok(releases.size > 1, 'la longueur du lâcher change avec la graine')
  assert.deepEqual(beats(7, 300), beats(7, 300), 'la même graine relit la même partition')
  assert.equal(beatAt(7, -3), beatAt(7, 0))
})

test('les textes ne décalent pas la partition : seuls les visuels avancent la position', () => {
  let state: Session = newSession(5)
  const seen: Beat[] = []
  for (let index = 0; index < 200; index += 1) {
    const type: Format = index % 3 === 2 ? (index % 2 ? 'quote' : 'fact') : index % 2 ? 'image' : 'video'
    const ticket = planDraw(state, type)
    if (type === 'quote' || type === 'fact') assert.equal(ticket.mode, 'random', 'un texte n_est jamais cool')
    else seen.push(ticket.mode)
    state = commitDraw(state, ticket, item(`k${index}`, type))
  }
  assert.equal(seen.length, 134)
  assert.deepEqual(seen, beats(5, seen.length))
  assert.equal(state.beat, seen.length)
  assert.equal(state.visuals, seen.length)
})

test('le rythme repart à l_accroche, les contenus vus restent exclus, un ticket d_avant est refusé', () => {
  let state: Session = newSession(9)
  for (let index = 0; index < 31; index += 1) state = commitDraw(state, planDraw(state, 'video'), item(`v${index}`, 'video'))
  assert.equal(state.beat, 31)
  assert.equal(planDraw(state, 'video').mode, 'random', 'au trente-deuxième visuel, la bascule est dans ses six randoms')
  const stale = planDraw(state, 'video')
  const restarted = restartRhythm(state)
  assert.equal(restarted.beat, 0)
  assert.equal(restarted.visuals, 31)
  assert.equal(restarted.recent.length, 31, 'ce qui a été vu reste exclu')
  assert.equal(planDraw(restarted, 'video').mode, 'cool')
  assert.throws(() => commitDraw(restarted, stale, item('v99', 'video')), /Stale/)
  assert.throws(() => commitDraw(restarted, planDraw(restarted, 'video'), item('v3', 'video')), /Stale/, 'un contenu vu avant le redémarrage ne revient pas')
})
