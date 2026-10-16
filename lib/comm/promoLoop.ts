/**
 * The promo: short films and stills that speak of Random itself, after the
 * owner's three references, built from the site's own things — the wordmark,
 * the brand block, the icons — and from stock videos and pictures under a
 * permissive licence, kept in their own colours.
 *
 * A film is a SEQUENCE OF COMPOSED SHOTS, not a machine throwing parameters:
 *   a tempo (beats per minute) and an energy curve — calm, build, climax, outro — decide
 *   which shots may come when, how long they last (in beats) and how they are joined;
 *   each shot is one idea with two or three elements at most: the brand clean; the letters as
 *   windows on the moving video; the video itself with a tear on the beat; a one-beat tear of
 *   bands; rows sliding that cut the letters; cards rushing; a line revealing the next shot; the
 *   wordmark zooming through; a text card; the vomit;
 *   the video and the pictures keep their colours — the palette (one main colour and up to two
 *   secondaries) is for the brand, the panels, the lines and the pill.
 * Every placement is relative to the format's SAFE AREA, so the same seed gives the same
 * composition in another format. One frame can be taken as a still at any moment.
 * Every number comes from a hash, so a seed gives the same film twice.
 */

import { recorderChoice } from './montage'

const CREAM = '#F8F5E6', DEEP = '#121210'
const SITE = 'GORANDOM.FUN'

const hash = (...n: number[]) => { let h = 2166136261; for (const v of n) { h ^= Math.floor(v * 1000) + 0x9e3779b9; h = Math.imul(h, 16777619) } return ((h >>> 0) % 100000) / 100000 }
const easeOut = (t: number) => 1 - (1 - t) * (1 - t)
const easeIn = (t: number) => t * t
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

// ----- the formats, with the part of the frame the platforms' interfaces leave clear
export type FormatKey = 'tiktok' | 'reel' | 'story' | 'feed' | 'square' | 'wide' | 'xbanner' | 'linkpreview' | 'videocover' | 'storycover' | 'profile'
export type Format = { key: FormatKey; name: string; w: number; h: number; kind: 'video' | 'image'; safe: { l: number; t: number; r: number; b: number }; round?: boolean; note: string }
export const FORMATS: Format[] = [
  { key: 'tiktok', name: 'TikTok 9:16', w: 1080, h: 1920, kind: 'video', safe: { l: 0.04, t: 0.12, r: 0.2, b: 0.3 }, note: 'la légende couvre le bas, les boutons la droite' },
  { key: 'reel', name: 'Reel 9:16', w: 1080, h: 1920, kind: 'video', safe: { l: 0.04, t: 0.14, r: 0.16, b: 0.26 }, note: 'légende en bas, boutons à droite' },
  { key: 'story', name: 'Story 9:16', w: 1080, h: 1920, kind: 'video', safe: { l: 0.04, t: 0.14, r: 0.04, b: 0.2 }, note: 'le nom en haut, la réponse en bas' },
  { key: 'feed', name: 'Fil 4:5', w: 1080, h: 1350, kind: 'video', safe: { l: 0.05, t: 0.05, r: 0.05, b: 0.05 }, note: 'le fil Instagram' },
  { key: 'square', name: 'Carré 1:1', w: 1080, h: 1080, kind: 'video', safe: { l: 0.05, t: 0.05, r: 0.05, b: 0.05 }, note: 'carré' },
  { key: 'wide', name: 'X 16:9', w: 1920, h: 1080, kind: 'video', safe: { l: 0.05, t: 0.05, r: 0.05, b: 0.08 }, note: 'paysage pour X' },
  { key: 'xbanner', name: 'Bannière X', w: 1500, h: 500, kind: 'image', safe: { l: 0.3, t: 0.08, r: 0.05, b: 0.1 }, note: 'la photo de profil couvre le bas gauche' },
  { key: 'linkpreview', name: 'Aperçu de lien', w: 1200, h: 630, kind: 'image', safe: { l: 0.06, t: 0.08, r: 0.06, b: 0.08 }, note: 'l’image des partages de gorandom.fun' },
  { key: 'videocover', name: 'Couverture vidéo', w: 1080, h: 1920, kind: 'image', safe: { l: 0.05, t: 0.22, r: 0.05, b: 0.22 }, note: 'la grille ne montre que le carré du milieu' },
  { key: 'storycover', name: 'Couverture story', w: 1080, h: 1920, kind: 'image', safe: { l: 0.18, t: 0.3, r: 0.18, b: 0.3 }, round: true, note: 'un rond au milieu' },
  { key: 'profile', name: 'Profil', w: 1080, h: 1080, kind: 'image', safe: { l: 0.12, t: 0.12, r: 0.12, b: 0.12 }, round: true, note: 'rond' },
]
export const formatOf = (key: FormatKey) => FORMATS.find((f) => f.key === key) ?? FORMATS[0]

// ----- the shots
export type ShotKind = 'block' | 'windows' | 'video' | 'tear' | 'rows' | 'feed' | 'sweep' | 'zoom' | 'card' | 'vomit'
export const SHOTS: Array<{ key: ShotKind; name: string; hint: string; energy: [number, number]; beats: [number, number] }> = [
  { key: 'block', name: 'Bloc', hint: 'la marque propre, qui respire, entre et sort', energy: [0, 0.55], beats: [2, 4] },
  { key: 'windows', name: 'Lettres-fenêtres', hint: 'les lettres ouvertes sur la vidéo qui bouge', energy: [0.2, 0.8], beats: [2, 4] },
  { key: 'video', name: 'Vidéo', hint: 'la vidéo dans ses couleurs, une déchirure sur le temps, la marque petite ou absente', energy: [0.25, 0.9], beats: [2, 4] },
  { key: 'tear', name: 'Déchirure', hint: 'un battement de bandes cassées faites de la vidéo et du plan d’avant', energy: [0.55, 1], beats: [1, 1] },
  { key: 'rows', name: 'Rangées', hint: 'la vidéo par rangées qui glissent, les lettres coupées avec', energy: [0.5, 1], beats: [2, 4] },
  { key: 'feed', name: 'Défilé', hint: 'des cartes de la vidéo qui filent, la carte de la marque parmi elles', energy: [0.4, 0.9], beats: [2, 4] },
  { key: 'sweep', name: 'Balayage', hint: 'une ligne qui révèle le plan suivant', energy: [0.3, 0.85], beats: [1, 2] },
  { key: 'zoom', name: 'Zoom', hint: 'le logo qui traverse en grossissant', energy: [0.45, 1], beats: [1, 2] },
  { key: 'card', name: 'Carton', hint: 'un carton de ton texte, un par ligne, dans l’ordre', energy: [0, 0.65], beats: [2, 4] },
  { key: 'vomit', name: 'Vomi', hint: 'un amas de fragments qui déborde et coule', energy: [0.65, 1], beats: [2, 4] },
]
export type BrandMode = 'center' | 'random' | 'deformed' | 'exploded'
export const BRAND_MODES: Array<{ key: BrandMode; name: string; hint: string }> = [
  { key: 'center', name: 'Centre', hint: 'la marque près du centre de la zone sûre' },
  { key: 'random', name: 'Aléatoire', hint: 'là où le tirage la met dans la zone sûre' },
  { key: 'deformed', name: 'Déformée', hint: 'étirée, cisaillée, en miroir, en mouvement' },
  { key: 'exploded', name: 'Éclatée', hint: 'elle s’assemble en arrivant et explose en partant' },
]

export type PromoText = { lines: string[]; size: number; align: 'left' | 'center' | 'right'; font: string; weight: number; x: number | null; y: number | null; width: number }
export type PromoIcon = { image: HTMLImageElement; x: number; y: number; size: number }
export type PromoInput = {
  format: FormatKey
  seconds: number
  intensity: number
  seed: number
  accent: string
  palette: string[]
  shots: ShotKind[]
  brandMode: BrandMode
  logo: HTMLImageElement
  logoVertical: HTMLImageElement
  logoDark: HTMLImageElement
  logoVerticalDark: HTMLImageElement
  icons: HTMLImageElement[]
  stock: HTMLImageElement[]
  /** Stock videos, playing, muted; drawn as they are. */
  videos: HTMLVideoElement[]
  titleFont: string
  text?: PromoText | null
  icon?: PromoIcon | null
}

type Treatment = 'cream' | 'accent' | 'second' | 'panel' | 'outline'
type Deform = 'none' | 'stretch' | 'skew' | 'mirror'
type Enter = 'none' | 'slide' | 'grow' | 'assemble' | 'flicker'
type Exit = 'none' | 'explode' | 'slide' | 'dissolve'
type Transition = 'cut' | 'slam' | 'tear' | 'flash'
export type Shot = {
  kind: ShotKind; from: number; to: number; seed: number; energy: number
  video: number; picture: number; card: number
  treat: Treatment; stacked: boolean; pill: boolean; hud: boolean
  bx: number; by: number; bw: number; deform: Deform; enter: Enter; exit: Exit
  transition: Transition
  /** True on the shot that follows a tear: its first beat keeps the letters filled and the blocks. */
  afterTear: boolean
  p: { a: number; b: number; c: number; d: number; e: number; f: number }
}

/** The energy along the film: calm, build, climax, outro; a bumper of three seconds goes straight up. */
export function energyAt(t: number, seconds: number, intensity: number): number {
  const k = clamp01(intensity)
  const base = seconds <= 3 ? 0.45 + t * 0.5 : t < 0.25 ? 0.12 + t * 0.6 : t < 0.5 ? 0.27 + (t - 0.25) * 1.8 : t < 0.8 ? 0.72 + (t - 0.5) * 0.9 : 0.95 - (t - 0.8) * 3.5
  return clamp01(base * (0.45 + k * 0.75))
}

/** The sequence: shots chosen by the energy of the moment, joined on the beat, the text cards in order, the brand to close. */
export function planShots(input: Pick<PromoInput, 'seconds' | 'intensity' | 'seed' | 'shots' | 'brandMode' | 'text'>, videos: number, pictures: number): { shots: Shot[]; beat: number } {
  const allowed = input.shots.length ? input.shots : SHOTS.map((s) => s.key)
  const cards = (input.text?.lines ?? []).filter((l) => l.trim()).length
  const bpm = 92 + hash(input.seed, 1) * 44
  const beat = 60000 / bpm
  const total = input.seconds * 1000
  const out: Shot[] = []
  let at = 0, i = 0, card = 0, last: ShotKind | null = null, video = Math.floor(hash(input.seed, 2) * Math.max(1, videos)), picture = Math.floor(hash(input.seed, 3) * Math.max(1, pictures))
  const treatments: Treatment[] = ['cream', 'cream', 'accent', 'second', 'panel', 'outline']
  let stacked = hash(input.seed, 4) < 0.6
  const closing = input.seconds >= 5 ? Math.round(beat * 2.5) : 0
  while (at < total - closing) {
    const s = input.seed * 23 + i * 131
    const t = at / total
    const e = energyAt(t, input.seconds, input.intensity)
    // A pending card takes its turn when the energy is low enough, now and then.
    let kind: ShotKind
    const left = total - closing - at
    const mustCard = card < cards && left < (cards - card + 1) * beat * 3
    if (card < cards && last !== 'card' && (mustCard || (e < 0.7 && hash(s, 5) < 0.6))) kind = 'card'
    else {
      const pool = SHOTS.filter((sh) => allowed.includes(sh.key) && sh.key !== last && sh.key !== 'card' && e >= sh.energy[0] - 0.12 && e <= sh.energy[1] + 0.12)
      const fallback = SHOTS.filter((sh) => allowed.includes(sh.key) && sh.key !== 'card')
      const from = pool.length ? pool : fallback.length ? fallback : SHOTS
      kind = from[Math.floor(hash(s, 6) * from.length)].key
    }
    const spec = SHOTS.find((sh) => sh.key === kind)!
    // Shorter at a high energy; a one-beat tear stays one beat.
    const beatsN = spec.beats[0] + Math.round(hash(s, 7) * (spec.beats[1] - spec.beats[0]) * (1 - e * 0.5))
    const len = Math.round(beat * beatsN)
    if (kind === 'card') card += 1
    if (hash(s, 8) < 0.5 && videos > 1) video = (video + 1 + Math.floor(hash(s, 9) * (videos - 1))) % videos
    if (hash(s, 10) < 0.5 && pictures > 1) picture = (picture + 1 + Math.floor(hash(s, 11) * (pictures - 1))) % pictures
    if (hash(s, 12) < 0.3) stacked = !stacked
    let treat = treatments[Math.floor(hash(s, 13) * treatments.length)]
    const mode = input.brandMode
    const bw = mode === 'center' ? 0.55 + hash(s, 14) * 0.2 : 0.4 + hash(s, 14) * 0.45
    const bx = mode === 'center' ? 0.42 + hash(s, 15) * 0.16 : 0.2 + hash(s, 15) * 0.6
    const by = mode === 'center' ? 0.4 + hash(s, 16) * 0.2 : 0.2 + hash(s, 16) * 0.6
    const deform: Deform = mode === 'deformed' || (mode === 'random' && hash(s, 17) < 0.5) ? (['stretch', 'skew', 'mirror'] as Deform[])[Math.floor(hash(s, 17) * 3)] : 'none'
    const enters: Enter[] = ['none', 'slide', 'grow', 'assemble', 'flicker'], exits: Exit[] = ['none', 'explode', 'slide', 'dissolve']
    const enter: Enter = mode === 'exploded' ? 'assemble' : i === 0 ? enters[1 + Math.floor(hash(s, 18) * 4)] : hash(s, 18) < 0.45 ? 'none' : enters[Math.floor(hash(s, 19) * 5)]
    const exit: Exit = mode === 'exploded' ? 'explode' : hash(s, 20) < 0.5 ? 'none' : exits[Math.floor(hash(s, 21) * 4)]
    if (mode === 'exploded' && treat === 'panel') treat = 'cream'
    const transition: Transition = i === 0 ? 'cut' : e > 0.7 && hash(s, 22) < 0.35 ? 'flash' : e > 0.6 && hash(s, 22) < 0.6 ? 'tear' : e > 0.45 && hash(s, 22) < 0.8 ? 'slam' : 'cut'
    out.push({ kind, from: at, to: Math.min(total - closing, at + len), seed: s, energy: e, video, picture, card: card - 1, treat, stacked, pill: hash(s, 23) < 0.6, hud: hash(s, 24) < 0.45, bx, by, bw, deform, enter, exit, transition, afterTear: last === 'tear' || last === 'vomit', p: { a: hash(s, 30), b: hash(s, 31), c: hash(s, 32), d: hash(s, 33), e: hash(s, 34), f: hash(s, 35) } })
    at += len; i += 1; last = kind
  }
  if (closing) {
    const s = input.seed * 23 + 9999
    out.push({ kind: 'block', from: total - closing, to: total, seed: s, energy: 0.25, video, picture, card: -1, treat: 'cream', stacked: hash(s, 4) < 0.6, pill: true, hud: false, bx: 0.5, by: 0.5, bw: 0.6, deform: 'none', enter: hash(s, 18) < 0.5 ? 'assemble' : 'grow', exit: 'none', transition: hash(s, 22) < 0.5 ? 'slam' : 'cut', afterTear: false, p: { a: hash(s, 30), b: hash(s, 31), c: hash(s, 32), d: hash(s, 33), e: hash(s, 34), f: hash(s, 35) } })
  }
  return { shots: out, beat }
}

/** A crop of a picture or video drawn to cover a rectangle. */
function cover(ctx: CanvasRenderingContext2D, src: CanvasImageSource, x: number, y: number, w: number, h: number, zoom = 1, fx = 0.5, fy = 0.5) {
  const sw = (src as HTMLVideoElement).videoWidth || (src as HTMLImageElement).naturalWidth || (src as HTMLCanvasElement).width || w
  const sh = (src as HTMLVideoElement).videoHeight || (src as HTMLImageElement).naturalHeight || (src as HTMLCanvasElement).height || h
  const scale = Math.max(w / sw, h / sh) * zoom
  const cw = w / scale, ch = h / scale
  ctx.drawImage(src, Math.max(0, Math.min(sw - cw, (sw - cw) * fx)), Math.max(0, Math.min(sh - ch, (sh - ch) * fy)), cw, ch, x, y, w, h)
}

export type Promo = { shots: Shot[]; beat: number; frame: (ctx: CanvasRenderingContext2D, atMs: number, frameNo: number) => void; shotAt: (atMs: number) => Shot }

/** The film at one size: its shots, and one function drawing any moment of it. The live preview, the recording and the stills share it. */
export function createPromo(input: PromoInput, W: number, H: number): Promo {
  const format = formatOf(input.format)
  const S = { x: Math.round(format.safe.l * W), y: Math.round(format.safe.t * H), w: Math.round((1 - format.safe.l - format.safe.r) * W), h: Math.round((1 - format.safe.t - format.safe.b) * H) }
  const accent = input.accent
  const seconds = input.palette.filter((c) => c && c.toLowerCase() !== accent.toLowerCase())
  const colourAt = (q: number) => q < 0.45 ? accent : q < 0.6 ? CREAM : seconds.length ? seconds[Math.floor(hash(q * 1000, 200) * seconds.length)] : accent
  const secondOf = (seed: number) => seconds.length ? seconds[Math.floor(hash(seed, 203) * seconds.length)] : accent
  const u = Math.min(W, H) / 1080
  const px = Math.max(1, Math.round(u))
  const font = input.titleFont
  const { shots, beat } = planShots(input, input.videos.length, input.stock.length)
  const make = (w = W, h = H) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }
  const scene = make(), scratch = make(), prev = make(), held = make(), pile = make()
  const sc = scene.getContext('2d')!, sx = scratch.getContext('2d')!, pv = prev.getContext('2d')!, hc = held.getContext('2d')!, pc = pile.getContext('2d')!
  let heldFor = -1, pileFor = -1

  // ----- sources, in their own colours
  const videoOf = (shot: Shot) => { const v = input.videos[shot.video % Math.max(1, input.videos.length)]; return v && v.readyState >= 2 ? v : null }
  const pictureOf = (shot: Shot) => input.stock[shot.picture % Math.max(1, input.stock.length)] ?? null
  const sourceOf = (shot: Shot): CanvasImageSource | null => videoOf(shot) ?? pictureOf(shot)
  const logoSize = (img: HTMLImageElement, w: number) => ({ w: Math.round(w), h: Math.round(w * img.naturalHeight / Math.max(1, img.naturalWidth)) })
  const tinted = (img: CanvasImageSource, colour: string, w: number, h: number) => {
    sx.clearRect(0, 0, W, H); sx.globalCompositeOperation = 'source-over'; sx.drawImage(img, 0, 0, w, h)
    sx.globalCompositeOperation = 'source-in'; sx.fillStyle = colour; sx.fillRect(0, 0, w, h); sx.globalCompositeOperation = 'source-over'
    return scratch
  }
  const pillAt = (ctx: CanvasRenderingContext2D, cx: number, y: number, width: number, alpha = 1) => {
    const w = Math.round(width), h = Math.round(w * 0.14), x = Math.round(cx - w / 2), r = h / 2
    ctx.globalAlpha = alpha
    ctx.fillStyle = accent; ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2); ctx.lineTo(x + r, y + h); ctx.arc(x + r, y + r, r, Math.PI / 2, -Math.PI / 2); ctx.closePath(); ctx.fill()
    ctx.fillStyle = CREAM; ctx.font = `700 ${Math.round(h * 0.5)}px ${font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(SITE, cx, y + h / 2)
    ctx.globalAlpha = 1
  }
  const hud = (ctx: CanvasRenderingContext2D, frame: number, at: number) => {
    ctx.save(); ctx.globalAlpha = 0.45; ctx.fillStyle = CREAM; ctx.font = `${Math.round(u * 20)}px ${font}`; ctx.textBaseline = 'top'; ctx.textAlign = 'left'
    ctx.fillText(`17:${String(13 + Math.floor(at / 1000)).padStart(2, '0')}  ${String(140 + (frame % 30)).padStart(3, '0')}`, S.x, S.y)
    ctx.textAlign = 'right'; ['F', 'R', 'N'].forEach((l, i) => ctx.fillText(l, S.x + S.w, S.y + Math.round(u * 40 * (1 + i))))
    ctx.strokeStyle = CREAM; ctx.lineWidth = px
    const l = Math.round(u * 40)
    for (const [cx, cy, dx, dy] of [[S.x, S.y, 1, 1], [S.x + S.w, S.y, -1, 1], [S.x, S.y + S.h, 1, -1], [S.x + S.w, S.y + S.h, -1, -1]] as const) { ctx.beginPath(); ctx.moveTo(cx, cy + dy * l); ctx.lineTo(cx, cy); ctx.lineTo(cx + dx * l, cy); ctx.stroke() }
    ctx.restore()
  }
  const hairline = (ctx: CanvasRenderingContext2D, seed: number, colour: string) => { ctx.fillStyle = colour; ctx.globalAlpha = 0.8; if (hash(seed, 106) < 0.5) ctx.fillRect(Math.round(hash(seed, 107) * W), 0, px, H); else ctx.fillRect(0, Math.round(hash(seed, 107) * H), W, px); ctx.globalAlpha = 1 }
  /** A band tear over a canvas: rows of the source and of the frame before, shifted; coverage and thickness given. */
  const tearBands = (ctx: CanvasRenderingContext2D, src: CanvasImageSource | null, before: HTMLCanvasElement, seed: number, step: number, coverage: number, thick: number, shift: number) => {
    const top = Math.round(hash(seed, step, 69) * H * (1 - coverage)), bottom = Math.min(H, top + Math.round(H * coverage))
    let y = top, i = 0
    while (y < bottom) {
      const bh = Math.max(2 * px, Math.round(H * (0.003 + hash(seed, step, i, 70) * thick)))
      const q = hash(seed, step, i, 72), dx = Math.round((hash(seed, step, i, 73) - 0.5) * W * shift)
      const stretch = 1 + hash(seed, step, i, 74) * (hash(seed, i, 75) < 0.3 ? 2.5 : 0.3)
      if (q < 0.4 && src) { const sw = (src as HTMLVideoElement).videoWidth || (src as HTMLImageElement).naturalWidth || W, sh = (src as HTMLVideoElement).videoHeight || (src as HTMLImageElement).naturalHeight || H; const sy = hash(seed, i, 76) * (sh - sh * bh / H); ctx.drawImage(src, 0, sy, sw / stretch, Math.max(1, sh * bh / H), dx, y, W, bh) }
      else if (q < 0.75) ctx.drawImage(before, 0, y, Math.round(W / stretch), bh, dx, y, W, bh)
      else if (q < 0.88) ctx.drawImage(ctx.canvas, 0, y, Math.round(W / stretch), bh, dx, y, W, bh)
      else { ctx.fillStyle = DEEP; ctx.fillRect(0, y, W, bh) }
      if (hash(seed, step, i, 78) < 0.12) { ctx.fillStyle = colourAt(hash(seed, i, 79)); ctx.fillRect(Math.round(hash(seed, i, 80) * W * 0.6), y, Math.round(W * (0.1 + hash(seed, i, 81) * 0.5)), Math.max(px, Math.round(bh * 0.3))) }
      y += bh; i += 1
    }
  }
  const fragment = (ctx: CanvasRenderingContext2D, shot: Shot, seed: number, x: number, y: number, w: number, h: number, alpha = 1) => {
    const src = sourceOf(shot)
    if (!src) { ctx.fillStyle = colourAt(hash(seed, 41)); ctx.globalAlpha = alpha * 0.6; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1; return }
    ctx.globalAlpha = alpha
    cover(ctx, src, x, y, w, h, 1.2 + hash(seed, 37) * 2.5, hash(seed, 38), hash(seed, 39))
    if (hash(seed, 40) < 0.25) { ctx.fillStyle = colourAt(hash(seed, 41)); ctx.globalAlpha = alpha * 0.35; ctx.fillRect(x, y, w, h) }
    ctx.globalAlpha = 1
  }

  // ----- the brand: placed in the safe area, breathing, entering and leaving, deformed or in pieces
  const brandRect = (shot: Shot, progress: number) => {
    const img = shot.stacked ? input.logoVertical : input.logo
    const maxW = S.w * shot.bw * (shot.stacked ? 0.9 : 1.2)
    let { w, h } = logoSize(img, Math.min(maxW, S.w * 0.96))
    if (h > S.h * 0.8) { const f = S.h * 0.8 / h; w = Math.round(w * f); h = Math.round(h * f) }
    const breathe = 1 + Math.sin(progress * Math.PI * 2 * (0.5 + hash(shot.seed, 60))) * 0.02
    const cx = S.x + shot.bx * S.w, cy = S.y + shot.by * S.h
    const x = Math.round(Math.max(S.x, Math.min(S.x + S.w - w, cx - w / 2))), y = Math.round(Math.max(S.y, Math.min(S.y + S.h - h, cy - h / 2)))
    return { img, x: Math.round(x - w * (breathe - 1) / 2), y: Math.round(y - h * (breathe - 1) / 2), w: Math.round(w * breathe), h: Math.round(h * breathe) }
  }
  const drawPieces = (ctx: CanvasRenderingContext2D, source: CanvasImageSource, x: number, y: number, w: number, h: number, sw: number, sh: number, seed: number, spread: number, time: number) => {
    const cols = 3, rows = 4, pw = Math.ceil(w / cols), ph = Math.ceil(h / rows)
    for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) {
      const ang = hash(seed, r, c, 214) * Math.PI * 2, dist = (0.15 + hash(seed, r, c, 215) * 0.5) * W * spread
      const wob = Math.sin(time / 600 + r * 1.3 + c * 0.7) * W * 0.01 * spread
      const rot = (hash(seed, r, c, 216) - 0.5) * Math.PI * spread * (hash(seed, r, c, 218) < 0.3 ? 1 : 0.15)
      ctx.save(); ctx.translate(x + c * pw + pw / 2 + Math.cos(ang) * dist + wob, y + r * ph + ph / 2 + Math.sin(ang) * dist * 0.7 + wob); ctx.rotate(rot)
      ctx.drawImage(source, c * pw * sw / w, r * ph * sh / h, pw * sw / w, ph * sh / h, -pw / 2, -ph / 2, pw, ph); ctx.restore()
    }
  }
  const drawBrandShape = (ctx: CanvasRenderingContext2D, source: CanvasImageSource, shot: Shot, x: number, y: number, w: number, h: number, sw: number, sh: number, at: number, spread: number) => {
    const s = shot.seed
    if (spread > 0.001) { drawPieces(ctx, source, x, y, w, h, sw, sh, s, spread, at); return }
    // In the exploded mode the pieces scatter for a few frames on strong beats and come back whole.
    if (input.brandMode === 'exploded') { const bi = Math.floor((at - shot.from) / beat), bp = ((at - shot.from) % beat) / beat, g = strengthOf(shot); if (bp < 0.2 && g > 0.45 && hash(s, bi, 341) < 0.7) { drawPieces(ctx, source, x, y, w, h, sw, sh, s + bi, 0.2 + g * 0.3, at); return } }
    // On the beat the shape jumps a size up for a few frames; in the deformed mode the deformation itself changes on the beat.
    const beatIndex = Math.floor((at - shot.from) / beat), beatPhase = ((at - shot.from) % beat) / beat
    if (beatPhase < 0.1 && strengthOf(shot) > 0.3) { const f = 1 + 0.06 * strengthOf(shot); const nw = Math.round(w * f), nh = Math.round(h * f); x = Math.round(x + w / 2 - nw / 2); y = Math.round(y + h / 2 - nh / 2); w = nw; h = nh }
    const deform: Deform = shot.deform === 'none' ? 'none' : (['none', 'stretch', 'skew', 'mirror'] as Deform[])[Math.floor(hash(s, beatIndex, 340) * 4)]
    switch (deform) {
      case 'stretch': { const fx = 1.15 + hash(s, 210) * 0.8 + Math.sin(at / 900) * 0.1, fy = 0.6 + hash(s, 211) * 0.4; const nw = Math.round(w * fx), nh = Math.round(h * fy); ctx.drawImage(source, 0, 0, sw, sh, Math.round(x + w / 2 - nw / 2), Math.round(y + h / 2 - nh / 2), nw, nh); break }
      case 'skew': { const sk = (hash(s, 212) - 0.5) * 0.9 + Math.sin(at / 700) * 0.15; ctx.save(); ctx.transform(1, 0, sk, 1, 0, 0); ctx.drawImage(source, 0, 0, sw, sh, x - Math.round(sk * (y + h / 2)), y, w, h); ctx.restore(); break }
      case 'mirror': { ctx.save(); ctx.translate(x + w, 0); ctx.scale(-1, 1); ctx.drawImage(source, 0, 0, sw, sh, 0, y, w, h); ctx.restore(); ctx.globalAlpha = 0.5; ctx.drawImage(source, 0, 0, sw, sh, x + Math.round(w * 0.05 * (1 + Math.sin(at / 500))), y, w, h); ctx.globalAlpha = 1; break }
      default: ctx.drawImage(source, 0, 0, sw, sh, x, y, w, h)
    }
  }
  /** The brand in its treatment with its hard shadow, with the shot's entrance and exit. */
  /** How hard the glitch hits at a moment: the shot's energy, scaled by the force. */
  const strengthOf = (shot: Shot) => clamp01(0.22 + shot.energy * (0.45 + clamp01(input.intensity) * 0.8))
  /** The letters torn, fringed in the theme's colours, partly filled with the video, jumping on the beat: the brand is never still. */
  const glitchBrand = (ctx: CanvasRenderingContext2D, shot: Shot, r: { x: number; y: number; w: number; h: number }, at: number, frame: number, boost = 0) => {
    const g = clamp01(strengthOf(shot) + boost)
    if (g <= 0.02) return
    const s = shot.seed
    const beatPhase = ((at - shot.from) % beat) / beat
    const x0 = Math.max(0, r.x - Math.round(W * 0.05)), y0 = Math.max(0, r.y - Math.round(H * 0.02)), w0 = Math.min(W - x0, r.w + Math.round(W * 0.1)), h0 = Math.min(H - y0, r.h + Math.round(H * 0.04))
    if (w0 <= 0 || h0 <= 0) return
    // Fringes in the theme's colours on the beat: the shape offset left and right, tinted, under itself.
    if (beatPhase < 0.3 && g > 0.25) {
      const off = Math.round(u * (3 + g * 10))
      sx.clearRect(0, 0, W, H); sx.globalCompositeOperation = 'source-over'; sx.drawImage(ctx.canvas, x0, y0, w0, h0, x0, y0, w0, h0)
      sx.globalCompositeOperation = 'source-in'; sx.fillStyle = accent; sx.fillRect(x0, y0, w0, h0); sx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 0.6; ctx.drawImage(scratch, x0, y0, w0, h0, x0 - off, y0, w0, h0)
      sx.globalCompositeOperation = 'source-in'; sx.fillStyle = secondOf(s); sx.fillRect(x0, y0, w0, h0); sx.globalCompositeOperation = 'source-over'
      ctx.drawImage(scratch, x0, y0, w0, h0, x0 + off, y0, w0, h0); ctx.globalAlpha = 1
    }
    // Slices of the shape thrown sideways, every frame at a high strength, on the beat otherwise.
    if (g > 0.6 || beatPhase < 0.2 || hash(frame, s, 300) < g * 0.3) {
      const n = Math.round(2 + g * 9)
      for (let i = 0; i < n; i += 1) { const sh = Math.max(2, Math.round(h0 * (0.02 + hash(s, frame, i, 301) * 0.12))), sy = y0 + Math.round(hash(s, frame, i, 302) * (h0 - sh)); ctx.drawImage(ctx.canvas, x0, sy, w0, sh, x0 + Math.round((hash(s, frame, i, 303) - 0.5) * w0 * (0.1 + g * 0.5)), sy, w0, sh) }
    }
    // Windows: parts of the letters filled with the video, on some frames; always in the beat after a tear.
    const src = sourceOf(shot)
    if (src && (boost > 0 || hash(Math.floor(at / 160), s, 304) < g * 0.45)) {
      const img = shot.stacked ? input.logoVertical : input.logo
      sx.clearRect(0, 0, W, H); sx.globalCompositeOperation = 'source-over'; sx.drawImage(img, r.x, r.y, r.w, r.h)
      sx.globalCompositeOperation = 'source-in'; cover(sx, src, r.x - Math.round(W * 0.1), r.y, r.w + Math.round(W * 0.2), r.h, 1.6, hash(s, 305), hash(s, 306)); sx.globalCompositeOperation = 'source-over'
      for (let i = 0; i < 1 + Math.round(g * 3); i += 1) { const fw = Math.round(r.w * (0.2 + hash(s, Math.floor(at / 160), i, 307) * 0.5)), fh = Math.round(r.h * (0.3 + hash(s, Math.floor(at / 160), i, 308) * 0.7)); const fx = Math.round(r.x + hash(s, Math.floor(at / 160), i, 309) * (r.w - fw)), fy = Math.round(r.y + hash(s, Math.floor(at / 160), i, 310) * (r.h - fh)); ctx.drawImage(scratch, fx, fy, fw, fh, fx, fy, fw, fh) }
    }
  }
  /** The whole frame treated: band tears, columns shifted, codec blocks, scanlines, the frame fringed on the beat, a thin interface. Never a naked picture. */
  const glitchFrame = (ctx: CanvasRenderingContext2D, shot: Shot, at: number, frame: number) => {
    const g = strengthOf(shot)
    const s = shot.seed, p = shot.p
    const beatIndex = Math.floor((at - shot.from) / beat), beatPhase = ((at - shot.from) % beat) / beat
    const src = sourceOf(shot)
    // A few rows torn every frame, more with the strength; a wider tear on the beat.
    const rows = Math.round(1 + g * 7)
    for (let i = 0; i < rows; i += 1) { const sh = Math.max(2, Math.round(H * (0.003 + hash(s, frame, i, 320) * 0.03))), sy = Math.round(hash(s, frame, i, 321) * (H - sh)); ctx.drawImage(ctx.canvas, 0, sy, W, sh, Math.round((hash(s, frame, i, 322) - 0.5) * W * (0.06 + g * 0.3)), sy, W, sh) }
    if (beatPhase < 0.12 && g > 0.3) tearBands(ctx, src, prev, s + beatIndex, frame, 0.15 + g * 0.5, 0.01 + p.b * 0.03, 0.2 + g * 0.4)
    // Columns shifted up or down, now and then.
    if (hash(Math.floor(at / 90), s, 323) < g * 0.6) for (let i = 0; i < 1 + Math.round(g * 3); i += 1) { const cw = Math.round(W * (0.01 + hash(s, frame, i, 324) * 0.08)), cx = Math.round(hash(s, Math.floor(at / 90), i, 325) * (W - cw)); ctx.drawImage(ctx.canvas, cx, 0, cw, H, cx, Math.round((hash(s, frame, i, 326) - 0.5) * H * 0.2 * g), cw, H) }
    // Codec blocks: on some beats, blocks copied from elsewhere or shifted, in the picture's own colours.
    if (p.c < 0.5 && beatIndex % 2 === 0 && g > 0.4) {
      const B = Math.round(Math.min(W, H) / 14), cols = Math.ceil(W / B), rowsN = Math.ceil(H / B), step = Math.floor(at / 110)
      pv.drawImage(ctx.canvas, 0, 0)
      for (let by = 0; by < rowsN; by += 1) for (let bx = 0; bx < cols; bx += 1) { const q = hash(s, step, bx, by, 327); if (q < g * 0.12) ctx.drawImage(prev, Math.floor(hash(s, step, bx, by, 328) * cols) * B, Math.max(0, Math.min(rowsN - 1, by + Math.round((hash(s, step, bx, by, 329) - 0.5) * 4))) * B, B, B, bx * B, by * B, B, B); else if (q < g * 0.2) ctx.drawImage(prev, bx * B, by * B, B, B, bx * B + Math.round((hash(s, step, bx, by, 330) - 0.5) * 4) * B, by * B, B, B) }
    }
    // Scanlines and a rolling bar on some shots; the frame fringed in the theme's colours on the beat.
    if (p.d < 0.3 && g > 0.55) { ctx.fillStyle = DEEP; ctx.globalAlpha = 0.15; for (let y = 0; y < H; y += 3 * px) ctx.fillRect(0, y, W, px); ctx.globalAlpha = 0.06; ctx.fillStyle = CREAM; ctx.fillRect(0, Math.round(((at * 0.3) % (H * 1.2)) - H * 0.1), W, Math.round(H * 0.06)); ctx.globalAlpha = 1 }
    if (beatPhase < 0.1 && g > 0.5) { const off = Math.round(u * (2 + g * 6)); ctx.globalAlpha = 0.35; ctx.drawImage(ctx.canvas, -off, 0); ctx.globalAlpha = 1 }
    // Hairlines in the palette, now and then; the thin interface on the shots that carry it.
    if (hash(Math.floor(at / 200), s, 331) < g * 0.5) hairline(ctx, s + Math.floor(at / 200), colourAt(hash(s, Math.floor(at / 200), 332)))
    if (shot.hud) hud(ctx, frame, at)
  }
  const drawBrand = (ctx: CanvasRenderingContext2D, shot: Shot, at: number, frame: number, scale = 1, forcePlace?: { x: number; y: number; w: number; h: number }) => {
    const progress = clamp01((at - shot.from) / Math.max(1, shot.to - shot.from))
    const r = forcePlace ?? brandRect(shot, progress)
    const img = (r as { img?: HTMLImageElement }).img ?? (shot.stacked ? input.logoVertical : input.logo)
    const dark = shot.stacked ? input.logoVerticalDark : input.logoDark
    const sw = img.naturalWidth, sh = img.naturalHeight
    const s = shot.seed
    let ex = r.x, ey = r.y, ew = Math.round(r.w * scale), eh = Math.round(r.h * scale), spread = 0, visible = true, alpha = 1
    if (scale !== 1) { ex = Math.round(r.x + r.w / 2 - ew / 2); ey = Math.round(r.y + r.h / 2 - eh / 2) }
    // The entrance takes a fifth of the shot, the exit an eighth: the frame is never left empty for long.
    const enterLen = 0.2, exitLen = 0.12
    if (shot.enter !== 'none' && progress < enterLen) {
      const t = easeOut(progress / enterLen)
      if (shot.enter === 'slide') ex = Math.round(ex + (hash(s, 80) < 0.5 ? -1 : 1) * (1 - t) * W * 1.2)
      else if (shot.enter === 'grow') { const f = 2.6 - 1.6 * t; const nw = Math.round(ew * f), nh = Math.round(eh * f); ex = Math.round(ex + ew / 2 - nw / 2); ey = Math.round(ey + eh / 2 - nh / 2); ew = nw; eh = nh }
      else if (shot.enter === 'assemble') spread = 1 - t
      else if (shot.enter === 'flicker') visible = hash(frame, s, 81) < 0.3 + t * 0.7
    }
    if (shot.exit !== 'none' && progress > 1 - exitLen) {
      const t = easeIn((progress - (1 - exitLen)) / exitLen)
      if (shot.exit === 'explode') spread = t * 1.4
      else if (shot.exit === 'slide') ex = Math.round(ex + (hash(s, 82) < 0.5 ? -1 : 1) * t * W * 1.2)
      else if (shot.exit === 'dissolve') alpha = 1 - t
    }
    if (!visible) return
    const second = secondOf(s)
    const shx = Math.round(u * (8 + hash(s, 83) * 12)), shy = Math.round(u * (5 + hash(s, 84) * 8))
    ctx.globalAlpha = alpha * 0.9
    if (shot.treat !== 'panel' && shot.treat !== 'outline') drawBrandShape(ctx, tinted(img, hash(s, 85) < 0.7 ? DEEP : second, ew, eh), shot, ex + shx, ey + shy, ew, eh, ew, eh, at, spread)
    ctx.globalAlpha = alpha
    switch (shot.treat) {
      case 'accent': drawBrandShape(ctx, tinted(img, accent, ew, eh), shot, ex, ey, ew, eh, ew, eh, at, spread); break
      case 'second': drawBrandShape(ctx, tinted(img, second, ew, eh), shot, ex, ey, ew, eh, ew, eh, at, spread); break
      case 'panel': { ctx.fillStyle = hash(s, 204) < 0.6 ? accent : second; ctx.fillRect(0, Math.round(ey - H * 0.03), W, Math.round(eh + H * 0.06)); drawBrandShape(ctx, dark, shot, ex, ey, ew, eh, sw, sh, at, spread); break }
      case 'outline': { ctx.drawImage(tinted(img, hash(s, 205) < 0.6 ? accent : second, ew, eh), 0, 0, ew, eh, ex - 2 * px, ey - 2 * px, ew + 4 * px, eh + 4 * px); ctx.drawImage(dark, ex, ey, ew, eh); break }
      default: drawBrandShape(ctx, img, shot, ex, ey, ew, eh, sw, sh, at, spread)
    }
    ctx.globalAlpha = 1
    if (shot.pill && spread < 0.2 && alpha > 0.5 && !forcePlace) pillAt(ctx, ex + ew / 2, Math.round(ey + eh + H * 0.025), Math.max(S.w * 0.35, ew * 0.7), alpha)
    if (spread < 0.2 && alpha > 0.3) glitchBrand(ctx, shot, { x: ex, y: ey, w: ew, h: eh }, at, frame, shot.afterTear ? 0.4 : 0)
  }
  /** The curator's words: one card's line, big, in the safe area or where the curator put them. */
  const drawCard = (ctx: CanvasRenderingContext2D, shot: Shot, at: number) => {
    const t = input.text
    const line = t?.lines[shot.card]?.trim()
    if (!t || !line) return
    const progress = clamp01((at - shot.from) / Math.max(1, shot.to - shot.from))
    const size = Math.round(t.size * u * 1.25)
    ctx.font = `${t.weight} ${size}px ${t.font}`; ctx.textBaseline = 'top'; ctx.textAlign = t.align
    const maxW = (t.x === null ? S.w : t.width * W)
    const lines: string[] = []
    let cur = ''
    for (const w of line.split(/\s+/)) { const next = cur ? `${cur} ${w}` : w; if (ctx.measureText(next).width > maxW && cur) { lines.push(cur); cur = w } else cur = next }
    lines.push(cur)
    const blockH = lines.length * size * 1.1
    const left = t.x === null ? S.x : t.x * W, top = t.y === null ? Math.round(S.y + S.h / 2 - blockH / 2) : Math.round(t.y * H)
    const x = Math.round(left + (t.align === 'center' ? maxW / 2 : t.align === 'right' ? maxW : 0))
    // The letters come one after another over the first beat.
    const shown = Math.ceil(line.length * Math.min(1, progress / Math.min(0.5, beat / Math.max(1, shot.to - shot.from))))
    let count = 0
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, Math.round(size * 0.12)); ctx.strokeStyle = DEEP
    lines.forEach((l, i) => { const part = l.slice(0, Math.max(0, shown - count)); count += l.length + 1; const y = top + i * Math.round(size * 1.1); ctx.strokeText(part, x, y); ctx.fillStyle = CREAM; ctx.fillText(part, x, y) })
  }

  /** The back plane: deep, with large dark fragments of the video drifting — the picture as matter, never as a quiet ground. */
  const backPlane = (ctx: CanvasRenderingContext2D, shot: Shot, at: number, density: number) => {
    const src = sourceOf(shot)
    ctx.fillStyle = DEEP; ctx.fillRect(0, 0, W, H)
    if (!src) return
    const s = shot.seed, g = strengthOf(shot)
    const n = Math.round((2 + g * 8) * density)
    for (let i = 0; i < n; i += 1) {
      const fw = Math.round(W * (0.12 + hash(s, i, 71) * 0.45)), fh = Math.round(H * (0.015 + hash(s, i, 72) * 0.1))
      const vx = (hash(s, i, 73) - 0.5) * W * 0.0002 * (1 + g), vy = (hash(s, i, 74) - 0.5) * H * 0.00005
      const fx = Math.round(hash(s, i, 75) * (W - fw) + vx * (at - shot.from)), fy = Math.round(hash(s, i, 76) * (H - fh) + vy * (at - shot.from))
      ctx.globalAlpha = 0.3 + g * 0.35
      cover(ctx, src, fx, fy, fw, fh, 1.5 + hash(s, i, 77) * 2, hash(s, i, 78), hash(s, i, 79))
      if (hash(s, i, 80) < 0.3) { ctx.fillStyle = colourAt(hash(s, i, 81)); ctx.globalAlpha = 0.25; ctx.fillRect(fx, fy, fw, fh) }
    }
    ctx.globalAlpha = 1
  }
  /** The video torn to pieces over deep: bands with gaps, blocks — visible only as corruption. */
  const tornVideo = (ctx: CanvasRenderingContext2D, shot: Shot, at: number, frame: number) => {
    const src = sourceOf(shot)
    const s = shot.seed, g = strengthOf(shot), p = shot.p
    backPlane(ctx, shot, at, 0.5)
    if (!src) return
    const step = Math.floor(at / (50 + p.f * 80))
    for (let i = 0; i < 2 + Math.round(g * 4); i += 1) { const bw = Math.round(W * (0.25 + hash(s, step, i, 90) * 0.5)), bh = Math.round(H * (0.08 + hash(s, step, i, 91) * 0.25)); fragment(ctx, shot, s * 17 + step * 3 + i, Math.round(hash(s, step, i, 92) * (W - bw)), Math.round(hash(s, step, i, 93) * (H - bh)), bw, bh, 0.9) }
    tearBands(ctx, src, prev, s + step, frame, 0.35 + g * 0.5, 0.012 + p.b * 0.04, 0.25 + g * 0.4)
  }
  /** The constant line of words: cream with a deep outline, at the curator's place or at the foot of the safe area, jumping on strong beats. */
  const drawWords = (ctx: CanvasRenderingContext2D, shot: Shot, at: number) => {
    const t = input.text
    const line = t?.lines[0]?.trim()
    if (!t || !line) return
    const size = Math.round(t.size * u)
    ctx.font = `${t.weight} ${size}px ${t.font}`; ctx.textBaseline = 'top'; ctx.textAlign = t.align
    const maxW = t.x === null ? S.w : t.width * W
    const lines: string[] = []
    let cur = ''
    for (const w of line.split(/\s+/)) { const next = cur ? `${cur} ${w}` : w; if (ctx.measureText(next).width > maxW && cur) { lines.push(cur); cur = w } else cur = next }
    lines.push(cur)
    const blockH = lines.length * size * 1.1
    const left = t.x === null ? S.x : t.x * W, top = t.y === null ? Math.round(S.y + S.h - blockH) : Math.round(t.y * H)
    const x = Math.round(left + (t.align === 'center' ? maxW / 2 : t.align === 'right' ? maxW : 0))
    const g = strengthOf(shot), beatPhase = ((at - shot.from) % beat) / beat
    const jx = beatPhase < 0.1 && g > 0.5 ? Math.round((hash(Math.floor(at / 40), 350) - 0.5) * W * 0.04) : 0
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, Math.round(size * 0.12)); ctx.strokeStyle = DEEP
    lines.forEach((l, i) => { const y = top + i * Math.round(size * 1.1); ctx.strokeText(l, x + jx, y); ctx.fillStyle = CREAM; ctx.fillText(l, x + jx, y) })
  }

  // ----- the shots
  const drawShot = (ctx: CanvasRenderingContext2D, shot: Shot, at: number, frame: number) => {
    const s = shot.seed, p = shot.p
    const progress = clamp01((at - shot.from) / Math.max(1, shot.to - shot.from))
    const src = sourceOf(shot)
    const beatIndex = Math.floor((at - shot.from) / beat), beatPhase = ((at - shot.from) % beat) / beat
    ctx.fillStyle = DEEP; ctx.fillRect(0, 0, W, H)
    switch (shot.kind) {
      case 'block': {
        // The brand alone, over deep, or over the video dimmed when the energy allows.
        backPlane(ctx, shot, at, p.a < 0.6 ? 1 : 0.3)
        drawBrand(ctx, shot, at, frame)
        if (p.b < 0.4 && beatPhase < 0.08) hairline(ctx, s + beatIndex, colourAt(p.c))
        break
      }
      case 'windows': {
        // The letters open on the moving video; a faint outline of them around; the video dim behind at a high energy.
        backPlane(ctx, shot, at, 0.4)
        const r = brandRect(shot, progress)
        sx.clearRect(0, 0, W, H); sx.globalCompositeOperation = 'source-over'; sx.drawImage(r.img, r.x, r.y, r.w, r.h)
        sx.globalCompositeOperation = 'source-in'
        if (src) cover(sx, src, r.x - Math.round(W * 0.2 * progress * (p.a - 0.5)), r.y, r.w + Math.round(W * 0.2), r.h, 1.3 + p.b); else { sx.fillStyle = accent; sx.fillRect(0, 0, W, H) }
        sx.globalCompositeOperation = 'source-over'
        ctx.drawImage(tinted(r.img, hash(s, 85) < 0.6 ? DEEP : secondOf(s), r.w, r.h), 0, 0, r.w, r.h, r.x + Math.round(u * 10), r.y + Math.round(u * 6), r.w, r.h)
        sx.clearRect(0, 0, W, H); sx.drawImage(r.img, r.x, r.y, r.w, r.h); sx.globalCompositeOperation = 'source-in'
        if (src) cover(sx, src, r.x - Math.round(W * 0.2 * progress * (p.a - 0.5)), r.y, r.w + Math.round(W * 0.2), r.h, 1.3 + p.b); else { sx.fillStyle = accent; sx.fillRect(0, 0, W, H) }
        sx.globalCompositeOperation = 'source-over'
        ctx.drawImage(scratch, 0, 0)
        if (shot.pill) pillAt(ctx, r.x + r.w / 2, Math.round(r.y + r.h + H * 0.025), Math.max(S.w * 0.35, r.w * 0.7))
        break
      }
      case 'video': {
        // The video only as corruption: blocks and bands over deep, flickering; the brand over it.
        tornVideo(ctx, shot, at, frame)
        void beatIndex
        // The brand over it, never absent: in a corner of the safe area, or where the shot puts it.
        if (p.d < 0.5) { const corner = Math.floor(p.e * 4); const { w, h } = logoSize(input.logo, S.w * 0.5); const x = corner % 2 ? S.x + S.w - w : S.x, y = corner < 2 ? S.y : S.y + S.h - h; drawBrand(ctx, { ...shot, bw: 0.5, pill: false, enter: 'none', exit: 'none' }, at, frame, 1, { x, y, w, h }) }
        else drawBrand(ctx, { ...shot, enter: 'none' }, at, frame)
        break
      }
      case 'tear': {
        // One beat of bands made of the video and of the frame before, the whole frame or a part by the energy, flickering.
        ctx.drawImage(held, 0, 0)
        tearBands(ctx, src, held, s, frame, 0.5 + shot.energy * 0.5 * p.a, 0.012 + p.b * 0.04, 0.3 + shot.energy * 0.5)
        break
      }
      case 'rows': {
        // The scene (video dim + brand) cut in rows that slide at their own speeds; pieces of the video ride along.
        backPlane(ctx, shot, at, 0.6)
        drawBrand(ctx, { ...shot, enter: 'none', exit: 'none' }, at, frame)
        sc.drawImage(ctx.canvas, 0, 0)
        ctx.fillStyle = DEEP; ctx.fillRect(0, 0, W, H)
        const rows = 4 + Math.round(p.a * 5), rh = Math.ceil(H / rows), local = at - shot.from
        for (let r = 0; r < rows; r += 1) {
          const y = r * rh
          const speed = (hash(s, r, 83) - 0.5) * W * (0.25 + shot.energy * 0.9) / 1000
          const base = Math.round(hash(s, r, 84) * W + speed * local)
          const rowShift = ((base % W) + W) % W - Math.round(W * 0.5)
          ctx.drawImage(scene, 0, y, W, rh, rowShift, y, W, rh)
          const pieces = Math.round(hash(s, r, 85) * (1 + shot.energy * 2))
          for (let q = 0; q < pieces; q += 1) {
            const pw = Math.round(W * (0.1 + hash(s, r, q, 86) * 0.3)), ph = Math.round(rh * (0.5 + hash(s, r, q, 87) * 0.5))
            const px0 = (((base + Math.round(hash(s, r, q, 88) * W)) % (W + pw)) + W + pw) % (W + pw) - pw
            fragment(ctx, shot, s * 11 + r * 13 + q, px0, y + Math.round(hash(s, r, q, 89) * (rh - ph)), pw, ph)
            if (hash(s, r, q, 95) < 0.5) { ctx.strokeStyle = hash(s, r, q, 96) < 0.5 ? CREAM : DEEP; ctx.lineWidth = px; ctx.strokeRect(px0 + 0.5, y + 0.5, pw - 1, ph - 1) }
          }
          if (hash(s, r, 97) < 0.3) { ctx.fillStyle = colourAt(hash(s, r, 98)); ctx.fillRect(0, y + rh - px, W, px) }
        }
        break
      }
      case 'feed': {
        // Cards of the video rushing up or down, the brand's card among them; the trail of the speed.
        const local = at - shot.from
        const cw = Math.round(Math.min(W, H) * (0.4 + p.a * 0.3)), ch = Math.round(cw * (0.8 + p.b * 0.6)), gap = Math.round(H * 0.03)
        const cx = Math.round((W - cw) / 2 + (p.c - 0.5) * W * 0.3)
        const dir = p.d < 0.6 ? 1 : -1
        const speed = H * (0.9 + shot.energy * 1.8) / 1000
        const offset = (local * speed) % (ch + gap)
        for (let i = -1; i < Math.ceil(H / (ch + gap)) + 1; i += 1) {
          const y = Math.round(dir > 0 ? i * (ch + gap) - offset : H - (i + 1) * (ch + gap) + offset)
          if (hash(s, i, 103) < 0.3) { ctx.fillStyle = DEEP; ctx.fillRect(cx, y, cw, ch); const { w, h } = logoSize(input.logo, cw * 0.8); drawBrand(ctx, { ...shot, pill: false, enter: 'none', exit: 'none', deform: 'none' }, at, frame, 1, { x: cx + Math.round(cw * 0.1), y: y + Math.round(ch / 2 - h / 2), w, h }) }
          else fragment(ctx, shot, s * 7 + i, cx, y, cw, ch)
          ctx.strokeStyle = CREAM; ctx.lineWidth = px; ctx.strokeRect(cx - 2 * px + 0.5, y - 2 * px + 0.5, cw + 4 * px, ch + 4 * px)
          ctx.strokeStyle = colourAt(hash(s, i, 107)); ctx.strokeRect(cx + 2 * px + 0.5, y + 2 * px + 0.5, cw - 4 * px, ch - 4 * px)
        }
        ctx.globalAlpha = 0.3; ctx.drawImage(ctx.canvas, 0, -dir * Math.round(ch * 0.12)); ctx.globalAlpha = 1
        break
      }
      case 'sweep': {
        // A line crosses; behind it the video (or the brand over it), ahead of it the frame before; columns near it shifted.
        tornVideo(ctx, shot, at, frame)
        if (p.a < 0.5) drawBrand(ctx, { ...shot, enter: 'none', exit: 'none' }, at, frame)
        const lx = Math.round((p.b < 0.5 ? progress : 1 - progress) * W)
        ctx.save(); ctx.beginPath(); if (p.b < 0.5) ctx.rect(lx, 0, W - lx, H); else ctx.rect(0, 0, lx, H); ctx.clip(); ctx.drawImage(held, 0, 0); ctx.restore()
        for (let i = 0; i < Math.round(3 + shot.energy * 8); i += 1) { const cw = Math.round(W * (0.004 + hash(s, frame, i, 111) * 0.025)), cx = Math.round(lx - W * 0.1 + hash(s, frame, i, 112) * W * 0.2); const dy = Math.round((hash(s, frame, i, 113) - 0.5) * H * 0.25 * shot.energy); if (cx + cw > 0 && cx < W) ctx.drawImage(ctx.canvas, cx, 0, cw, H, cx, dy, cw, H) }
        ctx.fillStyle = hash(s, 118) < 0.7 ? CREAM : colourAt(p.c); ctx.fillRect(lx, 0, 2 * px, H); ctx.globalAlpha = 0.4; ctx.fillRect(lx - 6 * px, 0, px, H); ctx.globalAlpha = 1
        break
      }
      case 'zoom': {
        // The wordmark grows through the frame, from small to past its edges, over the video dim.
        backPlane(ctx, shot, at, 0.7)
        const f = 0.25 + easeIn(progress) * 4
        drawBrand(ctx, { ...shot, pill: false, enter: 'none', exit: 'none', deform: 'none', bx: 0.5, by: 0.5 }, at, frame, f)
        if (progress > 0.7) tearBands(ctx, src, prev, s + frame, frame, 0.3, 0.02, 0.3)
        break
      }
      case 'card': {
        // A panel in a palette colour, or the video dim; the card's line, letter by letter; the brand small if room.
        if (p.a < 0.55) { ctx.fillStyle = hash(s, 204) < 0.6 ? accent : secondOf(s); ctx.fillRect(0, 0, W, H) }
        else backPlane(ctx, shot, at, 0.8)
        drawCard(ctx, shot, at)
        if (p.b < 0.5) { const { w, h } = logoSize(input.logo, S.w * 0.28); drawBrand(ctx, { ...shot, treat: p.a < 0.55 ? 'cream' : shot.treat, pill: false, enter: 'none', exit: 'none', deform: 'none' }, at, frame, 1, { x: S.x + S.w - w, y: S.y + S.h - h, w, h }) }
        break
      }
      case 'vomit': {
        // The pile growing from a point, pouring in its direction, over the video dim and the brand; it drips and tears.
        backPlane(ctx, shot, at, 0.5)
        drawBrand(ctx, { ...shot, enter: 'none', exit: 'none' }, at, frame)
        if (pileFor !== s) { pileFor = s; pc.clearRect(0, 0, W, H) }
        const ox = W * (0.15 + p.a * 0.7), oy = H * (0.1 + p.b * 0.6)
        const ang = p.c < 0.6 ? Math.PI / 2 : p.c < 0.75 ? -Math.PI / 2 : p.c < 0.88 ? 0 : Math.PI
        const pace = 0.5 + p.d
        const n = Math.round((4 + shot.energy * 12) * (0.5 + p.e))
        for (let i = 0; i < n; i += 1) {
          const spread = (0.1 + progress * 0.9) * pace
          const fw = Math.round(W * (0.03 + hash(s, frame, i, 132) * 0.2)), fh = Math.round(H * (0.004 + hash(s, frame, i, 133) * 0.05))
          const along = hash(s, frame, i, 135) * spread, across = (hash(s, frame, i, 134) - 0.5) * spread * 0.7
          fragment(pc, shot, s * 13 + frame * 7 + i, Math.round(ox + Math.cos(ang) * along * H * 0.9 - Math.sin(ang) * across * W - fw / 2), Math.round(oy + Math.sin(ang) * along * H * 0.9 + Math.cos(ang) * across * W - fh / 2), fw, fh)
        }
        const drip = Math.round((2 + shot.energy * 5) * pace) * px
        pc.globalAlpha = 0.6; pc.drawImage(pile, Math.round(Math.cos(ang) * drip), Math.round(Math.sin(ang) * drip)); pc.globalAlpha = 1
        for (let i = 0; i < Math.round(1 + shot.energy * 4); i += 1) { const sy = Math.round(hash(s, frame, i, 143) * H), sh2 = Math.round(H * (0.004 + hash(s, frame, i, 144) * 0.03)); pc.drawImage(pile, 0, sy, W, sh2, Math.round((hash(s, frame, i, 145) - 0.5) * W * 0.3), sy, W, sh2) }
        ctx.drawImage(pile, 0, 0)
        break
      }
    }
    // The frame treated whatever the shot: nothing leaves naked.
    if (shot.kind !== 'tear') glitchFrame(ctx, shot, at, frame)
    // The join at the head of the shot: a slam of colour, a tear of the frame before, a flash.
    const head = at - shot.from
    if (head < beat * 0.18 && shot.transition !== 'cut') {
      const t = head / (beat * 0.18)
      if (shot.transition === 'slam') { ctx.fillStyle = hash(s, 150) < 0.5 ? accent : secondOf(s); ctx.globalAlpha = 1 - t; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1 }
      else if (shot.transition === 'tear') tearBands(ctx, src, held, s + 1, frame, 0.6 * (1 - t), 0.03, 0.4)
      else { ctx.fillStyle = CREAM; ctx.globalAlpha = (1 - t) * 0.8; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1 }
    }
    // One line of words stays on the whole film, where the curator put it or at the foot of the safe area; several lines come as cards.
    if (input.text && input.text.lines.length === 1 && shot.kind !== 'card') drawWords(ctx, shot, at)
    if (input.icon) ctx.drawImage(input.icon.image, Math.round(input.icon.x * W), Math.round(input.icon.y * H), Math.round(input.icon.size * u), Math.round(input.icon.size * u))
  }

  const shotAt = (at: number) => { const index = shots.findIndex((s) => at < s.to); return shots[index === -1 ? shots.length - 1 : index] }
  const frame = (ctx: CanvasRenderingContext2D, at: number, frameNo: number) => {
    const shot = shotAt(at)
    // The frame before this shot began, kept for the tears and the sweep.
    if (heldFor !== shot.seed) { heldFor = shot.seed; hc.drawImage(prev, 0, 0) }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = true
    drawShot(ctx, shot, at, frameNo)
    pv.drawImage(ctx.canvas, 0, 0)
  }
  return { shots, beat, frame, shotAt }
}

/** The film recorded as an MP4 (Chrome, Edge) at the format's size, drawn live into the preview as it goes. */
export async function recordPromo(input: PromoInput, preview?: HTMLCanvasElement | null, onProgress?: (p: number) => void): Promise<{ blob: Blob; extension: 'mp4' | 'webm' }> {
  const choice = recorderChoice((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t))
  if (!choice) throw new Error('Ce navigateur n’enregistre pas de vidéo : Chrome ou Edge sur ordinateur.')
  const format = formatOf(input.format)
  const W = format.w, H = format.h
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

/** One frame of the film at a moment, as a PNG at the format's size: a banner, a cover, a profile picture. */
export async function renderStill(input: PromoInput, atMs: number): Promise<Blob> {
  const format = formatOf(input.format)
  const work = document.createElement('canvas'); work.width = format.w; work.height = format.h
  const ctx = work.getContext('2d')!
  const promo = createPromo(input, format.w, format.h)
  // The frames before are drawn too, so the tears and the sweep have something to hold.
  for (let t = Math.max(0, atMs - 400); t < atMs; t += 40) promo.frame(ctx, t, Math.floor(t / 33))
  promo.frame(ctx, atMs, Math.floor(atMs / 33))
  const blob = await new Promise<Blob | null>((resolve) => work.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('PNG')
  return blob
}
