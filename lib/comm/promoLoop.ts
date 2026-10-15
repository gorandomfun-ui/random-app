/**
 * The promo loops: short films that speak of Random itself, after the owner's
 * three references, built from the site's own things — the wordmark, the brand
 * block, the icons — and from stock pictures under a permissive licence that
 * only ever appear as matter: fragments, bands, cards. Never a photograph.
 *
 * The grammar of the references:
 *   calm     the brand clean on black (or, at a high force, over a thin field of fragments),
 *            in one of its treatments — cream, the accent, deep on a panel, dithered, outline,
 *            split — stacked or across, with the address pill; a faint jitter; now and then a
 *            thin line passing and the tiniest camera interface;
 *   burst    a few frames where the whole frame is corruption made of the picture and of the
 *            brand alike: bands of posterised pixels, blocks sliding in rows that cut the letters
 *            too, small framed cards rushing past, a line sweeping with its trail;
 *   residue  the calm again with what the burst left: a letter filled with picture, a few blocks
 *            that stay a moment, a fringe.
 * The curator's words are part of the scene: clean in the calm, torn in the bursts like the rest.
 * One icon at most, inside a burst, torn with it. Theme colours only: no gradient, no blur, no RGB.
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

export type BurstKind = 'bands' | 'rows' | 'feed' | 'sweep'
export const BURSTS: Array<{ key: BurstKind; name: string; hint: string }> = [
  { key: 'bands', name: 'Bandes', hint: 'tout l’écran en bandes de pixels cassés, l’image et les lettres ensemble' },
  { key: 'rows', name: 'Rangées', hint: 'des blocs d’image qui glissent par rangées, les lettres coupées par les mêmes rangées' },
  { key: 'feed', name: 'Défilé', hint: 'de petites vignettes encadrées qui filent, la carte de la marque parmi elles' },
  { key: 'sweep', name: 'Balayage', hint: 'une ligne fine qui traverse, les colonnes qu’elle touche décalées, des fragments dans sa trace' },
]

export type PromoText = { value: string; size: number; align: 'left' | 'center' | 'right'; font: string; weight: number; x: number; y: number; width: number }
export type PromoIcon = { image: HTMLImageElement; x: number; y: number; size: number }
export type PromoInput = {
  seconds: number
  intensity: number
  seed: number
  accent: string
  /** The bursts the film may use: the curator's choice. */
  bursts: BurstKind[]
  /** The wordmark across, and the letters stacked, cream; and the same in deep. */
  logo: HTMLImageElement
  logoVertical: HTMLImageElement
  logoDark: HTMLImageElement
  logoVerticalDark: HTMLImageElement
  /** The site's icons, cream. */
  icons: HTMLImageElement[]
  /** Stock pictures under a permissive licence, already loadable by a canvas. */
  stock: HTMLImageElement[]
  titleFont: string
  /** The curator's words and icon, as in the composer; sizes in 1080-wide units. */
  text?: PromoText | null
  icon?: PromoIcon | null
}

type Treatment = 'cream' | 'accent' | 'panel' | 'dither' | 'outline' | 'split'
export type State = { from: number; to: number; kind: 'calm' | 'burst' | 'residue'; burst: BurstKind; treat: Treatment; stacked: boolean; pill: boolean; hud: boolean; line: boolean; icon: boolean; picture: number; seed: number }

/** The run of states: calm, burst, residue, calm… shorter calms and longer, oftener bursts as the force rises. */
export function planStates(input: Pick<PromoInput, 'seconds' | 'intensity' | 'seed' | 'bursts'>, pictures: number): State[] {
  const k = Math.min(1, Math.max(0, input.intensity))
  const bursts = input.bursts.length ? input.bursts : BURSTS.map((b) => b.key)
  const out: State[] = []
  const total = input.seconds * 1000
  let at = 0, i = 0, picture = 0
  const treatments: Treatment[] = ['cream', 'cream', 'accent', 'panel', 'dither', 'outline', 'split']
  let treat: Treatment = 'cream', stacked = true, pill = true
  while (at < total) {
    const s = input.seed * 17 + i * 101
    // The calm: the brand in a treatment that changes on most calms; the pill now and then away.
    if (i > 0 && hash(s, 1) < 0.7) treat = treatments[Math.floor(hash(s, 2) * treatments.length)]
    if (hash(s, 3) < 0.3) stacked = !stacked
    pill = hash(s, 4) < 0.7
    const calmLen = Math.round((950 - k * 600) * (0.6 + hash(s, 5) * 0.8))
    out.push({ from: at, to: Math.min(total, at + calmLen), kind: 'calm', burst: bursts[0], treat, stacked, pill, hud: hash(s, 6) < 0.4, line: hash(s, 7) < 0.35, icon: false, picture, seed: s })
    at += calmLen
    if (at >= total) break
    // The burst, sometimes two in a row of different kinds; the picture changes with it.
    const chain = hash(s, 8) < k * 0.45 ? 2 : 1
    for (let c = 0; c < chain && at < total; c += 1) {
      const burst = bursts[Math.floor(hash(s, 9, c) * bursts.length)]
      const burstLen = Math.round((70 + k * 220) * (0.6 + hash(s, 10, c) * 0.9))
      picture = pictures > 1 ? (picture + 1 + Math.floor(hash(s, 11, c) * (pictures - 1))) % pictures : 0
      out.push({ from: at, to: Math.min(total, at + burstLen), kind: 'burst', burst, treat, stacked, pill, hud: false, line: false, icon: hash(s, 12, c) < 0.3, picture, seed: s + 7 + c })
      at += burstLen
    }
    if (at >= total) break
    // The residue: what the burst left, for a moment.
    const resLen = Math.round((120 + k * 320) * (0.5 + hash(s, 13) * 1))
    out.push({ from: at, to: Math.min(total, at + resLen), kind: 'residue', burst: bursts[Math.floor(hash(s, 9, 0) * bursts.length)], treat, stacked, pill, hud: hash(s, 14) < 0.5, line: false, icon: false, picture, seed: s + 3 })
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
  const PALETTE = [DEEP, mix(accent, DEEP, 0.55), accent, mix(accent, CREAM, 0.5), CREAM]
  const k = Math.min(1, Math.max(0, input.intensity))
  const u = W / 1080
  const px = Math.max(1, Math.round(u))
  const font = input.titleFont
  const states = planStates(input, Math.max(1, input.stock.length))
  const make = (w = W, h = H) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }
  const scene = make(), out = make(), scratch = make(), prev = make()
  const sc = scene.getContext('2d')!, oc = out.getContext('2d')!, sx = scratch.getContext('2d')!, pv = prev.getContext('2d')!
  const dither = (() => { const c = make(4 * px, 4 * px); const g = c.getContext('2d')!; g.fillStyle = DEEP; g.fillRect(0, 0, 2 * px, 2 * px); g.fillRect(2 * px, 2 * px, 2 * px, 2 * px); return c })()

  // ----- the picture as matter: posterised into the theme's five tones, once per picture. Never the photograph.
  const matterCache = new Map<number, HTMLCanvasElement>()
  const matterOf = (index: number) => {
    const img = input.stock[index % Math.max(1, input.stock.length)]
    let m = matterCache.get(index)
    if (m || !img) return m ?? null
    m = make(); const g = m.getContext('2d')!
    cover(g, img, 0, 0, W, H)
    const data = g.getImageData(0, 0, W, H), d = data.data
    const tones = PALETTE.map((c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)))
    for (let p = 0; p < d.length; p += 4) {
      const lum = (d[p] * 0.299 + d[p + 1] * 0.587 + d[p + 2] * 0.114) / 255
      // A little ordered noise before the step, so the flats break into grain rather than plates.
      const n = ((p / 4) % 2 + Math.floor(p / 4 / W) % 2) * 0.08
      const t = tones[Math.max(0, Math.min(4, Math.floor((lum + n) * 4.6)))]
      d[p] = t[0]; d[p + 1] = t[1]; d[p + 2] = t[2]
    }
    g.putImageData(data, 0, 0)
    matterCache.set(index, m)
    return m
  }
  const rawOf = (index: number) => input.stock[index % Math.max(1, input.stock.length)] ?? null

  // ----- pieces
  const logoSize = (img: HTMLImageElement, w: number) => ({ w: Math.round(w), h: Math.round(w * img.naturalHeight / Math.max(1, img.naturalWidth)) })
  const tinted = (img: CanvasImageSource, colour: string, w: number, h: number) => {
    sx.clearRect(0, 0, W, H); sx.globalCompositeOperation = 'source-over'; sx.drawImage(img, 0, 0, w, h)
    sx.globalCompositeOperation = 'source-in'; sx.fillStyle = colour; sx.fillRect(0, 0, w, h); sx.globalCompositeOperation = 'source-over'
    return scratch
  }
  const pill = (ctx: CanvasRenderingContext2D, y: number) => {
    const w = Math.round(W * 0.5), h = Math.round(H * 0.036), x = Math.round((W - w) / 2), r = h / 2
    ctx.fillStyle = accent; ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2); ctx.lineTo(x + r, y + h); ctx.arc(x + r, y + r, r, Math.PI / 2, -Math.PI / 2); ctx.closePath(); ctx.fill()
    ctx.fillStyle = CREAM; ctx.font = `700 ${Math.round(h * 0.5)}px ${font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(SITE, W / 2, y + h / 2)
  }
  /** The tiniest camera interface, faint: a status line, brackets, the letters at the right, a counter. */
  const hud = (ctx: CanvasRenderingContext2D, frame: number, at: number) => {
    ctx.save(); ctx.globalAlpha = 0.55; ctx.fillStyle = CREAM; ctx.font = `${Math.round(W * 0.018)}px ${font}`; ctx.textBaseline = 'top'; ctx.textAlign = 'left'
    ctx.fillText(`17:${String(13 + Math.floor(at / 1000)).padStart(2, '0')}  ${String(140 + (frame % 30)).padStart(3, '0')}`, Math.round(W * 0.05), Math.round(H * 0.03))
    for (let i = 0; i < 4; i += 1) ctx.fillRect(Math.round(W * 0.8) + i * 6 * px, Math.round(H * 0.03) + (3 - i) * 3 * px, 3 * px, (i + 1) * 3 * px)
    ctx.textAlign = 'right'; ['F', 'R', 'N'].forEach((l, i) => ctx.fillText(l, Math.round(W * 0.95), Math.round(H * (0.09 + i * 0.022))))
    ctx.fillText(`${String(Math.floor(at / 100) % 100).padStart(2, '0')}:00`, Math.round(W * 0.95), Math.round(H * 0.95))
    ctx.strokeStyle = CREAM; ctx.lineWidth = px
    const m = Math.round(W * 0.05), l = Math.round(W * 0.04)
    for (const [cx, cy, dx, dy] of [[m, Math.round(H * 0.2), 1, 1], [W - m, Math.round(H * 0.2), -1, 1], [m, Math.round(H * 0.8), 1, -1], [W - m, Math.round(H * 0.8), -1, -1]] as const) { ctx.beginPath(); ctx.moveTo(cx, cy + dy * l); ctx.lineTo(cx, cy); ctx.lineTo(cx + dx * l, cy); ctx.stroke() }
    ctx.restore()
  }
  /** Picture fragments through the letters: the logo as a mask on the matter. */
  const lettersFilled = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, matter: HTMLCanvasElement, seed: number, count: number) => {
    sx.clearRect(0, 0, W, H); sx.globalCompositeOperation = 'source-over'; sx.drawImage(img, x, y, w, h)
    sx.globalCompositeOperation = 'source-in'; sx.drawImage(matter, Math.round((hash(seed, 30) - 0.5) * W * 0.5), Math.round((hash(seed, 31) - 0.5) * H * 0.3)); sx.globalCompositeOperation = 'source-over'
    for (let i = 0; i < count; i += 1) { const fw = Math.round(w * (0.2 + hash(seed, i, 32) * 0.45)), fh = Math.round(h * (0.25 + hash(seed, i, 33) * 0.6)); const fx = Math.round(x + hash(seed, i, 34) * (w - fw)), fy = Math.round(y + hash(seed, i, 35) * (h - fh)); ctx.drawImage(scratch, fx, fy, fw, fh, fx, fy, fw, fh) }
  }
  /** The curator's words, clean: cream with a deep outline. Drawn into the scene, so a burst tears them like the rest. */
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

  // ----- the scene: the brand in its treatment, the pill, the words, the icon, over black or a thin field.
  const brandRect = (state: State) => {
    const img = state.stacked ? input.logoVertical : input.logo
    const { w, h } = logoSize(img, W * (state.stacked ? 0.6 : 0.78))
    return { img, x: Math.round((W - w) / 2), y: Math.round(H * 0.44 - h / 2), w, h }
  }
  const drawScene = (state: State, at: number, frame: number, residueOf: State | null) => {
    sc.globalCompositeOperation = 'source-over'; sc.globalAlpha = 1
    sc.fillStyle = DEEP; sc.fillRect(0, 0, W, H)
    const matter = matterOf(state.picture)
    // At a high force the calm is not black: a thin field of fragments, sparse, that the eye reads as texture.
    if (k > 0.6 && matter) {
      const n = Math.round((k - 0.6) * 40)
      const step = Math.floor(at / 160)
      for (let i = 0; i < n; i += 1) { const fw = Math.round(W * (0.04 + hash(state.seed, step, i, 40) * 0.2)), fh = Math.round(H * (0.005 + hash(state.seed, step, i, 41) * 0.03)); const fx = Math.round(hash(state.seed, step, i, 42) * (W - fw)), fy = Math.round(hash(state.seed, step, i, 43) * (H - fh)); sc.globalAlpha = 0.5 + hash(state.seed, i, 44) * 0.5; sc.drawImage(matter, Math.round(hash(state.seed, i, 45) * (W - fw)), Math.round(hash(state.seed, i, 46) * (H - fh)), fw, fh, fx, fy, fw, fh) }
      sc.globalAlpha = 1
    }
    const { img, x, y, w, h } = brandRect(state)
    const jx = k > 0 && hash(frame, 47) < k * 0.3 ? Math.round((hash(frame, 48) - 0.5) * W * 0.012 * k) : 0
    const dark = state.stacked ? input.logoVerticalDark : input.logoDark
    switch (state.treat) {
      case 'cream': sc.drawImage(img, x + jx, y, w, h); break
      case 'accent': sc.drawImage(tinted(img, accent, w, h), 0, 0, w, h, x + jx, y, w, h); break
      case 'panel': { sc.fillStyle = accent; sc.fillRect(0, Math.round(y - H * 0.04), W, Math.round(h + H * 0.08)); sc.drawImage(dark, x + jx, y, w, h); break }
      case 'dither': { sc.drawImage(img, x + jx, y, w, h); sx.clearRect(0, 0, W, H); sx.globalCompositeOperation = 'source-over'; sx.drawImage(img, x + jx, y, w, h); sx.globalCompositeOperation = 'source-in'; sx.fillStyle = sx.createPattern(dither, 'repeat')!; sx.fillRect(0, 0, W, H); sx.globalCompositeOperation = 'source-over'; sc.globalAlpha = 0.7; sc.drawImage(scratch, 0, 0); sc.globalAlpha = 1; break }
      case 'outline': { sc.drawImage(tinted(img, accent, w, h), 0, 0, w, h, x + jx - 2 * px, y - 2 * px, w + 4 * px, h + 4 * px); sc.drawImage(dark, x + jx, y, w, h); break }
      case 'split': {
        // The block in three horizontal pieces, each a little aside, as if the frame had slipped.
        const pieces = 3
        for (let i = 0; i < pieces; i += 1) { const ph = Math.ceil(h / pieces), py = i * ph; const dx = Math.round((hash(state.seed, i, 49) - 0.5) * W * 0.12); sc.drawImage(img, 0, py * img.naturalHeight / h, img.naturalWidth, ph * img.naturalHeight / h, x + jx + dx, y + py, w, ph) }
        break
      }
    }
    if (state.pill) pill(sc, Math.round(y + h + H * 0.03))
    // What the burst left behind, fading as the residue goes: letters filled with matter, blocks that stay.
    if (residueOf && matter) {
      const local = (at - state.from) / Math.max(1, state.to - state.from)
      const raw = rawOf(state.picture)
      lettersFilled(sc, img, x, y, w, h, matter, residueOf.seed, Math.max(0, Math.round((2 + k * 3) * (1 - local))))
      const blocks = Math.max(0, Math.round((2 + k * 5) * (1 - local)))
      for (let i = 0; i < blocks && raw; i += 1) { const bw = Math.round(W * (0.08 + hash(residueOf.seed, i, 50) * 0.22)), bh = Math.round(H * (0.03 + hash(residueOf.seed, i, 51) * 0.12)); const bx = Math.round(hash(residueOf.seed, i, 52) * (W - bw)), by = Math.round(hash(residueOf.seed, i, 53) * (H - bh)); cover(sc, hash(residueOf.seed, i, 54) < 0.5 ? raw : matter, bx, by, bw, bh, 1 + hash(residueOf.seed, i, 55) * 2, hash(residueOf.seed, i, 56), hash(residueOf.seed, i, 57)); sc.strokeStyle = hash(residueOf.seed, i, 58) < 0.5 ? CREAM : accent; sc.lineWidth = px; sc.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1) }
      if (hash(frame, residueOf.seed, 59) < 0.3) { const fy = Math.round(hash(residueOf.seed, frame, 60) * H); sc.fillStyle = hash(frame, 61) < 0.5 ? accent : CREAM; sc.globalAlpha = 0.6; sc.fillRect(0, fy, W, px); sc.globalAlpha = 1 }
    }
    // A thin line passing, now and then, in the calm.
    if (state.line) { const local = (at - state.from) / Math.max(1, state.to - state.from); const lx = Math.round((hash(state.seed, 62) < 0.5 ? local : 1 - local) * W); sc.fillStyle = hash(state.seed, 63) < 0.6 ? CREAM : accent; sc.globalAlpha = 0.8; sc.fillRect(lx, 0, px, H); sc.globalAlpha = 1 }
    if (state.hud) hud(sc, frame, at)
    // The icon, one, only when a burst asks for it: it will be torn with the rest.
    if (state.icon && input.icons.length) { const ic = input.icons[Math.floor(hash(state.seed, 64) * input.icons.length)]; const s = Math.round(W * (0.2 + hash(state.seed, 65) * 0.25)); sc.drawImage(ic, Math.round(hash(state.seed, 66) * (W - s)), Math.round(hash(state.seed, 67) * (H - s)), s, s) }
    words(sc)
    if (input.icon) sc.drawImage(input.icon.image, Math.round(input.icon.x * W), Math.round(input.icon.y * H), Math.round(input.icon.size * u), Math.round(input.icon.size * u))
  }

  // ----- the bursts: the whole frame as corruption made of the picture's matter and of the scene alike.
  const burstBands = (state: State, at: number, frame: number) => {
    const matter = matterOf(state.picture), raw = rawOf(state.picture)
    oc.fillStyle = DEEP; oc.fillRect(0, 0, W, H)
    const step = Math.floor(at / 40)
    let y = 0, i = 0
    while (y < H) {
      const bh = Math.max(2 * px, Math.round(H * (0.002 + hash(state.seed, step, i, 70) * (0.01 + hash(state.seed, i, 71) * 0.04))))
      const q = hash(state.seed, step, i, 72)
      const shift = Math.round((hash(state.seed, step, i, 73) - 0.5) * W * (0.2 + k * 0.6))
      const stretch = 1 + hash(state.seed, step, i, 74) * (hash(state.seed, i, 75) < 0.3 ? 3 : 0.4)
      if (q < 0.5 && matter) { const sy = Math.round(hash(state.seed, i, 76) * (H - bh)); oc.drawImage(matter, 0, sy, Math.round(W / stretch), bh, shift, y, W, bh) }
      else if (q < 0.8) { oc.drawImage(scene, 0, y, Math.round(W / stretch), bh, shift, y, W, bh) }
      else if (q < 0.9 && raw) { const sy = Math.round(hash(state.seed, i, 77) * (H - bh)); oc.drawImage(matter ?? raw, 0, sy, W, bh, shift, y, W, bh) }
      // else black
      if (hash(state.seed, step, i, 78) < 0.15) { oc.fillStyle = PALETTE[Math.floor(hash(state.seed, i, 79) * 5)]; oc.fillRect(Math.round(hash(state.seed, i, 80) * W * 0.6), y, Math.round(W * (0.1 + hash(state.seed, i, 81) * 0.5)), Math.max(px, Math.round(bh * 0.3))) }
      y += bh; i += 1
    }
    void frame
  }
  const burstRows = (state: State, at: number) => {
    const matter = matterOf(state.picture), raw = rawOf(state.picture)
    oc.fillStyle = DEEP; oc.fillRect(0, 0, W, H)
    const rows = 5 + Math.round(hash(state.seed, 82) * 3), rh = Math.ceil(H / rows)
    const local = (at - state.from)
    for (let r = 0; r < rows; r += 1) {
      const y = r * rh
      const speed = (hash(state.seed, r, 83) - 0.5) * W * (0.8 + k * 1.6) / 1000
      const base = Math.round(hash(state.seed, r, 84) * W + speed * local)
      // The scene's row, slid with the rest.
      const rowShift = ((base % W) + W) % W - Math.round(W * 0.5)
      oc.drawImage(scene, 0, y, W, rh, rowShift, y, W, rh)
      const pieces = 1 + Math.round(hash(state.seed, r, 85) * (1 + k * 2))
      for (let p = 0; p < pieces; p += 1) {
        const pw = Math.round(W * (0.12 + hash(state.seed, r, p, 86) * 0.35)), ph = Math.round(rh * (0.5 + hash(state.seed, r, p, 87) * 0.5))
        const px0 = (((base + Math.round(hash(state.seed, r, p, 88) * W)) % (W + pw)) + W + pw) % (W + pw) - pw
        const py = y + Math.round(hash(state.seed, r, p, 89) * (rh - ph))
        const src = hash(state.seed, r, p, 90) < 0.6 ? raw : matter
        if (src) cover(oc, src, px0, py, pw, ph, 1.2 + hash(state.seed, r, p, 91) * 2.5, hash(state.seed, r, p, 92), hash(state.seed, r, p, 93))
        else { oc.fillStyle = PALETTE[Math.floor(hash(state.seed, r, p, 94) * 5)]; oc.fillRect(px0, py, pw, ph) }
        if (hash(state.seed, r, p, 95) < 0.5) { oc.strokeStyle = hash(state.seed, r, p, 96) < 0.5 ? CREAM : DEEP; oc.lineWidth = px; oc.strokeRect(px0 + 0.5, py + 0.5, pw - 1, ph - 1) }
      }
      if (hash(state.seed, r, 97) < 0.3) { oc.fillStyle = hash(state.seed, r, 98) < 0.5 ? accent : CREAM; oc.fillRect(0, y + rh - px, W, px) }
    }
  }
  const burstFeed = (state: State, at: number) => {
    const raw = rawOf(state.picture), matter = matterOf(state.picture)
    oc.fillStyle = DEEP; oc.fillRect(0, 0, W, H)
    const local = at - state.from
    const cw = Math.round(W * (0.4 + hash(state.seed, 100) * 0.25)), ch = Math.round(cw * (0.7 + hash(state.seed, 101) * 0.6)), gap = Math.round(H * 0.03)
    const cx = Math.round((W - cw) / 2 + (hash(state.seed, 102) - 0.5) * W * 0.3)
    const speed = H * (2.5 + k * 3) / 1000
    const offset = (local * speed) % (ch + gap)
    const brand = brandRect(state)
    for (let i = -1; i < Math.ceil(H / (ch + gap)) + 1; i += 1) {
      const y = Math.round(i * (ch + gap) - offset)
      const which = hash(state.seed, i, 103)
      if (which < 0.3) { oc.fillStyle = DEEP; oc.fillRect(cx, y, cw, ch); oc.drawImage(scene, brand.x, brand.y, brand.w, brand.h, cx + Math.round(cw * 0.1), y + Math.round(ch * 0.15), Math.round(cw * 0.8), Math.round(cw * 0.8 * brand.h / brand.w)) }
      else if (raw || matter) cover(oc, which < 0.75 && raw ? raw : matter!, cx, y, cw, ch, 1 + hash(state.seed, i, 104) * 1.5, hash(state.seed, i, 105), hash(state.seed, i, 106))
      oc.strokeStyle = CREAM; oc.lineWidth = px; oc.strokeRect(cx - 2 * px + 0.5, y - 2 * px + 0.5, cw + 4 * px, ch + 4 * px)
      oc.strokeStyle = accent; oc.strokeRect(cx + 2 * px + 0.5, y + 2 * px + 0.5, cw - 4 * px, ch - 4 * px)
    }
    // The doubles of the speed: the frame smeared upward.
    oc.globalAlpha = 0.35; oc.drawImage(out, 0, -Math.round(ch * 0.15)); oc.globalAlpha = 1
  }
  const burstSweep = (state: State, at: number, frame: number) => {
    const matter = matterOf(state.picture), raw = rawOf(state.picture)
    oc.drawImage(scene, 0, 0)
    const local = (at - state.from) / Math.max(1, state.to - state.from)
    const lx = Math.round((hash(state.seed, 110) < 0.5 ? local : 1 - local) * W)
    const trail = Math.round(W * (0.06 + k * 0.2))
    oc.save(); oc.beginPath(); oc.rect(lx - trail, 0, trail, H); oc.clip(); oc.translate(2 * lx, 0); oc.scale(-1, 1); oc.drawImage(scene, 0, 0); oc.restore()
    for (let i = 0; i < Math.round(3 + k * 10); i += 1) { const cw = Math.round(W * (0.004 + hash(state.seed, frame, i, 111) * 0.03)), cx = Math.round(lx - trail * 1.5 + hash(state.seed, frame, i, 112) * trail * 2.5); const dy = Math.round((hash(state.seed, frame, i, 113) - 0.5) * H * 0.3 * k); if (cx + cw > 0 && cx < W) oc.drawImage(scene, cx, 0, cw, H, cx, dy, cw, H) }
    for (let i = 0; i < Math.round(2 + k * 5); i += 1) { const fw = Math.round(W * (0.05 + hash(state.seed, i, 114) * 0.15)), fh = Math.round(H * (0.03 + hash(state.seed, i, 115) * 0.1)); const fx = Math.round(lx - trail + hash(state.seed, i, 116) * trail * 2 - fw / 2), fy = Math.round(hash(state.seed, i, 117) * (H - fh)); const src = hash(state.seed, i, 118) < 0.5 ? raw : matter; if (src) cover(oc, src, fx, fy, fw, fh, 1.5 + hash(state.seed, i, 119) * 2, hash(state.seed, i, 120), hash(state.seed, i, 121)) }
    oc.fillStyle = CREAM; oc.fillRect(lx, 0, 2 * px, H); oc.globalAlpha = 0.4; oc.fillRect(lx - 6 * px, 0, px, H); oc.globalAlpha = 1
  }

  const stateAt = (at: number) => { const index = states.findIndex((s) => at < s.to); return states[index === -1 ? states.length - 1 : index] }
  const frame = (ctx: CanvasRenderingContext2D, at: number, frameNo: number) => {
    const index = states.findIndex((s) => at < s.to)
    const state = states[index === -1 ? states.length - 1 : index]
    const residueOf = state.kind === 'residue' ? states[index - 1] ?? null : null
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = true
    drawScene(state, at, frameNo, residueOf)
    if (state.kind === 'burst') {
      if (state.burst === 'bands') burstBands(state, at, frameNo)
      else if (state.burst === 'rows') burstRows(state, at)
      else if (state.burst === 'feed') burstFeed(state, at)
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
