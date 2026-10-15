/**
 * The promo loops: short films that speak of Random itself, after the owner's
 * three references, built from the site's own things — the wordmark, the brand
 * block, the icons — and from stock pictures under a permissive licence that
 * only ever appear as matter: fragments, bands, cards, a pile. Never a photograph.
 *
 * Nothing stands still and nothing repeats:
 *   the film opens at random — the brand arriving, or no brand at all, or a burst straight away;
 *   in a calm the brand drifts, breathes, enters (sliding, growing, assembling from pieces,
 *   flickering) and leaves (exploding into flying pieces, sliding out, dissolving);
 *   events fall at random on the calm — a fragment flashing, letters filled for a moment, a jump,
 *   a tint, an icon torn by bands, a hairline;
 *   three planes give depth — a back plane of large dark fragments drifting slowly, the brand with
 *   its hard shadow, a front plane of small bright fragments moving fast;
 *   a burst is a few frames, or a held moment, where the frame is corruption made of the picture's
 *   matter and the scene alike — bands, rows, cards, a sweep, the vomit — each with its own origin,
 *   speed, direction, density and thickness drawn for that occurrence and scaled by the force;
 *   the residue keeps what the burst left, fading.
 * Three colours: the main one, and up to two secondaries. Theme tones only: no gradient, no blur.
 * Every number comes from a hash, so a seed gives the same film twice.
 */

import { recorderChoice } from './montage'

const CREAM = '#F8F5E6', DEEP = '#121210'
const SITE = 'GORANDOM.FUN'

const hash = (...n: number[]) => { let h = 2166136261; for (const v of n) { h ^= Math.floor(v * 1000) + 0x9e3779b9; h = Math.imul(h, 16777619) } return ((h >>> 0) % 100000) / 100000 }
function mix(a: string, b: string, t: number): string {
  const p = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16))
  const [x, y] = [p(a), p(b)]
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`
}
const easeOut = (t: number) => 1 - (1 - t) * (1 - t)
const easeIn = (t: number) => t * t

export type BurstKind = 'bands' | 'rows' | 'feed' | 'sweep' | 'vomit'
export const BURSTS: Array<{ key: BurstKind; name: string; hint: string }> = [
  { key: 'bands', name: 'Bandes', hint: 'des bandes de pixels cassés, plus ou moins de l’écran selon la force et le tirage, qui clignotent à leur rythme' },
  { key: 'rows', name: 'Rangées', hint: 'des blocs d’image qui glissent par rangées, les lettres coupées par les mêmes rangées' },
  { key: 'feed', name: 'Défilé', hint: 'de petites vignettes encadrées qui filent, vers le haut ou le bas, la carte de la marque parmi elles' },
  { key: 'sweep', name: 'Balayage', hint: 'une ligne fine qui traverse dans un sens ou l’autre, les colonnes qu’elle touche décalées' },
  { key: 'vomit', name: 'Vomi', hint: 'un amas de fragments qui déborde d’un point et coule — vers le bas, le haut ou le côté, vite ou lentement' },
]
export type BrandMode = 'center' | 'random' | 'deformed' | 'exploded'
export const BRAND_MODES: Array<{ key: BrandMode; name: string; hint: string }> = [
  { key: 'center', name: 'Centre', hint: 'la marque près du centre, qui respire' },
  { key: 'random', name: 'Aléatoire', hint: 'la marque là où le tirage la met, qui dérive, parfois absente' },
  { key: 'deformed', name: 'Déformée', hint: 'étirée, cisaillée, en miroir, fendue, en mouvement' },
  { key: 'exploded', name: 'Éclatée', hint: 'ses morceaux s’écartent et reviennent, et elle explose en partant' },
]

export type PromoText = { value: string; size: number; align: 'left' | 'center' | 'right'; font: string; weight: number; x: number; y: number; width: number }
export type PromoIcon = { image: HTMLImageElement; x: number; y: number; size: number }
export type PromoInput = {
  seconds: number
  intensity: number
  seed: number
  /** The main colour, and up to two secondaries. */
  accent: string
  palette: string[]
  bursts: BurstKind[]
  brandMode: BrandMode
  logo: HTMLImageElement
  logoVertical: HTMLImageElement
  logoDark: HTMLImageElement
  logoVerticalDark: HTMLImageElement
  icons: HTMLImageElement[]
  stock: HTMLImageElement[]
  titleFont: string
  text?: PromoText | null
  icon?: PromoIcon | null
}

type Treatment = 'cream' | 'accent' | 'second' | 'panel' | 'dither' | 'outline' | 'split'
type Deform = 'none' | 'stretch' | 'skew' | 'mirror' | 'split' | 'exploded'
type Enter = 'none' | 'slide' | 'grow' | 'assemble' | 'flicker'
type Exit = 'none' | 'explode' | 'slide' | 'dissolve'
type EventKind = 'fragment' | 'fill' | 'jump' | 'tint' | 'icon' | 'hairline'
export type Event = { at: number; len: number; kind: EventKind; seed: number }
export type State = {
  from: number; to: number; kind: 'calm' | 'burst' | 'residue'; burst: BurstKind; sustained: boolean; picture: number; seed: number
  treat: Treatment; stacked: boolean; pill: boolean; hud: boolean; icon: boolean
  brandOn: boolean; bx: number; by: number; bw: number; deform: Deform
  /** How the brand comes and goes, and where it drifts to over the calm. */
  enter: Enter; exit: Exit; dx: number; dy: number
  events: Event[]
  /** The burst's own parameters, drawn for this occurrence: 0..1 each, scaled by the force where it matters. */
  p: { coverage: number; speed: number; dir: number; density: number; thick: number; flicker: number; ox: number; oy: number }
}

/** The run of states, opened at random, cut in sections with their own tempo; every occurrence with its own parameters. */
export function planStates(input: Pick<PromoInput, 'seconds' | 'intensity' | 'seed' | 'bursts' | 'brandMode'> & { text?: PromoText | null }, pictures: number): State[] {
  const k = Math.min(1, Math.max(0, input.intensity))
  const hasText = Boolean(input.text?.value.trim())
  const bursts = input.bursts.length ? input.bursts : BURSTS.map((b) => b.key)
  const out: State[] = []
  const total = input.seconds * 1000
  const sections = 2 + Math.floor(hash(input.seed, 0) * 2)
  const tempoOf = (at: number) => { const n = Math.min(sections - 1, Math.floor(at / total * sections)); return 0.55 + hash(input.seed, n, 100) * 1.1 }
  const treatments: Treatment[] = ['cream', 'cream', 'accent', 'second', 'panel', 'dither', 'outline', 'split']
  const mode = input.brandMode
  let at = 0, i = 0, picture = 0
  let treat: Treatment = treatments[Math.floor(hash(input.seed, 2) * treatments.length)], stacked = hash(input.seed, 3) < 0.6
  const params = (s: number) => ({ coverage: hash(s, 40), speed: hash(s, 41), dir: hash(s, 42), density: hash(s, 43), thick: hash(s, 44), flicker: hash(s, 45), ox: hash(s, 46), oy: hash(s, 47) })
  const place = (s: number) => {
    let bx = 0.5, by = 0.44, bw = 0.6, deform: Deform = 'none', brandOn = true
    if (mode === 'center') { bx = 0.46 + hash(s, 21) * 0.08; by = 0.38 + hash(s, 22) * 0.12; bw = 0.5 + hash(s, 24) * 0.2 }
    else {
      brandOn = hash(s, 20) > 0.12 || !(hasText || k > 0.5)
      bw = 0.35 + hash(s, 24) * 0.5
      const half = bw * (stacked ? 1 : 1.3) / 2
      if (hash(s, 21) < 0.3) { bx = 0.5; by = 0.44 } else { bx = Math.max(0.03 + half, Math.min(0.97 - half, 0.15 + hash(s, 22) * 0.7)); by = 0.15 + hash(s, 23) * 0.6 }
      if (mode === 'deformed') { const d: Deform[] = ['none', 'stretch', 'skew', 'mirror', 'split']; deform = d[Math.floor(hash(s, 25) * d.length)] }
      else if (mode === 'exploded') deform = 'exploded'
    }
    return { bx, by, bw, deform, brandOn }
  }
  const eventsFor = (s: number, len: number) => {
    const events: Event[] = []
    const n = Math.round(len / 700 * (0.6 + k * 1.6) * (0.5 + hash(s, 50)))
    const kinds: EventKind[] = ['fragment', 'fragment', 'fill', 'jump', 'tint', 'icon', 'hairline']
    for (let e = 0; e < n; e += 1) events.push({ at: hash(s, e, 51) * len * 0.9, len: 60 + hash(s, e, 52) * 180, kind: kinds[Math.floor(hash(s, e, 53) * kinds.length)], seed: s * 3 + e })
    return events
  }
  // The opening, drawn: the brand arriving, nothing but words and field, or a burst straight away.
  const opening = hash(input.seed, 1)
  let first: 'calm' | 'empty' | 'burst' = opening < 0.5 ? 'calm' : opening < 0.75 ? 'empty' : 'burst'
  while (at < total) {
    const s = input.seed * 17 + i * 101
    const tempo = tempoOf(at)
    if (first !== 'burst') {
      if (i > 0 && hash(s, 1) < 0.7) treat = treatments[Math.floor(hash(s, 2) * treatments.length)]
      if (hash(s, 3) < 0.3) stacked = !stacked
      const pl = place(s)
      if (first === 'empty') { pl.brandOn = false; first = 'calm' }
      const longCalm = hash(s, 15) < 0.25
      const calmLen = Math.round((1500 - k * 800) * tempo * (longCalm ? 1.5 + hash(s, 16) : 0.6 + hash(s, 5) * 0.8))
      const enters: Enter[] = ['none', 'slide', 'grow', 'assemble', 'flicker']
      const exits: Exit[] = ['none', 'explode', 'slide', 'dissolve']
      const enter = i === 0 && pl.brandOn ? enters[1 + Math.floor(hash(s, 26) * 4)] : hash(s, 26) < 0.4 ? 'none' : enters[Math.floor(hash(s, 27) * enters.length)]
      const exit = mode === 'exploded' && hash(s, 28) < 0.6 ? 'explode' : hash(s, 28) < 0.45 ? 'none' : exits[Math.floor(hash(s, 29) * exits.length)]
      out.push({ from: at, to: Math.min(total, at + calmLen), kind: 'calm', burst: bursts[0], sustained: false, picture, seed: s, treat, stacked, pill: hash(s, 4) < 0.6, hud: hash(s, 6) < 0.35, icon: false, ...pl, enter, exit, dx: (hash(s, 30) - 0.5) * 0.12, dy: (hash(s, 31) - 0.5) * 0.08, events: eventsFor(s, calmLen), p: params(s) })
      at += calmLen
      if (at >= total) break
    }
    first = 'calm'
    // The burst: a few frames, or one that holds and moves; sometimes two in a row of different kinds. Each with its own parameters.
    const chain = hash(s, 8) < k * 0.4 ? 2 : 1
    const pl = place(s + 5)
    for (let c = 0; c < chain && at < total; c += 1) {
      const burst = bursts[Math.floor(hash(s, 9, c) * bursts.length)]
      const sustained = hash(s, 17, c) < 0.22 + k * 0.25
      const burstLen = Math.round((sustained ? 450 + hash(s, 10, c) * 800 : 80 + hash(s, 10, c) * 200) * (0.8 + tempo * 0.3))
      picture = pictures > 1 ? (picture + 1 + Math.floor(hash(s, 11, c) * (pictures - 1))) % pictures : 0
      out.push({ from: at, to: Math.min(total, at + burstLen), kind: 'burst', burst, sustained, picture, seed: s + 7 + c, treat, stacked, pill: hash(s, 4) < 0.6, hud: false, icon: hash(s, 12, c) < 0.3, ...pl, enter: 'none', exit: 'none', dx: 0, dy: 0, events: [], p: params(s + 7 + c) })
      at += burstLen
    }
    if (at >= total) break
    // The residue: what the burst left, for a moment — sometimes a pause where it stays.
    const pause = hash(s, 18) < 0.3
    const resLen = Math.round((200 + k * 300) * tempo * (pause ? 1.6 + hash(s, 19) : 0.5 + hash(s, 13)))
    out.push({ from: at, to: Math.min(total, at + resLen), kind: 'residue', burst: bursts[Math.floor(hash(s, 9, 0) * bursts.length)], sustained: false, picture, seed: s + 3, treat, stacked, pill: hash(s, 4) < 0.6, hud: hash(s, 14) < 0.5, icon: false, ...pl, enter: 'none', exit: 'none', dx: 0, dy: 0, events: eventsFor(s + 3, resLen), p: params(s + 3) })
    at += resLen; i += 1
  }
  return out
}

/** A crop of a picture drawn to cover a rectangle. */
function cover(ctx: CanvasRenderingContext2D, src: CanvasImageSource, x: number, y: number, w: number, h: number, zoom = 1, fx = 0.5, fy = 0.5) {
  const sw = (src as HTMLImageElement).naturalWidth || (src as HTMLCanvasElement).width || w, sh = (src as HTMLImageElement).naturalHeight || (src as HTMLCanvasElement).height || h
  const scale = Math.max(w / sw, h / sh) * zoom
  const cw = w / scale, ch = h / scale
  ctx.drawImage(src, Math.max(0, Math.min(sw - cw, (sw - cw) * fx)), Math.max(0, Math.min(sh - ch, (sh - ch) * fy)), cw, ch, x, y, w, h)
}

export type Promo = { states: State[]; frame: (ctx: CanvasRenderingContext2D, atMs: number, frameNo: number) => void; stateAt: (atMs: number) => State }

/** The film at one size: its states, and one function drawing any moment of it. The live preview and the recording share it. */
export function createPromo(input: PromoInput, W: number, H: number): Promo {
  const accent = input.accent
  const seconds = input.palette.filter((c) => c && c.toLowerCase() !== accent.toLowerCase())
  const PALETTE = [DEEP, mix(accent, DEEP, 0.55), accent, mix(accent, CREAM, 0.5), CREAM]
  /** A colour for a fragment or a line: mostly the main one and cream, then the secondaries. */
  const colourAt = (q: number) => q < 0.4 ? accent : q < 0.58 ? CREAM : q < 0.66 ? DEEP : seconds.length ? seconds[Math.floor(hash(q * 1000, 200) * seconds.length)] : accent
  const k = Math.min(1, Math.max(0, input.intensity))
  const u = W / 1080
  const px = Math.max(1, Math.round(u))
  const font = input.titleFont
  const states = planStates(input, Math.max(1, input.stock.length))
  const make = (w = W, h = H) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }
  const scene = make(), out = make(), scratch = make(), prev = make(), pile = make()
  const sc = scene.getContext('2d')!, oc = out.getContext('2d')!, sx = scratch.getContext('2d')!, pv = prev.getContext('2d')!, pc = pile.getContext('2d')!
  const dither = (() => { const c = make(4 * px, 4 * px); const g = c.getContext('2d')!; g.fillStyle = DEEP; g.fillRect(0, 0, 2 * px, 2 * px); g.fillRect(2 * px, 2 * px, 2 * px, 2 * px); return c })()
  let pileSeed = -1

  // ----- the picture as matter: posterised into five tones — the main colour's, or a secondary's on one picture in two.
  const matterCache = new Map<number, HTMLCanvasElement>()
  const matterOf = (index: number) => {
    const img = input.stock[index % Math.max(1, input.stock.length)]
    let m = matterCache.get(index)
    if (m || !img) return m ?? null
    m = make(); const g = m.getContext('2d')!
    cover(g, img, 0, 0, W, H)
    const data = g.getImageData(0, 0, W, H), d = data.data
    const second = seconds.length && hash(index, 201) < 0.5 ? seconds[Math.floor(hash(index, 202) * seconds.length)] : null
    const tones = [PALETTE[0], second ? mix(second, DEEP, 0.55) : PALETTE[1], second ?? PALETTE[2], second ? mix(second, CREAM, 0.5) : PALETTE[3], PALETTE[4]].map((c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)))
    for (let p = 0; p < d.length; p += 4) {
      const lum = (d[p] * 0.299 + d[p + 1] * 0.587 + d[p + 2] * 0.114) / 255
      const n = ((p / 4) % 2 + Math.floor(p / 4 / W) % 2) * 0.08
      const t = tones[Math.max(0, Math.min(4, Math.floor((lum + n) * 4.6)))]
      d[p] = t[0]; d[p + 1] = t[1]; d[p + 2] = t[2]
    }
    g.putImageData(data, 0, 0)
    matterCache.set(index, m)
    return m
  }
  const rawOf = (index: number) => input.stock[index % Math.max(1, input.stock.length)] ?? null
  const fragmentSource = (state: State, q: number) => (q < 0.55 ? rawOf(state.picture) : matterOf(state.picture)) ?? matterOf(state.picture) ?? rawOf(state.picture)

  // ----- pieces
  const logoSize = (img: HTMLImageElement, w: number) => ({ w: Math.round(w), h: Math.round(w * img.naturalHeight / Math.max(1, img.naturalWidth)) })
  const tinted = (img: CanvasImageSource, colour: string, w: number, h: number) => {
    sx.clearRect(0, 0, W, H); sx.globalCompositeOperation = 'source-over'; sx.drawImage(img, 0, 0, w, h)
    sx.globalCompositeOperation = 'source-in'; sx.fillStyle = colour; sx.fillRect(0, 0, w, h); sx.globalCompositeOperation = 'source-over'
    return scratch
  }
  const pillAt = (ctx: CanvasRenderingContext2D, cx: number, y: number, alpha = 1) => {
    const w = Math.round(W * 0.5), h = Math.round(H * 0.036), x = Math.round(cx - w / 2), r = h / 2
    ctx.globalAlpha = alpha
    ctx.fillStyle = accent; ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2); ctx.lineTo(x + r, y + h); ctx.arc(x + r, y + r, r, Math.PI / 2, -Math.PI / 2); ctx.closePath(); ctx.fill()
    ctx.fillStyle = CREAM; ctx.font = `700 ${Math.round(h * 0.5)}px ${font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(SITE, cx, y + h / 2)
    ctx.globalAlpha = 1
  }
  const hud = (ctx: CanvasRenderingContext2D, frame: number, at: number) => {
    ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = CREAM; ctx.font = `${Math.round(W * 0.018)}px ${font}`; ctx.textBaseline = 'top'; ctx.textAlign = 'left'
    ctx.fillText(`17:${String(13 + Math.floor(at / 1000)).padStart(2, '0')}  ${String(140 + (frame % 30)).padStart(3, '0')}`, Math.round(W * 0.05), Math.round(H * 0.03))
    for (let i = 0; i < 4; i += 1) ctx.fillRect(Math.round(W * 0.8) + i * 6 * px, Math.round(H * 0.03) + (3 - i) * 3 * px, 3 * px, (i + 1) * 3 * px)
    ctx.textAlign = 'right'; ['F', 'R', 'N'].forEach((l, i) => ctx.fillText(l, Math.round(W * 0.95), Math.round(H * (0.09 + i * 0.022))))
    ctx.fillText(`${String(Math.floor(at / 100) % 100).padStart(2, '0')}:00`, Math.round(W * 0.95), Math.round(H * 0.95))
    ctx.strokeStyle = CREAM; ctx.lineWidth = px
    const m = Math.round(W * 0.05), l = Math.round(W * 0.04)
    for (const [cx, cy, dx, dy] of [[m, Math.round(H * 0.2), 1, 1], [W - m, Math.round(H * 0.2), -1, 1], [m, Math.round(H * 0.8), 1, -1], [W - m, Math.round(H * 0.8), -1, -1]] as const) { ctx.beginPath(); ctx.moveTo(cx, cy + dy * l); ctx.lineTo(cx, cy); ctx.lineTo(cx + dx * l, cy); ctx.stroke() }
    ctx.restore()
  }
  /** Letters as windows: the brand's shape filled with matter, some rectangles of it shown. */
  const lettersFilled = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, matter: HTMLCanvasElement, seed: number, count: number) => {
    sx.clearRect(0, 0, W, H); sx.globalCompositeOperation = 'source-over'; sx.drawImage(img, x, y, w, h)
    sx.globalCompositeOperation = 'source-in'; sx.drawImage(matter, Math.round((hash(seed, 30) - 0.5) * W * 0.5), Math.round((hash(seed, 31) - 0.5) * H * 0.3)); sx.globalCompositeOperation = 'source-over'
    for (let i = 0; i < count; i += 1) { const fw = Math.round(w * (0.2 + hash(seed, i, 32) * 0.45)), fh = Math.round(h * (0.25 + hash(seed, i, 33) * 0.6)); const fx = Math.round(x + hash(seed, i, 34) * (w - fw)), fy = Math.round(y + hash(seed, i, 35) * (h - fh)); ctx.drawImage(scratch, fx, fy, fw, fh, fx, fy, fw, fh) }
  }
  const words = (ctx: CanvasRenderingContext2D) => {
    const t = input.text
    if (!t || !t.value.trim()) return
    const size = Math.round(t.size * u)
    ctx.font = `${t.weight} ${size}px ${t.font}`; ctx.textBaseline = 'top'; ctx.textAlign = t.align
    const maxW = t.width * W
    const lines: string[] = []
    for (const para of t.value.split('\n')) { let line = ''; for (const w of para.split(/\s+/)) { const next = line ? `${line} ${w}` : w; if (ctx.measureText(next).width > maxW && line) { lines.push(line); line = w } else line = next } lines.push(line) }
    const x = Math.round(t.x * W + (t.align === 'center' ? maxW / 2 : t.align === 'right' ? maxW : 0))
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, Math.round(size * 0.14)); ctx.strokeStyle = DEEP
    lines.forEach((line, i) => { const y = Math.round(t.y * H + i * size * 1.1); ctx.strokeText(line, x, y); ctx.fillStyle = CREAM; ctx.fillText(line, x, y) })
  }
  /** A fragment of the picture, raw or matter, sometimes tinted, drawn at a rectangle. */
  const fragment = (ctx: CanvasRenderingContext2D, state: State, seed: number, x: number, y: number, w: number, h: number, alpha = 1) => {
    const src = fragmentSource(state, hash(seed, 36))
    if (!src) return
    ctx.globalAlpha = alpha
    cover(ctx, src, x, y, w, h, 1.2 + hash(seed, 37) * 2.5, hash(seed, 38), hash(seed, 39))
    if (hash(seed, 40) < 0.35) { ctx.fillStyle = colourAt(hash(seed, 41)); ctx.globalAlpha = alpha * (0.35 + hash(seed, 42) * 0.4); ctx.fillRect(x, y, w, h) }
    ctx.globalAlpha = 1
  }

  // ----- the brand: its rectangle for a state at a moment (drifting, breathing), its pieces, its drawing with deformation and motion.
  const brandRect = (state: State, progress: number) => {
    const img = state.stacked ? input.logoVertical : input.logo
    const { w, h } = logoSize(img, W * state.bw * (state.stacked ? 1 : 1.3))
    const breathe = 1 + Math.sin(progress * Math.PI * 2 * (0.5 + hash(state.seed, 60))) * 0.02
    const cx = (state.bx + state.dx * progress) * W, cy = (state.by + state.dy * progress) * H
    return { img, x: Math.round(cx - w * breathe / 2), y: Math.round(cy - h * breathe / 2), w: Math.round(w * breathe), h: Math.round(h * breathe) }
  }
  /** The brand as pieces thrown apart by `spread` (0 = whole, 1 = far), each with its own direction, some turned. */
  const drawPieces = (ctx: CanvasRenderingContext2D, source: CanvasImageSource, x: number, y: number, w: number, h: number, sw: number, sh: number, seed: number, spread: number, time: number) => {
    const cols = 3, rows = 4, pw = Math.ceil(w / cols), ph = Math.ceil(h / rows)
    for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) {
      const ang = hash(seed, r, c, 214) * Math.PI * 2, dist = (0.15 + hash(seed, r, c, 215) * 0.5) * W * spread
      const wob = Math.sin(time / 600 + r * 1.3 + c * 0.7) * W * 0.01 * spread
      const dx = Math.cos(ang) * dist + wob, dy = Math.sin(ang) * dist * 0.7 + wob
      const rot = (hash(seed, r, c, 216) - 0.5) * Math.PI * spread * (hash(seed, r, c, 218) < 0.3 ? 1 : 0.15)
      ctx.save(); ctx.translate(x + c * pw + pw / 2 + dx, y + r * ph + ph / 2 + dy); ctx.rotate(rot); if (hash(seed, r, c, 217) < 0.15 && spread > 0.3) ctx.scale(-1, 1)
      ctx.drawImage(source, c * pw * sw / w, r * ph * sh / h, pw * sw / w, ph * sh / h, -pw / 2, -ph / 2, pw, ph); ctx.restore()
    }
  }
  const drawBrand = (ctx: CanvasRenderingContext2D, source: CanvasImageSource, state: State, x: number, y: number, w: number, h: number, sw: number, sh: number, at: number, spread: number) => {
    const s = state.seed
    if (spread > 0.001) { drawPieces(ctx, source, x, y, w, h, sw, sh, s, spread, at); return }
    switch (state.deform) {
      case 'stretch': { const fx = 1.2 + hash(s, 210) * 1.4 + Math.sin(at / 900) * 0.15, fy = 0.5 + hash(s, 211) * 0.5; const nw = Math.round(w * fx), nh = Math.round(h * fy); ctx.drawImage(source, 0, 0, sw, sh, Math.round(x + w / 2 - nw / 2), Math.round(y + h / 2 - nh / 2), nw, nh); break }
      case 'skew': { const sk = (hash(s, 212) - 0.5) * 1.2 + Math.sin(at / 700) * 0.2; ctx.save(); ctx.transform(1, 0, sk, 1, 0, 0); ctx.drawImage(source, 0, 0, sw, sh, x - Math.round(sk * (y + h / 2)), y, w, h); ctx.restore(); break }
      case 'mirror': { ctx.save(); ctx.translate(x + w, 0); ctx.scale(-1, 1); ctx.drawImage(source, 0, 0, sw, sh, 0, y, w, h); ctx.restore(); ctx.globalAlpha = 0.5; ctx.drawImage(source, 0, 0, sw, sh, x + Math.round(w * 0.06 * (1 + Math.sin(at / 500))), y, w, h); ctx.globalAlpha = 1; break }
      case 'split': { for (let i = 0; i < 3; i += 1) { const ph = Math.ceil(h / 3), py = i * ph; ctx.drawImage(source, 0, py * sh / h, sw, ph * sh / h, x + Math.round((hash(s, i, 213) - 0.5) * W * 0.14 * (1 + Math.sin(at / 800 + i) * 0.5)), y + py, w, ph) } break }
      case 'exploded': drawPieces(ctx, source, x, y, w, h, sw, sh, s, 0.15 + 0.1 * Math.sin(at / 1100), at); break
      default: ctx.drawImage(source, 0, 0, sw, sh, x, y, w, h)
    }
  }

  // ----- the scene: three planes, the brand coming and going, the events, the words.
  const drawScene = (state: State, at: number, frame: number, residueOf: State | null) => {
    sc.globalCompositeOperation = 'source-over'; sc.globalAlpha = 1
    sc.fillStyle = DEEP; sc.fillRect(0, 0, W, H)
    const matter = matterOf(state.picture)
    const progress = Math.min(1, (at - state.from) / Math.max(1, state.to - state.from))
    const s = state.seed
    // Back plane: large dark fragments drifting slowly — more and brighter with the force.
    if (matter && k > 0.15) {
      const n = Math.round(2 + k * 10 * (0.5 + hash(s, 70)))
      for (let i = 0; i < n; i += 1) {
        const fw = Math.round(W * (0.15 + hash(s, i, 71) * 0.4)), fh = Math.round(H * (0.02 + hash(s, i, 72) * 0.12))
        const vx = (hash(s, i, 73) - 0.5) * W * 0.00012 * (1 + k), vy = (hash(s, i, 74) - 0.5) * H * 0.00004
        const fx = Math.round(hash(s, i, 75) * (W - fw) + vx * (at - state.from)), fy = Math.round(hash(s, i, 76) * (H - fh) + vy * (at - state.from))
        sc.globalAlpha = 0.25 + k * 0.3
        sc.drawImage(matter, Math.round(hash(s, i, 77) * (W - fw)), Math.round(hash(s, i, 78) * (H - fh)), fw, fh, fx, fy, fw, fh)
        sc.globalAlpha = 1
      }
    }
    // The brand, entering and leaving.
    const { img, x, y, w, h } = brandRect(state, progress)
    const dark = state.stacked ? input.logoVerticalDark : input.logoDark
    const sw = img.naturalWidth, sh = img.naturalHeight
    const secondColour = seconds.length ? seconds[Math.floor(hash(s, 203) * seconds.length)] : accent
    const enterLen = 0.22, exitLen = 0.2
    let ex = x, ey = y, ew = w, eh = h, spread = 0, visible = state.brandOn, alpha = 1
    if (visible && state.enter !== 'none' && progress < enterLen) {
      const t = easeOut(progress / enterLen)
      if (state.enter === 'slide') { const side = hash(s, 80) < 0.5 ? -1 : 1; ex = Math.round(x + side * (1 - t) * W * 1.2) }
      else if (state.enter === 'grow') { const f = 3 - 2 * t; ew = Math.round(w * f); eh = Math.round(h * f); ex = Math.round(x + w / 2 - ew / 2); ey = Math.round(y + h / 2 - eh / 2) }
      else if (state.enter === 'assemble') spread = 1 - t
      else if (state.enter === 'flicker') visible = hash(frame, s, 81) < 0.3 + t * 0.7
    }
    if (visible && state.exit !== 'none' && progress > 1 - exitLen) {
      const t = easeIn((progress - (1 - exitLen)) / exitLen)
      if (state.exit === 'explode') spread = t * 1.4
      else if (state.exit === 'slide') { const side = hash(s, 82) < 0.5 ? -1 : 1; ex = Math.round(x + side * t * W * 1.2) }
      else if (state.exit === 'dissolve') alpha = 1 - t
    }
    if (visible) {
      // The hard shadow, deep or a secondary, a little aside: the brand stands off the back plane.
      const shx = Math.round(W * (0.008 + hash(s, 83) * 0.012)), shy = Math.round(H * (0.004 + hash(s, 84) * 0.008))
      sc.globalAlpha = alpha * 0.9
      if (state.treat !== 'panel' && state.treat !== 'outline') drawBrand(sc, tinted(img, hash(s, 85) < 0.7 ? DEEP : secondColour, ew, eh), state, ex + shx, ey + shy, ew, eh, ew, eh, at, spread)
      sc.globalAlpha = alpha
      switch (state.treat) {
        case 'accent': drawBrand(sc, tinted(img, accent, ew, eh), state, ex, ey, ew, eh, ew, eh, at, spread); break
        case 'second': drawBrand(sc, tinted(img, secondColour, ew, eh), state, ex, ey, ew, eh, ew, eh, at, spread); break
        case 'panel': { sc.fillStyle = hash(s, 204) < 0.6 ? accent : secondColour; sc.fillRect(0, Math.round(ey - H * 0.04), W, Math.round(eh + H * 0.08)); drawBrand(sc, dark, state, ex, ey, ew, eh, sw, sh, at, spread); break }
        case 'dither': { drawBrand(sc, img, state, ex, ey, ew, eh, sw, sh, at, spread); sx.clearRect(0, 0, W, H); sx.globalCompositeOperation = 'source-over'; sx.drawImage(img, ex, ey, ew, eh); sx.globalCompositeOperation = 'source-in'; sx.fillStyle = sx.createPattern(dither, 'repeat')!; sx.fillRect(0, 0, W, H); sx.globalCompositeOperation = 'source-over'; sc.globalAlpha = alpha * 0.7; sc.drawImage(scratch, 0, 0); break }
        case 'outline': { sc.drawImage(tinted(img, hash(s, 205) < 0.6 ? accent : secondColour, ew, eh), 0, 0, ew, eh, ex - 2 * px, ey - 2 * px, ew + 4 * px, eh + 4 * px); sc.drawImage(dark, ex, ey, ew, eh); break }
        case 'split': { for (let i = 0; i < 3; i += 1) { const ph = Math.ceil(eh / 3), py = i * ph; sc.drawImage(img, 0, py * sh / eh, sw, ph * sh / eh, ex + Math.round((hash(s, i, 49) - 0.5) * W * 0.12 * (1 + Math.sin(at / 800 + i) * 0.5)), ey + py, ew, ph) } break }
        default: drawBrand(sc, img, state, ex, ey, ew, eh, sw, sh, at, spread)
      }
      sc.globalAlpha = 1
      if (state.pill && spread < 0.2 && state.deform !== 'exploded') pillAt(sc, ex + ew / 2, Math.round(ey + eh + H * 0.03), alpha)
    }
    // What a burst left behind, fading as the residue goes.
    if (residueOf && matter) {
      const raw = rawOf(state.picture)
      const fade = 1 - progress
      if (state.brandOn) lettersFilled(sc, img, x, y, w, h, matter, residueOf.seed, Math.max(0, Math.round((2 + k * 3) * fade)))
      const blocks = Math.max(0, Math.round((2 + k * 5) * fade))
      for (let i = 0; i < blocks && raw; i += 1) { const bw = Math.round(W * (0.08 + hash(residueOf.seed, i, 50) * 0.22)), bh = Math.round(H * (0.03 + hash(residueOf.seed, i, 51) * 0.12)); const bx = Math.round(hash(residueOf.seed, i, 52) * (W - bw)), by = Math.round(hash(residueOf.seed, i, 53) * (H - bh)); fragment(sc, state, residueOf.seed * 5 + i, bx, by, bw, bh); sc.strokeStyle = hash(residueOf.seed, i, 58) < 0.5 ? CREAM : colourAt(hash(residueOf.seed, i, 61)); sc.lineWidth = px; sc.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1) }
      if (residueOf.burst === 'vomit' && pileSeed === residueOf.seed) { sc.globalAlpha = Math.max(0, 0.9 - progress); sc.drawImage(pile, 0, 0); sc.globalAlpha = 1 }
    }
    // The events that fall on the calm.
    for (const ev of state.events) {
      const since = at - state.from - ev.at
      if (since < 0 || since > ev.len) continue
      const q = since / ev.len
      if (ev.kind === 'fragment') { const fw = Math.round(W * (0.08 + hash(ev.seed, 90) * 0.3)), fh = Math.round(H * (0.02 + hash(ev.seed, 91) * 0.1)); fragment(sc, state, ev.seed, Math.round(hash(ev.seed, 92) * (W - fw)), Math.round(hash(ev.seed, 93) * (H - fh)), fw, fh, 1 - q * 0.5) }
      else if (ev.kind === 'fill' && matter && state.brandOn) lettersFilled(sc, img, x, y, w, h, matter, ev.seed, 2 + Math.round(k * 3))
      else if (ev.kind === 'jump') { const j = Math.round((hash(ev.seed, Math.floor(since / 40), 94) - 0.5) * W * 0.05); sc.drawImage(scene, j, 0) }
      else if (ev.kind === 'tint') { sc.globalCompositeOperation = 'source-atop'; sc.fillStyle = colourAt(hash(ev.seed, 95)); sc.globalAlpha = 0.5; sc.fillRect(0, Math.round(hash(ev.seed, 96) * H * 0.6), W, Math.round(H * (0.1 + hash(ev.seed, 97) * 0.3))); sc.globalAlpha = 1; sc.globalCompositeOperation = 'source-over' }
      else if (ev.kind === 'icon' && input.icons.length) { const ic = input.icons[Math.floor(hash(ev.seed, 98) * input.icons.length)]; const size = Math.round(W * (0.15 + hash(ev.seed, 99) * 0.3)); const ix = Math.round(hash(ev.seed, 100) * (W - size)), iy = Math.round(hash(ev.seed, 101) * (H - size)); sc.drawImage(ic, ix, iy, size, size); for (let b = 0; b < 5; b += 1) { const by = iy + Math.round(hash(ev.seed, b, 102) * size), bh = Math.round(size * (0.03 + hash(ev.seed, b, 103) * 0.12)); sc.drawImage(scene, ix, by, size, bh, ix + Math.round((hash(ev.seed, b, Math.floor(since / 50), 104) - 0.5) * size * 0.6), by, size, bh) } }
      else if (ev.kind === 'hairline') { sc.fillStyle = colourAt(hash(ev.seed, 105)); sc.globalAlpha = 0.8; if (hash(ev.seed, 106) < 0.5) sc.fillRect(Math.round(hash(ev.seed, 107) * W), 0, px, H); else sc.fillRect(0, Math.round(hash(ev.seed, 107) * H), W, px); sc.globalAlpha = 1 }
    }
    // Front plane: a few small bright fragments moving fast.
    if (matter && k > 0.3) {
      const n = Math.round((k - 0.3) * 6)
      for (let i = 0; i < n; i += 1) { const fw = Math.round(W * (0.02 + hash(s, i, 110) * 0.08)), fh = Math.round(H * (0.004 + hash(s, i, 111) * 0.02)); const vx = (hash(s, i, 112) - 0.5) * W * 0.0012; const fx = ((Math.round(hash(s, i, 113) * W + vx * (at - state.from)) % (W + fw)) + W + fw) % (W + fw) - fw, fy = Math.round(hash(s, i, 114) * H); fragment(sc, state, s * 9 + i, fx, fy, fw, fh, 0.9) }
    }
    if (state.hud) hud(sc, frame, at)
    if (state.icon && input.icons.length) { const ic = input.icons[Math.floor(hash(s, 64) * input.icons.length)]; const size = Math.round(W * (0.2 + hash(s, 65) * 0.25)); sc.drawImage(ic, Math.round(hash(s, 66) * (W - size)), Math.round(hash(s, 67) * (H - size)), size, size) }
    words(sc)
    if (input.icon) sc.drawImage(input.icon.image, Math.round(input.icon.x * W), Math.round(input.icon.y * H), Math.round(input.icon.size * u), Math.round(input.icon.size * u))
  }

  // ----- the bursts, each with the occurrence's own parameters.
  const burstBands = (state: State, at: number) => {
    const matter = matterOf(state.picture), raw = rawOf(state.picture)
    const p = state.p
    oc.drawImage(scene, 0, 0)
    // How much of the frame: a share that grows with the force and the draw; the rest stays the scene.
    const coverage = Math.min(1, (0.15 + k * 0.55) * (0.5 + p.coverage))
    const step = Math.floor(at / (30 + p.flicker * 90))
    const thick = 0.005 + p.thick * 0.04
    const top = Math.round(hash(state.seed, step, 69) * H * (1 - coverage)), bottom = Math.min(H, top + Math.round(H * coverage))
    let y = top, i = 0
    while (y < bottom) {
      const bh = Math.max(2 * px, Math.round(H * (0.002 + hash(state.seed, step, i, 70) * thick)))
      const q = hash(state.seed, step, i, 72)
      const shift = Math.round((hash(state.seed, step, i, 73) - 0.5) * W * (0.15 + k * 0.6) * (0.5 + p.speed))
      const stretch = 1 + hash(state.seed, step, i, 74) * (hash(state.seed, i, 75) < 0.3 ? 3 : 0.4)
      if (q < 0.45 && matter) { const sy = Math.round(hash(state.seed, i, 76) * (H - bh)); oc.drawImage(matter, 0, sy, Math.round(W / stretch), bh, shift, y, W, bh) }
      else if (q < 0.8) oc.drawImage(scene, 0, y, Math.round(W / stretch), bh, shift, y, W, bh)
      else if (q < 0.88 && raw) { const sy = Math.round(hash(state.seed, i, 77) * (H - bh)); oc.drawImage(raw, 0, sy * raw.naturalHeight / H, raw.naturalWidth, Math.max(1, bh * raw.naturalHeight / H), shift, y, W, bh) }
      else { oc.fillStyle = DEEP; oc.fillRect(0, y, W, bh) }
      if (hash(state.seed, step, i, 78) < 0.12 + p.density * 0.15) { oc.fillStyle = colourAt(hash(state.seed, i, 79)); oc.fillRect(Math.round(hash(state.seed, i, 80) * W * 0.6), y, Math.round(W * (0.1 + hash(state.seed, i, 81) * 0.5)), Math.max(px, Math.round(bh * 0.3))) }
      y += bh; i += 1
    }
  }
  const burstRows = (state: State, at: number) => {
    const p = state.p
    oc.fillStyle = DEEP; oc.fillRect(0, 0, W, H)
    const rows = 4 + Math.round(p.density * 5), rh = Math.ceil(H / rows)
    const local = at - state.from
    for (let r = 0; r < rows; r += 1) {
      const y = r * rh
      const speed = (hash(state.seed, r, 83) - 0.5) * W * (state.sustained ? 0.2 + k * 0.5 : 0.7 + k * 1.5) * (0.4 + p.speed * 1.2) / 1000
      const base = Math.round(hash(state.seed, r, 84) * W + speed * local)
      const rowShift = ((base % W) + W) % W - Math.round(W * 0.5)
      if (hash(state.seed, r, 82) < 0.8) oc.drawImage(scene, 0, y, W, rh, rowShift, y, W, rh)
      const pieces = Math.round(hash(state.seed, r, 85) * (1 + k * 2 + p.density * 2))
      for (let q = 0; q < pieces; q += 1) {
        const pw = Math.round(W * (0.1 + hash(state.seed, r, q, 86) * 0.35)), ph = Math.round(rh * (0.4 + hash(state.seed, r, q, 87) * 0.6))
        const px0 = (((base + Math.round(hash(state.seed, r, q, 88) * W)) % (W + pw)) + W + pw) % (W + pw) - pw
        const py = y + Math.round(hash(state.seed, r, q, 89) * (rh - ph))
        if (hash(state.seed, r, q, 90) < 0.8) fragment(oc, state, state.seed * 11 + r * 13 + q, px0, py, pw, ph)
        else { oc.fillStyle = colourAt(hash(state.seed, r, q, 94)); oc.fillRect(px0, py, pw, ph) }
        if (hash(state.seed, r, q, 95) < 0.5) { oc.strokeStyle = hash(state.seed, r, q, 96) < 0.5 ? CREAM : DEEP; oc.lineWidth = px; oc.strokeRect(px0 + 0.5, py + 0.5, pw - 1, ph - 1) }
      }
      if (hash(state.seed, r, 97) < 0.3) { oc.fillStyle = colourAt(hash(state.seed, r, 98)); oc.fillRect(0, y + rh - px, W, px) }
    }
  }
  const burstFeed = (state: State, at: number) => {
    const p = state.p
    oc.fillStyle = DEEP; oc.fillRect(0, 0, W, H)
    const local = at - state.from
    const cw = Math.round(W * (0.3 + p.thick * 0.4)), ch = Math.round(cw * (0.7 + hash(state.seed, 101) * 0.7)), gap = Math.round(H * (0.02 + p.density * 0.05))
    const cx = Math.round((W - cw) / 2 + (p.ox - 0.5) * W * 0.4)
    const dir = p.dir < 0.6 ? 1 : -1
    const speed = H * (state.sustained ? 0.7 + k * 1.2 : 2 + k * 3) * (0.5 + p.speed) / 1000
    const offset = (local * speed) % (ch + gap)
    const brand = brandRect(state, 0)
    for (let i = -1; i < Math.ceil(H / (ch + gap)) + 1; i += 1) {
      const y = Math.round(dir > 0 ? i * (ch + gap) - offset : H - (i + 1) * (ch + gap) + offset)
      const which = hash(state.seed, i, 103)
      if (which < 0.3 && state.brandOn) { oc.fillStyle = DEEP; oc.fillRect(cx, y, cw, ch); oc.drawImage(scene, brand.x, brand.y, brand.w, brand.h, cx + Math.round(cw * 0.1), y + Math.round(ch * 0.15), Math.round(cw * 0.8), Math.round(cw * 0.8 * brand.h / brand.w)) }
      else fragment(oc, state, state.seed * 7 + i, cx, y, cw, ch)
      oc.strokeStyle = CREAM; oc.lineWidth = px; oc.strokeRect(cx - 2 * px + 0.5, y - 2 * px + 0.5, cw + 4 * px, ch + 4 * px)
      oc.strokeStyle = colourAt(hash(state.seed, i, 107)); oc.strokeRect(cx + 2 * px + 0.5, y + 2 * px + 0.5, cw - 4 * px, ch - 4 * px)
    }
    oc.globalAlpha = 0.35; oc.drawImage(out, 0, -dir * Math.round(ch * 0.15)); oc.globalAlpha = 1
  }
  const burstSweep = (state: State, at: number, frame: number) => {
    const p = state.p
    oc.drawImage(scene, 0, 0)
    const local = (at - state.from) / Math.max(1, state.to - state.from)
    const lx = Math.round((p.dir < 0.5 ? local : 1 - local) * W)
    const trail = Math.round(W * (0.04 + k * 0.2) * (0.5 + p.thick))
    oc.save(); oc.beginPath(); oc.rect(lx - trail, 0, trail, H); oc.clip(); oc.translate(2 * lx, 0); oc.scale(-1, 1); oc.drawImage(scene, 0, 0); oc.restore()
    for (let i = 0; i < Math.round((2 + k * 10) * (0.4 + p.density)); i += 1) { const cw = Math.round(W * (0.004 + hash(state.seed, frame, i, 111) * 0.03)), cx = Math.round(lx - trail * 1.5 + hash(state.seed, frame, i, 112) * trail * 2.5); const dy = Math.round((hash(state.seed, frame, i, 113) - 0.5) * H * 0.3 * k); if (cx + cw > 0 && cx < W) oc.drawImage(scene, cx, 0, cw, H, cx, dy, cw, H) }
    for (let i = 0; i < Math.round((1 + k * 5) * (0.4 + p.density)); i += 1) { const fw = Math.round(W * (0.05 + hash(state.seed, i, 114) * 0.15)), fh = Math.round(H * (0.03 + hash(state.seed, i, 115) * 0.1)); fragment(oc, state, state.seed * 3 + i, Math.round(lx - trail + hash(state.seed, i, 116) * trail * 2 - fw / 2), Math.round(hash(state.seed, i, 117) * (H - fh)), fw, fh) }
    oc.fillStyle = hash(state.seed, 118) < 0.7 ? CREAM : colourAt(hash(state.seed, 119)); oc.fillRect(lx, 0, 2 * px, H); oc.globalAlpha = 0.4; oc.fillRect(lx - 6 * px, 0, px, H); oc.globalAlpha = 1
  }
  const burstVomit = (state: State, at: number, frame: number) => {
    const p = state.p
    if (pileSeed !== state.seed) { pileSeed = state.seed; pc.clearRect(0, 0, W, H) }
    const local = Math.min(1, (at - state.from) / Math.max(1, state.to - state.from))
    const ox = W * (0.15 + p.ox * 0.7), oy = H * (0.1 + p.oy * 0.6)
    // The pour's direction: down mostly, else up or sideways; its pace and its thickness drawn for this one.
    const ang = p.dir < 0.6 ? Math.PI / 2 : p.dir < 0.75 ? -Math.PI / 2 : p.dir < 0.88 ? 0 : Math.PI
    const pace = 0.4 + p.speed * 1.2
    const n = Math.round((4 + k * 14) * (0.5 + p.density))
    for (let i = 0; i < n; i += 1) {
      const spread = (0.1 + local * 0.9) * pace
      const fw = Math.round(W * (0.03 + hash(state.seed, frame, i, 132) * (0.12 + p.thick * 0.2))), fh = Math.round(H * (0.004 + hash(state.seed, frame, i, 133) * (0.03 + p.thick * 0.05)))
      const along = hash(state.seed, frame, i, 135) * spread, across = (hash(state.seed, frame, i, 134) - 0.5) * spread * 0.7
      const fx = Math.round(ox + Math.cos(ang) * along * H * 0.9 - Math.sin(ang) * across * W - fw / 2), fy = Math.round(oy + Math.sin(ang) * along * H * 0.9 + Math.cos(ang) * across * W - fh / 2)
      fragment(pc, state, state.seed * 13 + frame * 7 + i, fx, fy, fw, fh)
    }
    // The drip along the pour, and tears across it.
    const drip = Math.round((2 + k * 6) * pace) * px
    pc.globalAlpha = 0.6; pc.drawImage(pile, Math.round(Math.cos(ang) * drip), Math.round(Math.sin(ang) * drip)); pc.globalAlpha = 1
    for (let i = 0; i < Math.round(1 + k * 5); i += 1) { const sy = Math.round(hash(state.seed, frame, i, 143) * H), sh2 = Math.round(H * (0.004 + hash(state.seed, frame, i, 144) * 0.03)); pc.drawImage(pile, 0, sy, W, sh2, Math.round((hash(state.seed, frame, i, 145) - 0.5) * W * 0.3), sy, W, sh2) }
    oc.drawImage(scene, 0, 0)
    oc.drawImage(pile, 0, 0)
  }

  const stateAt = (at: number) => { const index = states.findIndex((s) => at < s.to); return states[index === -1 ? states.length - 1 : index] }
  const frame = (ctx: CanvasRenderingContext2D, at: number, frameNo: number) => {
    const index = states.findIndex((s) => at < s.to)
    const state = states[index === -1 ? states.length - 1 : index]
    const residueOf = state.kind === 'residue' ? states[index - 1] ?? null : null
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = true
    drawScene(state, at, frameNo, residueOf)
    if (state.kind === 'burst') {
      if (state.burst === 'bands') burstBands(state, at)
      else if (state.burst === 'rows') burstRows(state, at)
      else if (state.burst === 'feed') burstFeed(state, at)
      else if (state.burst === 'vomit') burstVomit(state, at, frameNo)
      else burstSweep(state, at, frameNo)
      ctx.drawImage(out, 0, 0)
    } else ctx.drawImage(scene, 0, 0)
    pv.drawImage(ctx.canvas, 0, 0)
  }
  return { states, frame, stateAt }
}

/** The film recorded as an MP4 (Chrome, Edge) at 1080 × 1920, drawn live into the preview as it goes. */
export async function recordPromo(input: PromoInput, preview?: HTMLCanvasElement | null, onProgress?: (p: number) => void): Promise<{ blob: Blob; extension: 'mp4' | 'webm' }> {
  const choice = recorderChoice((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t))
  if (!choice) throw new Error('Ce navigateur n’enregistre pas de vidéo : Chrome ou Edge sur ordinateur.')
  const W = 1080, H = 1920
  const work = document.createElement('canvas'); work.width = W; work.height = H
  const ctx = work.getContext('2d')!
  const promo = createPromo(input, W, H)
  const stream = work.captureStream(30)
  const recorder = new MediaRecorder(stream, { mimeType: choice.mimeType, videoBitsPerSecond: 12_000_000 })
  const chunks: Blob[] = []
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
  const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve() })
  const total = input.seconds * 1000
  const previewCtx = preview?.getContext('2d') ?? null
  recorder.start(500)
  const started = performance.now()
  let frameNo = 0
  await new Promise<void>((resolve) => {
    const tick = () => {
      const at = performance.now() - started
      if (at >= total) { resolve(); return }
      promo.frame(ctx, at, frameNo)
      if (previewCtx && preview) previewCtx.drawImage(work, 0, 0, preview.width, preview.height)
      onProgress?.(at / total)
      frameNo += 1
      requestAnimationFrame(tick)
    }
    tick()
  })
  recorder.stop()
  await stopped
  const blob = new Blob(chunks, { type: choice.mimeType.split(';')[0] })
  if (!blob.size) throw new Error('Rien n’a été enregistré.')
  return { blob, extension: choice.extension }
}
