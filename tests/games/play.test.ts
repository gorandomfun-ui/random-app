import test from 'node:test'
import assert from 'node:assert/strict'

import { createCatcher, stepCatcher } from '@/lib/games/catcher'
import { createEater } from '@/lib/games/eater'
import { dpadGeometry, gameOverHits, pauseHits, playSize, renderCatcherGame, renderEaterGame, renderGameOver, type Hit } from '@/lib/games/screens'

const A = '#D90845'
const centre = (h: Hit) => [Math.round(h.x + h.w / 2), Math.round(h.y + h.h / 2)] as const
const snapshot = (b: { data: Uint8ClampedArray }) => new Uint8ClampedArray(b.data)

test('les écrans en jeu : dessinés depuis une vraie partie, à la taille du plateau, en paysage et en portrait', () => {
  for (const layout of ['landscape', 'portrait'] as const) {
    const c = createCatcher(layout, 1, 3)
    for (let i = 0; i < 300; i += 1) stepCatcher(c)
    const b = renderCatcherGame(c, A)
    assert.deepEqual([b.width, b.height], [playSize(layout).width, playSize(layout).height])
    const e = renderEaterGame(createEater(layout, 4, 3), A)
    assert.deepEqual([e.width, e.height], [playSize(layout).width, playSize(layout).height])
  }
})

test('les zones tactiles tombent sur ce qui est dessiné : pause, RESUME / QUIT, YES / NO, la croix', () => {
  for (const layout of ['landscape', 'portrait'] as const) {
    const s = createCatcher(layout, 1, 3)
    const plain = snapshot(renderCatcherGame(s, A))
    const resumeLit = snapshot(renderCatcherGame(s, A, { pause: 0 }))
    const quitLit = snapshot(renderCatcherGame(s, A, { pause: 1 }))
    const { width } = playSize(layout)
    const at = (data: Uint8ClampedArray, [x, y]: readonly [number, number]) => Array.from(data.slice((y * width + x) * 4, (y * width + x) * 4 + 3)).join()
    const hits = pauseHits(layout)
    // choosing lights the button under the zone: its look changes with the choice
    assert.notEqual(at(resumeLit, centre(hits.resume)), at(quitLit, centre(hits.resume)), `${layout} : RESUME`)
    assert.notEqual(at(resumeLit, centre(hits.quit)), at(quitLit, centre(hits.quit)), `${layout} : QUIT`)
    assert.notEqual(at(plain, centre(hits.resume)), at(resumeLit, centre(hits.resume)), 'la carte pause couvre le plateau')
    // the pause button sits in its zone, top right of the HUD
    assert.ok(hits.pause.x + hits.pause.w >= width - 6 && hits.pause.x <= width - 22)
    const yes = renderGameOver('catcher', layout, A, { choice: 0 }), no = renderGameOver('catcher', layout, A, { choice: 1 })
    const w = yes.width
    const over = (b: { data: Uint8ClampedArray }, [x, y]: readonly [number, number]) => Array.from(b.data.slice((y * w + x) * 4, (y * w + x) * 4 + 3)).join()
    const oh = gameOverHits(layout)
    assert.notEqual(over(yes, centre(oh.yes)), over(no, centre(oh.yes)), `${layout} : YES`)
    assert.notEqual(over(yes, centre(oh.no)), over(no, centre(oh.no)), `${layout} : NO`)
  }
  assert.equal(dpadGeometry('landscape'), null, 'pas de croix en paysage : le clavier ou le doigt qui glisse')
  const pad = dpadGeometry('portrait')!
  const b = renderEaterGame(createEater('portrait', 1, 1), A)
  const px = (x: number, y: number) => Array.from(b.data.slice((y * b.width + x) * 4, (y * b.width + x) * 4 + 3)).join()
  assert.notEqual(px(pad.cx - pad.arm, pad.cy), px(pad.cx - pad.arm * 3, pad.cy), 'le bras gauche de la croix est là où on tape')
})
