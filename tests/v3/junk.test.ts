import assert from 'node:assert/strict'
import test from 'node:test'

import { junkKind } from '../../lib/ingest/junk'

// Taken from the day's entries on 27 September.
const SCAMS = [
  'Where to Buy Verified Handshake AI Accounts with Full ...',
  'ftklkjf Buy Verified Stripe Accounts Zervon Qulmex-TRT',
  'Buy verified New PayPal account shana delivery,EU,NA,CA',
  '18 Best Platforms for Buying Old Verified Naver Accounts In USA',
  'Best Verified Twilio Accounts to Buy for SMS API and Voice ...',
  'Complete List of Official coinbase CARE PHONE NUMBER HelP Desk™️Contact Numbers',
  '《oOk》 XFINITY® – [U.S. Toll Free Number: A Comprehensive XFINITY installation setup Step-by-Step',
]
const TOPS = [
  'Top 5 Triangle Shawl Scarves For Summer: Top 5 Best Sellers - Floral Printed Lace Scarf Wedding',
  'Amazing Top 5 Electric Noodle Extruders For Fresh Pasta You Need To See - 2026 New Design House',
  'Ultimate Guide to the Best Top 5 Basketball Defender Dummies For Practice - Basketball Defender',
  'Cheap & Best Top 5 Patellar Tendon Support Straps For Athletes Unboxing & Review - 2PCS Patella',
  'Top 5 Manual Dough Sheeters For Home Bakery: Top 5 Best Sellers - Commercial 18cm Manual D',
]
const KEEP = [
  'Top 10 goals of the season',
  'Top 5 weirdest animals on Earth',
  'Funny video 😜 #shortvideo #viral #viralvideo #youtubeshorts #comedy #comedyshorts',
  'Police ask the public to contact them with any information',
  'Customer service sketch - Monty Python',
  'My phone number song (Tommy Tutone 867-5309/Jenny) live 1982',
  'The best top 5 moments of the World Cup final',
]

test('scams are named as such', () => {
  assert.deepEqual(SCAMS.filter((title) => junkKind(title) !== 'scam'), [])
})

test('the product-top farm is named as such', () => {
  assert.deepEqual(TOPS.filter((title) => junkKind(title) !== 'product-top'), [])
})

test('ordinary tops, hashtag shorts, sketches and songs pass', () => {
  assert.deepEqual(KEEP.filter((title) => junkKind(title) !== null).map((title) => `${title} → ${junkKind(title)}`), [])
})
