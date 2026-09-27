// The games take no draw: the real Random page, built twice — games off, then
// games on with a game due — plays the same visits, and the draws it asks for
// and the contents it shows must be the same, one by one. A game comes up
// between two contents; after it, the content that was due shows.
//
//   node tests/games/flow.lifecycle.mjs
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const require = createRequire(pathToFileURL(path.join(root, 'package.json')))
const temporary = fs.mkdtempSync(path.join(root, '.games-flow-test-'))

async function bundle(games) {
  const output = path.join(temporary, `component-${games}.cjs`)
  await build({
    entryPoints: [`${root}/app/random/RandomExperience.tsx`], outfile: output, bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime'], tsconfig: `${root}/tsconfig.json`,
    define: { 'process.env.NEXT_PUBLIC_GAMES_ENABLED': JSON.stringify(games) },
    plugins: [{ name: 'boundaries', setup(b) {
      b.onResolve({ filter: /^(next\/|@\/components\/|@\/providers\/|@\/utils\/sound$)/ }, (args) => ({ path: args.path, namespace: 'stubs' }))
      b.onLoad({ filter: /.*/, namespace: 'stubs' }, ({ path: p }) => {
        if (p.includes('I18nProvider')) return { contents: `export const useI18n=()=>({dict:{},locale:'en',locales:['en'],setLocale:()=>{},t:(key,fallback)=>fallback||key})` }
        if (p.includes('ScoreProvider')) return { contents: `export const useScore=()=>({addAction:()=>{},addPoints:()=>{},maybeSpawnDiamond:()=>{},quizScore:0,score:0,points:0})` }
        if (p.includes('CookieConsent')) return { contents: `export const useCookieConsent=()=>({consent:null})` }
        if (p.includes('/Encourage3DOverlay')) return { contents: `import React from 'react'; export const preloadEncourage3DEvent=async()=>{};export default function Overlay(p){React.useEffect(()=>{p.onComplete()},[p.onComplete]);return null}` }
        if (p === 'next/dynamic') return { contents: `import React from 'react';export default loader=>function Dynamic(p){const [C,setC]=React.useState(null);React.useEffect(()=>{let a=true;loader().then(m=>{if(a)setC(()=>m.default)});return()=>{a=false}},[]);return C?React.createElement(C,p):null}` }
        if (p.includes('/utils/sound')) return { contents: `export const playAgain=()=>{},playRandom=()=>{},playWaveEnter=()=>{},playWaveStep=()=>{},setMuted=()=>{},soundStatus=()=>'off',wakeSound=()=>{}` }
        if (p.includes('RandomContentRenderer')) return { contents: `import React from 'react'; export const FactQuizCard=()=>React.createElement('div',null,'Quiz')` }
        // the game's stage: a marker the test can see; its own play is tested elsewhere
        if (p.includes('ArcadeStage')) return { contents: `import React from 'react'; export default function Stage(p){return React.createElement('div',{'data-arcade-stage':p.game})}` }
        return { contents: `import React from 'react'; export default function Stub(p){return React.createElement('span',{className:p.className},p.children||p.label||p.text||null)}` }
      })
    } }],
  })
  return output
}

const profileOutput = path.join(temporary, 'profile.cjs')
await build({ entryPoints: [`${root}/lib/discovery/profile.ts`], outfile: profileOutput, bundle: true, platform: 'node', format: 'cjs' })
const { buildProfile } = require(profileOutput)

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://test.invalid/random', pretendToBeVisual: true })
for (const name of ['window', 'document', 'navigator', 'sessionStorage', 'localStorage', 'history', 'CustomEvent', 'StorageEvent', 'Event', 'Image']) Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true })
window.scrollTo = () => {}
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window)
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window)

let serial = 0
let calls = []
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input), 'https://test.invalid')
  if (url.pathname === '/api/discovery/random') {
    const req = JSON.parse(init.body); calls.push(req); const n = ++serial
    const profile = buildProfile({ title: 'Stone carving workshop' })
    const payload = { type: req.type, _id: n.toString(16).padStart(24, '0'), url: `https://example.invalid/${n}`, provider: 'youtube', text: `Fixture ${n}`, title: `Fixture ${n}`, variant: req.factVariant === 'quiz' ? 'quiz' : 'text', question: 'Question', options: ['a', 'b'], correctIndex: 0 }
    return Response.json({ candidate: { key: `fixture:${n}`, type: req.type, payload, profile, provider: 'youtube', stock: false, available: true } })
  }
  if (url.pathname === '/api/discovery/wave') return Response.json({ ready: false, trio: [], reserves: [] })
  return Response.json({ ok: true })
}

const until = async (fn, what = 'condition') => { const end = Date.now() + 15000; while (Date.now() < end) { if (fn()) return; await new Promise((r) => setTimeout(r, 30)) } throw new Error(`UI ${what} timeout`) }
const snapshot = () => { const raw = sessionStorage.getItem('random-discovery-v2-en'); return raw ? JSON.parse(raw) : null }
const randomButton = () => [...document.querySelectorAll('button')].find((x) => /random again/i.test(x.textContent))

/** One visit: `clicks` presses on RANDOM; each press shows the next content, or brings a game up (then the next press leaves it). */
async function visit(component, clicks, flow) {
  // the page left before may still be saving its session: let it finish, then start from nothing
  await new Promise((r) => setTimeout(r, 1500))
  serial = 0; calls = []
  sessionStorage.clear(); localStorage.clear()
  // the same chance at the start of every visit: the page's own random is what picks the format cycles
  let seed = 20260927
  Math.random = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 0x100000000 }
  if (flow) localStorage.setItem('random_games_v1', JSON.stringify(flow))
  const { RandomExperience } = require(component)
  const app = createRoot(document.getElementById('root'))
  app.render(React.createElement(RandomExperience, { discoveryMode: true, waveDiscoveryMode: true }))
  const shown = []
  let games = 0
  try {
    await until(() => snapshot()?.discovery?.displayed >= 1, 'first content')
    shown.push(snapshot().currentItem?.text)
    if (process.env.TRACE && flow) console.log('first', snapshot().currentItem?.text, snapshot().currentItem?.type, 'calls', calls.length)
    for (let i = 0; i < clicks; i += 1) {
      const before = snapshot().discovery.displayed
      const button = randomButton()
      await until(() => button && !button.disabled, 'RANDOM ready')
      button.click()
      await until(() => snapshot().discovery.displayed > before || document.querySelector('[data-arcade-stage]'), `next content or a game (${flow ? 'on' : 'off'} click ${i} displayed ${before} item ${snapshot().currentItem?.type})`)
      if (document.querySelector('[data-arcade-stage]')) {
        games += 1
        // the game is up: nothing new shown, nothing counted; RANDOM leaves it
        if (snapshot().discovery.displayed !== before) throw new Error('A game consumed a draw')
        const leave = randomButton()
        await until(() => leave && !leave.disabled, 'RANDOM under the game')
        leave.click()
        await until(() => snapshot().discovery.displayed > before, 'the content that waited')
      }
      shown.push(snapshot().currentItem?.text)
      if (process.env.TRACE && flow) console.log('click', i, 'shown', snapshot().currentItem?.text, 'type', snapshot().currentItem?.type, 'displayed', snapshot().discovery.displayed, 'calls', calls.length, 'count', JSON.parse(localStorage.getItem('random_games_v1')||'{}').count, 'stage', Boolean(document.querySelector('[data-arcade-stage]')))
    }
    // each draw asked: its place in the rhythm, its number, its revision. Not its format: the format cycle is drawn
    // from the page's Math.random, which the visual effects share on their own timing — two visits without any game
    // already differ there (TWICE=1 shows it)
    return { shown, draws: calls.map((c) => JSON.stringify({ beat: c.session.beat, displayed: c.session.displayed, revision: c.session.revision, visuals: c.session.visuals })), games }
  } finally { app.unmount() }
}

try {
  const off = await bundle('0'), on = await bundle('1')
  const clicks = 24
  const plain = await visit(off, clicks, null)
  if (process.env.TWICE) {
    const again = await visit(off, clicks, null)
    const at = plain.draws.findIndex((d, i) => d !== again.draws[i])
    console.log(JSON.stringify({ offTwiceSameContents: plain.shown.join() === again.shown.join(), offTwiceSameDraws: at < 0 }))
  }
  // games on, someone playing through: a game due at the 3rd visual; left, the ladder brings the other one 30 on — not within this visit
  const flow = { v: 1, count: 0, nextAt: 3, refusals: 0, stopped: false, next: 'catcher', playing: 'catcher', lastOfferAt: 0, runs: { catcher: { level: 2, score: 300 } } }
  const played = await visit(on, clicks, flow)
  // games on but nothing due: the page must behave as with games off
  const idle = await visit(on, clicks, { ...flow, nextAt: 10_000, playing: null })
  if (played.games < 1) throw new Error('No game came up')
  const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])
  if (!same(plain.shown, played.shown)) throw new Error(`Contents differ with a game in between:\n${plain.shown.join(',')}\n${played.shown.join(',')}`)
  if (!same(plain.draws, played.draws)) {
    const at = plain.draws.findIndex((d, i) => d !== played.draws[i])
    throw new Error(`Draws asked differ with a game in between, from draw ${at} of ${plain.draws.length}/${played.draws.length}:\n${plain.draws.slice(at, at + 3).join('\n')}\n---\n${played.draws.slice(at, at + 3).join('\n')}`)
  }
  if (!same(plain.shown, idle.shown) || !same(plain.draws, idle.draws)) throw new Error('Games on but idle changed the flow')
  const stored = JSON.parse(localStorage.getItem('random_games_v1') || '{}')
  console.log(JSON.stringify({ passed: true, clicks, contents: plain.shown.length, draws: plain.draws.length, gamesInBetween: played.games, identical: true, visualsCounted: stored.count }))
} finally {
  dom.window.close()
  fs.rmSync(temporary, { recursive: true, force: true })
}
