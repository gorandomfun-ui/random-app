import test from 'node:test'
import assert from 'node:assert/strict'

import { accepted, countVisual, dueGame, FLOW, freshFlow, levelLost, levelWon, loadFlow, offered, refused, type FlowMoment, type FlowState } from '@/lib/games/flow'
import { beats, positionAt } from '@/lib/v3/cool/score'

/** A moment at a good place: a rest, well inside it, long after the visit began. */
const calm = (now = 10_000_000): FlowMoment => ({ now, sessionStartedAt: 0, inWave: false, justLiked: false, position: { rest: true, index: 5, untilCool: 20 } })
const seeTo = (s: FlowState, count: number) => { let out = s; while (out.count < count) out = countVisual(out); return out }

test('la position dans la partition : la même que le rythme, les plages de repos reconnues, rien d_écrit', () => {
  for (const seed of [1, 99, 123456]) {
    const b = beats(seed, 300)
    for (let i = 0; i < 300; i += 1) {
      const p = positionAt(seed, i)
      assert.equal(p.beat, b[i], `graine ${seed}, visuel ${i}`)
      if (p.rest) assert.ok(p.length >= 30 && p.beat === 'random')
      if (p.beat === 'cool') assert.equal(p.untilCool, 0)
    }
  }
  // the opening and the switch-over have no rest; the first rest comes right after them
  const first = Array.from({ length: 300 }, (_, i) => positionAt(7, i)).findIndex((p) => p.rest)
  assert.ok(first >= 10 + 2 + 6 + 2 + 4 + 2 + 1 + 3 + 1 + 6 + 1 + 10, 'pas de repos avant la fin de la bascule')
})

test('l_échelle des propositions : 30, puis l_autre jeu à 60, 100, 160, 300, 600, puis plus rien', () => {
  let s = freshFlow()
  const offers: Array<[number, string]> = []
  for (let i = 0; i < 2000 && !s.stopped; i += 1) {
    s = countVisual(s)
    const game = dueGame(s, calm(1e7 + i * 61_000))
    if (game) { offers.push([s.count, game]); s = refused(offered(s, 1e7 + i * 61_000)) }
  }
  assert.deepEqual(offers.map(([n]) => n), [30, 60, 100, 160, 300, 600])
  assert.deepEqual(offers.map(([, g]) => g), ['catcher', 'eater', 'catcher', 'eater', 'catcher', 'eater'], 'un jeu différent à chaque fois')
  assert.ok(s.stopped)
})

test('une première proposition attend une plage de repos, jamais la première minute, une Wave, juste après un like', () => {
  const s = seeTo(freshFlow(), 30)
  assert.equal(dueGame(s, calm()), 'catcher')
  assert.equal(dueGame(s, { ...calm(), position: { rest: false, index: 5, untilCool: 20 } }), null, 'hors repos')
  assert.equal(dueGame(s, { ...calm(), position: { rest: true, index: 1, untilCool: 20 } }), null, 'le 2e du repos')
  assert.equal(dueGame(s, { ...calm(), position: { rest: true, index: 30, untilCool: 2 } }), null, 'deux avant un cool')
  assert.equal(dueGame(s, { ...calm(), sessionStartedAt: calm().now - 30_000 }), null, 'la première minute')
  assert.equal(dueGame(s, { ...calm(), inWave: true }), null, 'une Wave')
  assert.equal(dueGame(s, { ...calm(), justLiked: true }), null, 'après un like')
  assert.equal(dueGame(seeTo(freshFlow(), 29), calm()), null, 'avant 30')
  assert.equal(dueGame({ ...s, lastOfferAt: calm().now - 30_000 }, calm()), null, 'jamais deux dans la même minute')
})

test('quelqu_un qui joue : le niveau suivant revient 10 visuels après, 20 après une défaite, même en plein bloc cool — jamais dans une Wave', () => {
  let s = seeTo(freshFlow(), 30)
  const took = accepted(offered(s, 1), 'catcher')
  assert.deepEqual(took.run, { level: 1, score: 0 })
  s = levelWon(took.state, 'catcher', 420)
  assert.equal(s.runs.catcher?.level, 2); assert.equal(s.runs.catcher?.score, 420)
  const cool: FlowMoment = { ...calm(), position: { rest: false, index: 0, untilCool: 0 }, justLiked: true, sessionStartedAt: calm().now - 1000 }
  assert.equal(dueGame(seeTo(s, 30 + FLOW.afterWin - 1), cool), null)
  assert.equal(dueGame(seeTo(s, 30 + FLOW.afterWin), cool), 'catcher', 'le jeu passe avant le rythme')
  assert.equal(dueGame(seeTo(s, 30 + FLOW.afterWin), { ...cool, inWave: true }), null)
  s = levelLost(seeTo(s, 40), 'catcher')
  assert.equal(s.nextAt, 40 + FLOW.afterLoss)
  assert.equal(s.runs.catcher?.level, 2, 'le même niveau revient')
  // refused mid-way: back on the ladder, the other game next, the game kept for later
  s = refused(seeTo(s, 60))
  assert.equal(s.playing, null); assert.equal(s.next, 'eater'); assert.equal(s.nextAt, 60 + FLOW.ladder[0])
  assert.equal(accepted(s, 'catcher').run.level, 2)
  // the sixteenth level won: the game is over and won, the other one comes next time
  const done = levelWon({ ...s, runs: { catcher: { level: 16, score: 9000 } } }, 'catcher', 9500)
  assert.equal(done.runs.catcher, undefined); assert.equal(done.next, 'eater'); assert.equal(done.playing, null)
})

test('sans stockage (navigation privée) : pas d_état, pas de jeu, aucune erreur', () => {
  ;(globalThis as { window?: unknown }).window = { get localStorage(): Storage { throw new Error('private') } }
  assert.equal(loadFlow(), null)
  const store = new Map<string, string>()
  ;(globalThis as { window?: unknown }).window = { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) } } }
  const s = loadFlow()!
  assert.equal(s.count, 0)
  assert.ok(store.has('random_games_v1'), 'gardé sur l_appareil, d_une visite à l_autre')
  delete (globalThis as { window?: unknown }).window
})

test('les scores du monde : un plafond tiré des règles, un ticket signé, des noms propres', async () => {
  const { maxScore, plausible, minPlayMs } = await import('@/lib/games/plausible')
  const { issueTicket, checkTicket } = await import('@/lib/games/ticket')
  const { worldName } = await import('@/lib/games/names')
  for (const game of ['catcher', 'eater'] as const) {
    for (let l = 2; l <= 16; l += 1) assert.ok(maxScore(game, l) > maxScore(game, l - 1))
    assert.ok(plausible(game, 1000, 3, false, minPlayMs(3)))
    assert.ok(!plausible(game, maxScore(game, 3) + 1, 3, false, 1e9), 'au-dessus du plafond')
    assert.ok(!plausible(game, 100, 9, false, 5000), 'huit niveaux en cinq secondes')
    assert.ok(!plausible(game, 100, 8, true, 1e9), 'gagné sans le seizième')
    assert.ok(!plausible(game, 10.5, 2, false, 1e9) && !plausible(game, -5, 2, false, 1e9))
  }
  // an EATER game the robot really won stays under the ceiling
  assert.ok(maxScore('eater', 16) > 7700 && maxScore('catcher', 16) > 12000)
  process.env.GAMES_SCORE_SECRET = 'test-secret'
  const t = issueTicket('catcher', 1_000_000)!
  assert.ok(checkTicket('catcher', t.runId, t.token, t.startedAt, 1_000_500))
  assert.ok(!checkTicket('eater', t.runId, t.token, t.startedAt, 1_000_500), 'un ticket de CATCHER ne vaut pas pour EATER')
  assert.ok(!checkTicket('catcher', t.runId, t.token, t.startedAt - 1, 1_000_500), 'une partie qui prétend avoir commencé plus tôt')
  assert.ok(!checkTicket('catcher', t.runId, t.token, t.startedAt, 1_000_000 + 91 * 86_400_000), 'trop vieux')
  delete process.env.GAMES_SCORE_SECRET
  assert.equal(worldName('yann'), 'YANN')
  assert.equal(worldName('fuck you'), 'PLAYER')
  assert.equal(worldName('s4l0pe'), 'PLAYER')
  assert.equal(worldName('<b>'), 'B')
  assert.equal(worldName(''), 'PLAYER')
  assert.equal(worldName('computer'), 'COMPUTER'); assert.equal(worldName('unique'), 'UNIQUE'); assert.equal(worldName('grape'), 'GRAPE')
  assert.equal(worldName('la pute'), 'PLAYER'); assert.equal(worldName('p.d'), 'P.D')
})

test('une partie jouée en plusieurs fois garde une seule ligne dans le top 10 de l_appareil, qui ne fait que monter', async () => {
  const { addScore, topScores } = await import('@/lib/games/scores')
  const store = new Map<string, string>()
  ;(globalThis as { window?: unknown }).window = { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) } } }
  addScore('eater', { name: 'ana', score: 100, level: 1, runId: 'r1' })
  addScore('eater', { name: 'ana', score: 380, level: 2, runId: 'r1' })
  addScore('eater', { name: 'ana', score: 200, level: 2, runId: 'r1' })
  addScore('eater', { name: 'bob', score: 250, level: 2 })
  const top = topScores('eater')
  assert.deepEqual(top.map((e) => [e.name, e.score]), [['ANA', 380], ['BOB', 250]])
  delete (globalThis as { window?: unknown }).window
})
