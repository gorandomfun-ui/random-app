import assert from 'node:assert/strict'
import test from 'node:test'

import { LEGEND_MIN_SIZE, LEGEND_SIZE, aloneOnSecondLine, joinLastWords, keepSignsAttached, sizeForOneLine } from '../../lib/random/legend'

test('a sign after a word stays with it', () => {
  // The owner's Tesla, 21 October: its "?" went down alone.
  assert.equal(keepSignsAttached('Pourquoi cette TESLA reste bloquée ?'), 'Pourquoi cette TESLA reste bloquée\u00A0?')
  assert.equal(keepSignsAttached('« Bonjour »'), '«\u00A0Bonjour\u00A0»')
  assert.equal(keepSignsAttached('Réduction de 50 % !'), 'Réduction de 50\u00A0%\u00A0!')
  assert.equal(keepSignsAttached('Titre  : sous-titre'), 'Titre\u00A0: sous-titre')
})

test('English titles and signs already attached do not change', () => {
  assert.equal(keepSignsAttached('Title: Subtitle'), 'Title: Subtitle')
  assert.equal(keepSignsAttached('Why?! Really'), 'Why?! Really')
  assert.equal(keepSignsAttached('从零手把手教你（第二期）'), '从零手把手教你（第二期）')
})

test('one word, one sign or one character alone on the second line', () => {
  assert.equal(aloneOnSecondLine('BLOQUÉE\u00A0?'), true)
  assert.equal(aloneOnSecondLine(' ? '), true)
  assert.equal(aloneOnSecondLine('第二期）'), true)
  assert.equal(aloneOnSecondLine('DE LA'), false)
  assert.equal(aloneOnSecondLine(''), false)
})

test('a title shrinks a little to hold on one line, never below the smallest size', () => {
  assert.equal(sizeForOneLine(380, 300), LEGEND_SIZE)
  const size = sizeForOneLine(380, 392)
  assert.ok(size !== null && size < LEGEND_SIZE && size >= LEGEND_MIN_SIZE)
  // what it holds at that size fits the line
  assert.ok(size !== null && (392 * size) / LEGEND_SIZE <= 380)
  // a long title keeps its two lines
  assert.equal(sizeForOneLine(380, 500), null)
  assert.equal(sizeForOneLine(0, 300), null)
})

test("a long title's last word takes the one before it down", () => {
  // Seen on the site, 21 October: "MINECRAFT" alone under "WE PRANKED THE STRICTEST TEACHER IN".
  assert.equal(joinLastWords('We Pranked the STRICTEST TEACHER in Minecraft'), 'We Pranked the STRICTEST TEACHER in\u00A0Minecraft')
  assert.equal(joinLastWords('Mario Kart 8 Deluxe ~ First Online Match/Win '), 'Mario Kart 8 Deluxe ~ First Online\u00A0Match/Win')
  // two words: joined, they would be the whole title
  assert.equal(joinLastWords('Hello world'), null)
  assert.equal(joinLastWords('Colombia'), null)
})
