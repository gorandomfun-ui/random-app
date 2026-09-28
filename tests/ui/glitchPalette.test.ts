import test from 'node:test'
import assert from 'node:assert/strict'

import { TEXT_COLORS, glitchInkVars } from '../../lib/theme'

/**
 * The glitch takes its colours from the theme of the random on screen. The CSS reads them as
 * rgba(var(--glitch-ink), a), so each must be a bare "r, g, b" triplet, whatever the theme.
 */

const TRIPLET = /^\d{1,3}, \d{1,3}, \d{1,3}$/

test('every theme gives four readable triplets', () => {
  for (const text of TEXT_COLORS) {
    const vars = glitchInkVars(text)
    for (const [name, value] of Object.entries(vars)) {
      assert.match(value, TRIPLET, `${text} ${name}`)
      for (const channel of value.split(', ').map(Number)) assert.ok(channel >= 0 && channel <= 255)
    }
  }
})

test('the ink is the theme colour, the light shade leans to the cream, the deep one to black', () => {
  const vars = glitchInkVars('#D90845')
  assert.equal(vars['--glitch-ink'], '217, 8, 69')
  assert.equal(vars['--glitch-cream'], '248, 245, 230')
  const [lr, lg, lb] = vars['--glitch-ink-light'].split(', ').map(Number)
  const [dr, dg, db] = vars['--glitch-ink-deep'].split(', ').map(Number)
  assert.ok(lr > 217 && lg > 8 && lb > 69)
  assert.ok(dr < 217 && dg <= 8 && db < 69)
})

test('a colour it cannot read falls back to the cream rather than breaking the page', () => {
  const vars = glitchInkVars('not-a-colour')
  assert.equal(vars['--glitch-ink'], '248, 245, 230')
  assert.equal(glitchInkVars('#fff')['--glitch-ink'], '255, 255, 255')
})
