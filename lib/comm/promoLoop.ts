/**
 * The promo: short films and stills that speak of Random itself, after the
 * owner's three references and the site's own glitch, built from the wordmark,
 * the brand block, the icons, and from stock videos and pictures under a
 * permissive licence that never read as a background: ultra-zoomed into an
 * abstract texture, or cut into small framed pieces, or shown through letters.
 *
 * The language, kept fine:
 *   nothing changes every frame — the glitch moves by STEPS of 90 to 260 ms, slower when
 *   the moment is calm, so it never flickers; no flash, no white frame;
 *   the range is compressed — a calm moment still has fine lines, a few small pieces of the
 *   picture and the brand breathing; a strong moment is dense but never the whole frame torn;
 *   nothing stands behind the letters — no shadow, no offset shape, no panel; an outline is a
 *   real outline; depth comes from the planes (fine pieces behind, the brand, pieces in front);
 *   the letters open on the picture by DISPLACEMENT — the same zoomed picture, shifted a little
 *   inside the letters — or as an outline, or filled; the giant text the same way.
 * A film is a sequence of composed shots on a tempo with an energy curve; every placement is
 * relative to the format's safe area, so a change of format keeps the composition; a still can
 * be taken at any moment. Every number comes from a hash, so a seed gives the same film twice.
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
export type ShotKind = 'block' | 'windows' | 'video' | 'tear' | 'rows' | 'feed' | 'sweep' | 'zoom' | 'card' | 'vomit' | 'textbig'
export const SHOTS: Array<{ key: ShotKind; name: string; hint: string; energy: [number, number]; beats: [number, number] }> = [
  { key: 'block', name: 'Bloc', hint: 'la marque, qui respire, entre et sort, avec les fines pièces de la Home autour', energy: [0, 0.6], beats: [2, 4] },
  { key: 'windows', name: 'Lettres-fenêtres', hint: 'l’image ultra-zoomée, et la même image décalée dans les lettres ; ou un contour seul ; ou les lettres remplies', energy: [0.15, 0.85], beats: [2, 4] },
  { key: 'video', name: 'Vidéo', hint: 'la vidéo zoomée jusqu’à l’abstrait, qui dérive, la marque dessus', energy: [0.2, 0.9], beats: [2, 4] },
  { key: 'tear', name: 'Déchirure', hint: 'un battement de bandes fines sur une part de l’image, par pas, jamais tout l’écran', energy: [0.55, 1], beats: [1, 1] },
  { key: 'rows', name: 'Rangées', hint: 'quelques rangées qui glissent lentement, les lettres coupées avec', energy: [0.45, 1], beats: [2, 4] },
  { key: 'feed', name: 'Défilé', hint: 'de petites cartes de l’image qui passent, pas vite, la carte de la marque parmi elles', energy: [0.35, 0.9], beats: [2, 4] },
  { key: 'sweep', name: 'Balayage', hint: 'une ligne fine révèle le plan suivant', energy: [0.3, 0.85], beats: [1, 2] },
  { key: 'zoom', name: 'Zoom', hint: 'le logo grandit à travers le cadre', energy: [0.4, 1], beats: [1, 2] },
  { key: 'card', name: 'Carton', hint: 'un carton de ton texte, une ligne par carton, dans l’ordre', energy: [0, 0.7], beats: [2, 4] },
  { key: 'vomit', name: 'Vomi', hint: 'de petits fragments qui s’accumulent depuis un point et coulent, lentement', energy: [0.6, 1], beats: [2, 4] },
  { key: 'textbig', name: 'Texte géant', hint: 'ton texte en géant au fond, par décalage de l’image ou en contour, coupé par quelques rangées, pendant qu’il reste net devant', energy: [0.2, 0.9], beats: [2, 4] },
]
export type BrandMode = 'center' | 'random' | 'deformed' | 'exploded'
export const BRAND_MODES: Array<{ key: BrandMode; name: string; hint: string }> = [
  { key: 'center', name: 'Centre', hint: 'la marque près du centre de la zone sûre' },
  { key: 'random', name: 'Aléatoire', hint: 'là où le tirage la met dans la zone sûre' },
  { key: 'deformed', name: 'Déformée', hint: 'étirée, cisaillée, en miroir, doucement en mouvement' },
  { key: 'exploded', name: 'Éclatée', hint: 'elle s’assemble en arrivant, se disperse un instant sur les temps forts, explose en partant' },
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
  videos: HTMLVideoElement[]
  titleFont: string
  text?: PromoText | null
  icon?: PromoIcon | null
}

type Treatment = 'cream' | 'accent' | 'second' | 'filled' | 'stroke'
type Deform = 'none' | 'stretch' | 'skew' | 'mirror'
type Enter = 'none' | 'slide' | 'grow' | 'assemble' | 'flicker'
type Exit = 'none' | 'explode' | 'slide' | 'dissolve'
type Transition = 'cut' | 'slam' | 'tear'
type Ground = 'deep' | 'zoomed' | 'panel'
export type Shot = {
  kind: ShotKind; from: number; to: number; seed: number; energy: number
  video: number; picture: number; card: number
  treat: Treatment; stacked: boolean; pill: boolean; ground: Ground; dressing: number
  bx: number; by: number; bw: number; deform: Deform; enter: Enter; exit: Exit
  transition: Transition
  p: { a: number; b: number; c: number; d: number; e: number; f: number }
}

/** The energy along the film, compressed: never nothing, never everything. Three shapes by seed; a bumper goes straight up. */
export function energyAt(t: number, seconds: number, intensity: number, shape = 0): number {
  const k = clamp01(intensity)
  let base: number
  if (seconds <= 3) base = 0.4 + t * 0.5
  else if (shape === 1) base = t < 0.3 ? 0.3 + t * 1.8 : t < 0.5 ? 0.84 - (t - 0.3) * 2.5 : t < 0.8 ? 0.34 + (t - 0.5) * 2 : 0.94 - (t - 0.8) * 2.8
  else if (shape === 2) base = t < 0.6 ? 0.18 + t * 0.6 : t < 0.9 ? 0.54 + (t - 0.6) * 1.4 : 0.96 - (t - 0.9) * 3.5
  else base = t < 0.25 ? 0.18 + t * 0.8 : t < 0.5 ? 0.38 + (t - 0.25) * 1.6 : t < 0.8 ? 0.78 + (t - 0.5) * 0.5 : 0.93 - (t - 0.8) * 3
  return clamp01(base * (0.5 + k * 0.5))
}

/** The sequence: shots chosen by the energy of the moment and the draw's taste, joined on the beat; the cards in order; the brand to close. */
export function planShots(input: Pick<PromoInput, 'seconds' | 'intensity' | 'seed' | 'shots' | 'brandMode' | 'text'>, videos: number, pictures: number): { shots: Shot[]; beat: number } {
  const k = clamp01(input.intensity)
  const allowed = input.shots.length ? input.shots : SHOTS.map((s) => s.key)
  const cards = (input.text?.lines ?? []).filter((l) => l.trim()).length
  const bpm = 76 + k * 40 + hash(input.seed, 1) * 20
  const beat = 60000 / bpm
  const total = input.seconds * 1000
  const out: Shot[] = []
  let at = 0, i = 0, card = 0, last: ShotKind | null = null, video = Math.floor(hash(input.seed, 2) * Math.max(1, videos)), picture = Math.floor(hash(input.seed, 3) * Math.max(1, pictures))
  const shape = Math.floor(hash(input.seed, 5) * 3)
  const favour = new Map<ShotKind, number>(SHOTS.map((sh) => [sh.key, 0.4 + hash(input.seed, sh.key.length, 6) * 1.2]))
  const openers = (['block', 'windows', 'textbig', 'video', 'zoom', 'sweep'] as ShotKind[]).filter((o) => allowed.includes(o))
  const treatments: Treatment[] = ['cream', 'cream', 'accent', 'second', 'filled', 'stroke']
  const mode = input.brandMode
  let stacked = hash(input.seed, 4) < 0.6
  const closing = input.seconds >= 5 ? Math.round(beat * 2.5) : 0
  const params = (s: number) => ({ a: hash(s, 30), b: hash(s, 31), c: hash(s, 32), d: hash(s, 33), e: hash(s, 34), f: hash(s, 35) })
  while (at < total - closing) {
    const s = input.seed * 23 + i * 131
    const t = at / total
    const e = energyAt(t, input.seconds, input.intensity, shape)
    let kind: ShotKind
    const left = total - closing - at
    const mustCard = card < cards && left < (cards - card + 1) * beat * 3
    if (card < cards && last !== 'card' && (mustCard || (e < 0.7 && hash(s, 5) < 0.6))) kind = 'card'
    else if (i === 0 && openers.length) kind = openers[Math.floor(hash(s, 6) * openers.length)]
    else {
      const pool = SHOTS.filter((sh) => allowed.includes(sh.key) && sh.key !== last && sh.key !== 'card' && e >= sh.energy[0] - 0.12 && e <= sh.energy[1] + 0.12)
      const fallback = SHOTS.filter((sh) => allowed.includes(sh.key) && sh.key !== 'card')
      const from = pool.length ? pool : fallback.length ? fallback : SHOTS
      const sum = from.reduce((a, sh) => a + (favour.get(sh.key) ?? 1), 0)
      let q = hash(s, 6) * sum
      kind = from[from.length - 1].key
      for (const sh of from) { q -= favour.get(sh.key) ?? 1; if (q <= 0) { kind = sh.key; break } }
    }
    const spec = SHOTS.find((sh) => sh.key === kind)!
    const beatsN = spec.beats[0] + Math.round(hash(s, 7) * (spec.beats[1] - spec.beats[0]) * (1 - e * 0.4)) + (k < 0.4 && spec.key !== 'tear' ? 1 : 0)
    const len = Math.round(beat * beatsN)
    if (kind === 'card') card += 1
    if (hash(s, 8) < 0.5 && videos > 1) video = (video + 1 + Math.floor(hash(s, 9) * (videos - 1))) % videos
    if (hash(s, 10) < 0.5 && pictures > 1) picture = (picture + 1 + Math.floor(hash(s, 11) * (pictures - 1))) % pictures
    if (hash(s, 12) < 0.3) stacked = !stacked
    const treat = treatments[Math.floor(hash(s, 13) * treatments.length)]
    const bw = mode === 'center' ? 0.55 + hash(s, 14) * 0.2 : 0.35 + hash(s, 14) * 0.55
    const bx = mode === 'center' ? 0.42 + hash(s, 15) * 0.16 : 0.2 + hash(s, 15) * 0.6
    const by = mode === 'center' ? 0.4 + hash(s, 16) * 0.2 : 0.2 + hash(s, 16) * 0.6
    const deform: Deform = mode === 'deformed' || (mode === 'random' && hash(s, 17) < 0.4) ? (['stretch', 'skew', 'mirror'] as Deform[])[Math.floor(hash(s, 17) * 3)] : 'none'
    const enters: Enter[] = ['none', 'slide', 'grow', 'assemble', 'flicker'], exits: Exit[] = ['none', 'explode', 'slide', 'dissolve']
    const enter: Enter = mode === 'exploded' ? 'assemble' : i === 0 ? enters[1 + Math.floor(hash(s, 18) * 4)] : hash(s, 18) < 0.45 ? 'none' : enters[Math.floor(hash(s, 19) * 5)]
    const exit: Exit = mode === 'exploded' ? 'explode' : hash(s, 20) < 0.5 ? 'none' : exits[Math.floor(hash(s, 21) * 4)]
    // The joins: a cut mostly; a light tear or a slam of colour only when the moment and the force allow.
    const transition: Transition = i === 0 ? 'cut' : k > 0.5 && e > 0.6 && hash(s, 22) < 0.3 ? 'slam' : k > 0.3 && e > 0.5 && hash(s, 22) < 0.55 ? 'tear' : 'cut'
    const qg = hash(s, 23)
    const ground: Ground = kind === 'card' ? (qg < 0.55 ? 'panel' : 'deep') : qg < 0.45 ? 'deep' : 'zoomed'
    out.push({ kind, from: at, to: Math.min(total - closing, at + len), seed: s, energy: e, video, picture, card: card - 1, treat, stacked, pill: hash(s, 24) < 0.6, ground, dressing: Math.floor(hash(s, 25) * 5), bx, by, bw, deform, enter, exit, transition, p: params(s) })
    at += len; i += 1; last = kind
  }
  if (closing) {
    const s = input.seed * 23 + 9999
    out.push({ kind: 'block', from: total - closing, to: total, seed: s, energy: 0.25, video, picture, card: -1, treat: 'cream', stacked: hash(s, 4) < 0.6, pill: true, ground: 'deep', dressing: 4, bx: 0.5, by: 0.5, bw: 0.6, deform: 'none', enter: hash(s, 18) < 0.5 ? 'assemble' : 'grow', exit: 'none', transition: 'cut', p: params(s) })
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
  const force = clamp01(input.intensity)
  const u = Math.min(W, H) / 1080
  const px = Math.max(1, Math.round(u))
  const font = input.titleFont
  const { shots, beat } = planShots(input, input.videos.length, input.stock.length)
  const make = (w = W, h = H) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }
  const scene = make(), scratch = make(), scratch2 = make(), prev = make(), held = make(), pile = make()
  const sc = scene.getContext('2d')!, sx = scratch.getContext('2d')!, s2 = scratch2.getContext('2d')!, pv = prev.getContext('2d')!, hc = held.getContext('2d')!, pc = pile.getContext('2d')!
  let heldFor = -1, pileFor = -1

  // ----- the moment's strength and its step clock: the glitch moves by steps, never by frames.
  const strengthOf = (shot: Shot) => clamp01((0.12 + shot.energy * 0.6) * (0.45 + force * 0.65))
  const stepOf = (shot: Shot, at: number, scale = 1) => Math.floor(at / ((260 - strengthOf(shot) * 170) * scale))
  const beatIndexOf = (shot: Shot, at: number) => Math.floor((at - shot.from) / beat)
  const beatPhaseOf = (shot: Shot, at: number) => ((at - shot.from) % beat) / beat

  // ----- sources
  const videoOf = (shot: Shot) => { const v = input.videos[shot.video % Math.max(1, input.videos.length)]; return v && v.readyState >= 2 ? v : null }
  const pictureOf = (shot: Shot) => input.stock[shot.picture % Math.max(1, input.stock.length)] ?? null
  const sourceOf = (shot: Shot): CanvasImageSource | null => videoOf(shot) ?? pictureOf(shot)
  const logoSize = (img: HTMLImageElement, w: number) => ({ w: Math.round(w), h: Math.round(w * img.naturalHeight / Math.max(1, img.naturalWidth)) })
  const tinted = (img: CanvasImageSource, colour: string, w: number, h: number, target = sx) => {
    const c = target === sx ? scratch : scratch2
    target.clearRect(0, 0, W, H); target.globalCompositeOperation = 'source-over'; target.drawImage(img, 0, 0, w, h)
    target.globalCompositeOperation = 'source-in'; target.fillStyle = colour; target.fillRect(0, 0, w, h); target.globalCompositeOperation = 'source-over'
    return c
  }

  // ----- the fine layer, after the site's own glitch: small pieces of the picture thinly framed, hairlines in the palette, drifting slowly.
  const pieces = (ctx: CanvasRenderingContext2D, shot: Shot, at: number, n: number, big = false) => {
    const src = sourceOf(shot)
    const s = shot.seed, step = stepOf(shot, at, 2)
    for (let i = 0; i < n; i += 1) {
      const pw = Math.round(W * (big ? 0.1 + hash(s, i, 334) * 0.18 : 0.035 + hash(s, i, 334) * 0.09)), ph = Math.round(pw * (0.4 + hash(s, i, 335) * 0.9))
      const x = Math.round(hash(s, i, 336) * (W - pw) + Math.sin(at / 1100 + i * 1.7) * W * 0.015 + (hash(step, i, 337) - 0.5) * W * 0.01), y = Math.round(hash(s, i, 338) * (H - ph) + (at - shot.from) * (hash(s, i, 339) - 0.5) * 0.02)
      if (src) cover(ctx, src, x, y, pw, ph, 2 + hash(s, i, 340) * 4, hash(s, i, 341), hash(s, i, 342)); else { ctx.fillStyle = colourAt(hash(s, i, 343)); ctx.fillRect(x, y, pw, ph) }
      if (hash(s, i, 344) < 0.3) { ctx.fillStyle = colourAt(hash(s, i, 345)); ctx.globalAlpha = 0.35; ctx.fillRect(x, y, pw, ph); ctx.globalAlpha = 1 }
      ctx.strokeStyle = hash(s, i, 346) < 0.5 ? CREAM : colourAt(hash(s, i, 347)); ctx.lineWidth = px; ctx.strokeRect(x + 0.5, y + 0.5, pw - 1, ph - 1)
    }
  }
  const hairlines = (ctx: CanvasRenderingContext2D, shot: Shot, at: number, n: number) => {
    const s = shot.seed
    for (let i = 0; i < n; i += 1) {
      const vertical = hash(s, i, 350) < 0.35
      const drift = (at - shot.from) * (hash(s, i, 351) - 0.5) * 0.04
      const pos = Math.round(hash(s, i, 352) * (vertical ? W : H) + drift), len = Math.round((vertical ? H : W) * (0.15 + hash(s, i, 353) * 0.6)), start = Math.round(hash(s, i, 354) * ((vertical ? H : W) - len))
      ctx.fillStyle = colourAt(hash(s, i, 355)); ctx.globalAlpha = 0.5 + hash(s, i, 356) * 0.4
      if (vertical) ctx.fillRect(pos, start, px, len); else ctx.fillRect(start, pos, len, px)
    }
    ctx.globalAlpha = 1
  }
  /** The picture zoomed until abstract — a corner of it, eight to fourteen times closer, laid in coarse pixels, drifting slowly, tinted a little: matter, never the picture. */
  const tiny = make(Math.max(8, Math.round(W / 72)), Math.max(8, Math.round(H / 72)))
  const tc = tiny.getContext('2d')!
  const zoomed = (ctx: CanvasRenderingContext2D, shot: Shot, at: number, alpha: number, dx = 0, dy = 0, zoomMul = 1) => {
    const src = sourceOf(shot)
    if (!src) { ctx.fillStyle = DEEP; ctx.fillRect(0, 0, W, H); return }
    const s = shot.seed
    const zoom = (8 + hash(s, 360) * 6) * zoomMul
    const local = (at - shot.from) / 1000
    tc.imageSmoothingEnabled = true
    cover(tc, src, 0, 0, tiny.width, tiny.height, zoom, clamp01(hash(s, 361) + local * 0.01 * (hash(s, 362) < 0.5 ? 1 : -1)), clamp01(hash(s, 363) + local * 0.005))
    ctx.globalAlpha = alpha
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(tiny, 0, 0, tiny.width, tiny.height, dx, dy, W, H)
    ctx.imageSmoothingEnabled = true
    ctx.fillStyle = hash(s, 364) < 0.5 ? accent : DEEP; ctx.globalAlpha = alpha * 0.2; ctx.fillRect(0, 0, W, H)
    ctx.globalAlpha = 1
  }
  /** The shot's ground: deep with fine pieces, the zoomed texture, or a flat panel in the palette. */
  const ground = (ctx: CanvasRenderingContext2D, shot: Shot, at: number) => {
    const g = strengthOf(shot)
    ctx.fillStyle = DEEP; ctx.fillRect(0, 0, W, H)
    if (shot.ground === 'panel') { ctx.fillStyle = hash(shot.seed, 204) < 0.6 ? accent : secondOf(shot.seed); ctx.fillRect(0, 0, W, H) }
    else if (shot.ground === 'zoomed') zoomed(ctx, shot, at, 0.55 + g * 0.3)
    pieces(ctx, shot, at, 2 + Math.round(g * 4), shot.ground === 'deep' && shot.p.f < 0.4)
    hairlines(ctx, shot, at, 1 + Math.round(g * 3))
  }
  const pillAt = (ctx: CanvasRenderingContext2D, cx: number, y: number, width: number, alpha = 1) => {
    const w = Math.round(width), h = Math.round(w * 0.14), x = Math.round(cx - w / 2), r = h / 2
    ctx.globalAlpha = alpha
    ctx.fillStyle = accent; ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2); ctx.lineTo(x + r, y + h); ctx.arc(x + r, y + r, r, Math.PI / 2, -Math.PI / 2); ctx.closePath(); ctx.fill()
    ctx.fillStyle = CREAM; ctx.font = `700 ${Math.round(h * 0.5)}px ${font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(SITE, cx, y + h / 2)
    ctx.globalAlpha = 1
  }
  /** A camera's interface, thin and faint. */
  const camUi = (ctx: CanvasRenderingContext2D, frame: number, at: number) => {
    ctx.save(); ctx.globalAlpha = 0.55; ctx.fillStyle = CREAM; ctx.font = `${Math.round(u * 20)}px ${font}`; ctx.textBaseline = 'top'; ctx.textAlign = 'left'
    const t = Math.floor(at / 1000)
    ctx.fillText(`17:${String(13 + t).padStart(2, '0')}`, S.x, S.y)
    ctx.textAlign = 'right'; ctx.fillText(`${String(140 + (frame % 30)).padStart(3, '0')}  F R N`, S.x + S.w, S.y)
    ctx.textAlign = 'left'; ctx.font = `${Math.round(u * 24)}px ${font}`; ctx.fillText(`00:00:${String(t).padStart(2, '0')}:${String(frame % 30).padStart(2, '0')}`, S.x, S.y + S.h - Math.round(u * 26))
    if (Math.floor(at / 500) % 2 === 0) { ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(S.x + 5 * px, S.y + Math.round(u * 46), 5 * px, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = CREAM; ctx.font = `${Math.round(u * 20)}px ${font}`; ctx.fillText('REC', S.x + 14 * px, S.y + Math.round(u * 36)) }
    ctx.strokeStyle = CREAM; ctx.lineWidth = px
    const l = Math.round(u * 36)
    for (const [cx, cy, dx, dy] of [[S.x, S.y, 1, 1], [S.x + S.w, S.y, -1, 1], [S.x, S.y + S.h, 1, -1], [S.x + S.w, S.y + S.h, -1, -1]] as const) { ctx.beginPath(); ctx.moveTo(cx, cy + dy * l); ctx.lineTo(cx, cy); ctx.lineTo(cx + dx * l, cy); ctx.stroke() }
    const fs = Math.round(Math.min(W, H) * 0.16), fx = Math.round(W / 2 - fs / 2 + Math.sin(at / 1100) * W * 0.04), fy = Math.round(H * 0.45 - fs / 2 + Math.cos(at / 1500) * H * 0.03)
    for (const [cx, cy, dx, dy] of [[fx, fy, 1, 1], [fx + fs, fy, -1, 1], [fx, fy + fs, 1, -1], [fx + fs, fy + fs, -1, -1]] as const) { ctx.beginPath(); ctx.moveTo(cx, cy + dy * fs * 0.25); ctx.lineTo(cx, cy); ctx.lineTo(cx + dx * fs * 0.25, cy); ctx.stroke() }
    ctx.restore()
  }
  /** Thin bands over a share of the frame, from the source and the frame before, shifted a little; changes by step, not by frame. */
  const bands = (ctx: CanvasRenderingContext2D, src: CanvasImageSource | null, before: HTMLCanvasElement, seed: number, step: number, coverage: number, shift: number) => {
    const top = Math.round(hash(seed, step, 69) * H * (1 - coverage)), bottom = Math.min(H, top + Math.round(H * coverage))
    let y = top, i = 0
    while (y < bottom) {
      const bh = Math.max(px, Math.round(H * (0.001 + hash(seed, step, i, 70) * 0.012)))
      const gap = Math.round(H * hash(seed, step, i, 71) * 0.02)
      const q = hash(seed, step, i, 72), dx = Math.round((hash(seed, step, i, 73) - 0.5) * W * shift)
      if (q < 0.35 && src) { const sw = (src as HTMLVideoElement).videoWidth || (src as HTMLImageElement).naturalWidth || W, sh = (src as HTMLVideoElement).videoHeight || (src as HTMLImageElement).naturalHeight || H; ctx.drawImage(src, 0, hash(seed, i, 76) * (sh - 2), sw, Math.max(1, sh * bh / H), dx, y, W, bh) }
      else if (q < 0.7) ctx.drawImage(before, 0, y, W, bh, dx, y, W, bh)
      else if (q < 0.85) ctx.drawImage(ctx.canvas, 0, y, W, bh, dx, y, W, bh)
      else { ctx.fillStyle = colourAt(hash(seed, i, 79)); ctx.globalAlpha = 0.7; ctx.fillRect(Math.round(hash(seed, i, 80) * W * 0.5), y, Math.round(W * (0.1 + hash(seed, i, 81) * 0.5)), px); ctx.globalAlpha = 1 }
      y += bh + gap; i += 1
    }
  }

  // ----- the brand
  const brandRect = (shot: Shot, progress: number) => {
    const img = shot.stacked ? input.logoVertical : input.logo
    let { w, h } = logoSize(img, Math.min(S.w * shot.bw * (shot.stacked ? 0.9 : 1.2), S.w * 0.96))
    if (h > S.h * 0.8) { const f = S.h * 0.8 / h; w = Math.round(w * f); h = Math.round(h * f) }
    const breathe = 1 + Math.sin(progress * Math.PI * 2 * (0.5 + hash(shot.seed, 60))) * 0.015
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
  /** The shape drawn with its deformation, gently in motion; in the exploded mode the pieces part for a step on strong beats. */
  const drawShape = (ctx: CanvasRenderingContext2D, source: CanvasImageSource, shot: Shot, x: number, y: number, w: number, h: number, sw: number, sh: number, at: number, spread: number) => {
    const s = shot.seed
    if (spread > 0.001) { drawPieces(ctx, source, x, y, w, h, sw, sh, s, spread, at); return }
    if (input.brandMode === 'exploded') { const bi = beatIndexOf(shot, at), bp = beatPhaseOf(shot, at), g = strengthOf(shot); if (bp < 0.18 && g > 0.4 && hash(s, bi, 341) < 0.6) { drawPieces(ctx, source, x, y, w, h, sw, sh, s + bi, 0.12 + g * 0.2, at); return } }
    const bi = beatIndexOf(shot, at)
    const deform: Deform = shot.deform === 'none' ? 'none' : (['none', 'stretch', 'skew', 'mirror'] as Deform[])[Math.floor(hash(s, Math.floor(bi / 2), 340) * 4)]
    switch (deform) {
      case 'stretch': { const fx = 1.1 + hash(s, 210) * 0.5 + Math.sin(at / 1100) * 0.06, fy = 0.7 + hash(s, 211) * 0.3; const nw = Math.round(w * fx), nh = Math.round(h * fy); ctx.drawImage(source, 0, 0, sw, sh, Math.round(x + w / 2 - nw / 2), Math.round(y + h / 2 - nh / 2), nw, nh); break }
      case 'skew': { const sk = (hash(s, 212) - 0.5) * 0.7 + Math.sin(at / 900) * 0.1; ctx.save(); ctx.transform(1, 0, sk, 1, 0, 0); ctx.drawImage(source, 0, 0, sw, sh, x - Math.round(sk * (y + h / 2)), y, w, h); ctx.restore(); break }
      case 'mirror': { ctx.save(); ctx.translate(x + w, 0); ctx.scale(-1, 1); ctx.drawImage(source, 0, 0, sw, sh, 0, y, w, h); ctx.restore(); break }
      default: ctx.drawImage(source, 0, 0, sw, sh, x, y, w, h)
    }
  }
  /** A real outline of the shape: the tinted shape laid in eight directions, the deep shape over it. On deep the inside vanishes: an outline alone. */
  const strokeShape = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, dark: HTMLImageElement, colour: string, x: number, y: number, w: number, h: number) => {
    const o = Math.max(2, Math.round(u * 4))
    const tint = tinted(img, colour, w, h)
    for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o], [-o, -o], [o, -o], [-o, o], [o, o]]) ctx.drawImage(tint, 0, 0, w, h, x + dx, y + dy, w, h)
    ctx.drawImage(dark, x, y, w, h)
  }
  /** The brand mistreated by step, by the strength: a few thin slices, a mirror, a faint repeat, bands erased, a stretch pulse; nothing every frame. */
  const mistreat = (ctx: CanvasRenderingContext2D, shot: Shot, r: { x: number; y: number; w: number; h: number }, at: number) => {
    const g = strengthOf(shot)
    if (g < 0.1) return
    const s = shot.seed, step = stepOf(shot, at)
    const x0 = Math.max(0, r.x - Math.round(W * 0.04)), y0 = Math.max(0, r.y - Math.round(H * 0.015)), w0 = Math.min(W - x0, r.w + Math.round(W * 0.08)), h0 = Math.min(H - y0, r.h + Math.round(H * 0.03))
    if (w0 <= 0 || h0 <= 0) return
    if (hash(s, step, 300) < g * 0.6) { const n = 1 + Math.round(g * 4); for (let i = 0; i < n; i += 1) { const sh = Math.max(px, Math.round(h0 * (0.01 + hash(s, step, i, 301) * 0.06))), sy = y0 + Math.round(hash(s, step, i, 302) * (h0 - sh)); ctx.drawImage(ctx.canvas, x0, sy, w0, sh, x0 + Math.round((hash(s, step, i, 303) - 0.5) * w0 * (0.05 + g * 0.3)), sy, w0, sh) } }
    const mis = hash(s, step, 311)
    if (mis < g * 0.12) { ctx.save(); ctx.translate(x0 + w0, 0); ctx.scale(-1, 1); ctx.drawImage(ctx.canvas, x0, y0, w0, h0, 0, y0, w0, h0); ctx.restore() }
    else if (mis < g * 0.24) { ctx.globalAlpha = 0.25; ctx.drawImage(ctx.canvas, x0, y0, w0, h0, x0, y0 - Math.round(h0 * 0.3), w0, h0); ctx.drawImage(ctx.canvas, x0, y0, w0, h0, x0, y0 + Math.round(h0 * 0.3), w0, h0); ctx.globalAlpha = 1 }
    else if (mis < g * 0.36) { ctx.fillStyle = DEEP; for (let i = 0; i < 1 + Math.round(g * 3); i += 1) ctx.fillRect(x0, y0 + Math.round(hash(s, step, i, 312) * h0), w0, Math.round(h0 * (0.01 + hash(s, step, i, 313) * 0.05))) }
    else if (mis < g * 0.46) { const f = 1 + 0.08 + g * 0.15; const nw = Math.round(w0 * f); ctx.drawImage(ctx.canvas, x0, y0, w0, h0, Math.round(x0 + w0 / 2 - nw / 2), y0, nw, h0) }
  }
  const drawBrand = (ctx: CanvasRenderingContext2D, shot: Shot, at: number, scale = 1, forcePlace?: { x: number; y: number; w: number; h: number }) => {
    const progress = clamp01((at - shot.from) / Math.max(1, shot.to - shot.from))
    const r = forcePlace ?? brandRect(shot, progress)
    const img = (r as { img?: HTMLImageElement }).img ?? (shot.stacked ? input.logoVertical : input.logo)
    const dark = shot.stacked ? input.logoVerticalDark : input.logoDark
    const sw = img.naturalWidth, sh = img.naturalHeight
    const s = shot.seed
    let ex = r.x, ey = r.y, ew = Math.round(r.w * scale), eh = Math.round(r.h * scale), spread = 0, visible = true, alpha = 1
    if (scale !== 1) { ex = Math.round(r.x + r.w / 2 - ew / 2); ey = Math.round(r.y + r.h / 2 - eh / 2) }
    const enterLen = 0.2, exitLen = 0.12
    if (shot.enter !== 'none' && progress < enterLen) {
      const t = easeOut(progress / enterLen)
      if (shot.enter === 'slide') ex = Math.round(ex + (hash(s, 80) < 0.5 ? -1 : 1) * (1 - t) * W * 1.2)
      else if (shot.enter === 'grow') { const f = 2.2 - 1.2 * t; const nw = Math.round(ew * f), nh = Math.round(eh * f); ex = Math.round(ex + ew / 2 - nw / 2); ey = Math.round(ey + eh / 2 - nh / 2); ew = nw; eh = nh }
      else if (shot.enter === 'assemble') spread = 1 - t
      else if (shot.enter === 'flicker') visible = hash(Math.floor(at / 70), s, 81) < 0.35 + t * 0.65
    }
    if (shot.exit !== 'none' && progress > 1 - exitLen) {
      const t = easeIn((progress - (1 - exitLen)) / exitLen)
      if (shot.exit === 'explode') spread = t * 1.3
      else if (shot.exit === 'slide') ex = Math.round(ex + (hash(s, 82) < 0.5 ? -1 : 1) * t * W * 1.2)
      else if (shot.exit === 'dissolve') alpha = 1 - t
    }
    if (!visible) return
    const second = secondOf(s)
    ctx.globalAlpha = alpha
    switch (shot.treat) {
      case 'accent': drawShape(ctx, tinted(img, accent, ew, eh), shot, ex, ey, ew, eh, ew, eh, at, spread); break
      case 'second': drawShape(ctx, tinted(img, second, ew, eh), shot, ex, ey, ew, eh, ew, eh, at, spread); break
      case 'stroke': if (spread > 0.001) drawShape(ctx, tinted(img, hash(s, 206) < 0.6 ? CREAM : accent, ew, eh), shot, ex, ey, ew, eh, ew, eh, at, spread); else strokeShape(ctx, img, dark, hash(s, 206) < 0.6 ? CREAM : accent, ex, ey, ew, eh); break
      case 'filled': { const src = sourceOf(shot); sx.clearRect(0, 0, W, H); sx.globalCompositeOperation = 'source-over'; sx.drawImage(img, ex, ey, ew, eh); sx.globalCompositeOperation = 'source-in'; if (src) cover(sx, src, ex, ey, ew, eh, 1.2 + hash(s, 207), hash(s, 208), hash(s, 209)); else { sx.fillStyle = accent; sx.fillRect(0, 0, W, H) } sx.globalCompositeOperation = 'source-over'; ctx.drawImage(scratch, 0, 0); break }
      default: drawShape(ctx, img, shot, ex, ey, ew, eh, sw, sh, at, spread)
    }
    ctx.globalAlpha = 1
    if (shot.pill && spread < 0.2 && alpha > 0.5 && !forcePlace) pillAt(ctx, ex + ew / 2, Math.round(ey + eh + H * 0.025), Math.max(S.w * 0.35, ew * 0.7), alpha)
    if (spread < 0.2 && alpha > 0.3) mistreat(ctx, shot, { x: ex, y: ey, w: ew, h: eh }, at)
  }

  // ----- the words
  const wrap = (ctx: CanvasRenderingContext2D, line: string, maxW: number) => { const lines: string[] = []; let cur = ''; for (const w of line.split(/\s+/)) { const next = cur ? `${cur} ${w}` : w; if (ctx.measureText(next).width > maxW && cur) { lines.push(cur); cur = w } else cur = next } lines.push(cur); return lines }
  /** The constant line, cream with a deep outline, in a zone drawn per seed (and clear of the brand), or where the curator put it; it jumps a little on strong steps. */
  const drawWords = (ctx: CanvasRenderingContext2D, shot: Shot, at: number) => {
    const t = input.text
    const line = t?.lines[0]?.trim()
    if (!t || !line) return
    const size = Math.round(t.size * u)
    ctx.font = `${t.weight} ${size}px ${t.font}`; ctx.textBaseline = 'top'; ctx.textAlign = t.align
    const maxW = t.x === null ? S.w : t.width * W
    const lines = wrap(ctx, line, maxW)
    const blockH = lines.length * size * 1.1
    const preferred = Math.floor(hash(input.seed, 360) * 3)
    const topOf = (zone: number) => Math.round(zone === 0 ? S.y : zone === 1 ? S.y + S.h / 2 - blockH / 2 : S.y + S.h - blockH)
    let zone = preferred
    if (t.y === null && shot.kind !== 'textbig' && shot.kind !== 'card') {
      // The first zone, the preferred one first, whose block does not cross the brand's rectangle.
      const b = brandRect(shot, clamp01((at - shot.from) / Math.max(1, shot.to - shot.from)))
      const free = (z: number) => { const y0 = topOf(z), y1 = y0 + blockH; return y1 < b.y - H * 0.01 || y0 > b.y + b.h + H * 0.01 }
      const order = [preferred, ...[0, 2, 1].filter((z) => z !== preferred)]
      zone = order.find(free) ?? preferred
    }
    const left = t.x === null ? S.x : t.x * W, top = t.y === null ? topOf(zone) : Math.round(t.y * H)
    const x = Math.round(left + (t.align === 'center' ? maxW / 2 : t.align === 'right' ? maxW : 0))
    const g = strengthOf(shot), step = stepOf(shot, at)
    const jx = g > 0.45 && hash(step, 350) < g * 0.3 ? Math.round((hash(step, 351) - 0.5) * W * 0.03) : 0
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, Math.round(size * 0.12)); ctx.strokeStyle = DEEP
    lines.forEach((l, i) => { const y = top + i * Math.round(size * 1.1); ctx.strokeText(l, x + jx, y); ctx.fillStyle = CREAM; ctx.fillText(l, x + jx, y) })
  }
  /** A card's line, letter by letter over one beat. */
  const drawCard = (ctx: CanvasRenderingContext2D, shot: Shot, at: number) => {
    const t = input.text
    const line = t?.lines[shot.card]?.trim()
    if (!t || !line) return
    const size = Math.round(t.size * u * 1.25)
    ctx.font = `${t.weight} ${size}px ${t.font}`; ctx.textBaseline = 'top'; ctx.textAlign = t.align
    const maxW = t.x === null ? S.w : t.width * W
    const lines = wrap(ctx, line, maxW)
    const blockH = lines.length * size * 1.1
    const left = t.x === null ? S.x : t.x * W, top = t.y === null ? Math.round(S.y + S.h / 2 - blockH / 2) : Math.round(t.y * H)
    const x = Math.round(left + (t.align === 'center' ? maxW / 2 : t.align === 'right' ? maxW : 0))
    const shown = Math.ceil(line.length * Math.min(1, (at - shot.from) / beat))
    let count = 0
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, Math.round(size * 0.12)); ctx.strokeStyle = DEEP
    lines.forEach((l, i) => { const part = l.slice(0, Math.max(0, shown - count)); count += l.length + 1; const y = top + i * Math.round(size * 1.1); ctx.strokeText(part, x, y); ctx.fillStyle = CREAM; ctx.fillText(part, x, y) })
  }
  /** The giant words on the scratch canvas, as a mask. Returns their bounds. */
  const giantMask = (target: CanvasRenderingContext2D, at: number, shot: Shot) => {
    const line = (input.text?.lines[0] ?? 'RANDOM').trim().toUpperCase() || 'RANDOM'
    const words = line.split(/\s+/).slice(0, 4)
    target.clearRect(0, 0, W, H); target.globalCompositeOperation = 'source-over'
    target.font = `900 100px ${input.text?.font ?? font}`
    const widest = Math.max(...words.map((w) => target.measureText(w).width), 1)
    const size = Math.round(Math.min(100 * S.w * 1.1 / widest, S.h * 0.9 / Math.max(1, words.length) / 1.05))
    target.font = `900 ${size}px ${input.text?.font ?? font}`; target.textAlign = 'center'; target.textBaseline = 'middle'; target.fillStyle = CREAM
    const cy0 = S.y + S.h / 2 - (words.length - 1) * size * 0.525
    words.forEach((w, i) => target.fillText(w, S.x + S.w / 2 + Math.round((hash(shot.seed, i, 370) - 0.5) * S.w * 0.15 * Math.sin(at / 900 + i)), cy0 + i * size * 1.05))
    return { x: S.x, y: Math.round(cy0 - size * 0.6), w: S.w, h: Math.round(words.length * size * 1.05 + size * 0.2) }
  }
  /** The letters by displacement: the same zoomed picture, shifted a little inside the mask, over the zoomed ground — the letters appear subtly. */
  const displaced = (ctx: CanvasRenderingContext2D, shot: Shot, at: number, mask: () => void, amount: number) => {
    zoomed(ctx, shot, at, 0.85)
    mask()
    sx.globalCompositeOperation = 'source-in'
    const s = shot.seed
    zoomed(sx, shot, at, 1, Math.round((hash(s, 380) - 0.5) * W * amount), Math.round((hash(s, 381) - 0.5) * H * amount * 0.6), 1 + (hash(s, 382) - 0.5) * 0.3)
    sx.globalCompositeOperation = 'source-over'
    ctx.drawImage(scratch, 0, 0)
  }

  // ----- the frame treated, by step and by strength: thin rows, a column now and then, the dressing, an icon, a rare slant.
  const treatFrame = (ctx: CanvasRenderingContext2D, shot: Shot, at: number, frame: number) => {
    const g = strengthOf(shot)
    const s = shot.seed, step = stepOf(shot, at), bi = beatIndexOf(shot, at), bp = beatPhaseOf(shot, at)
    const src = sourceOf(shot)
    if (hash(s, step, 320) < 0.3 + g * 0.5) { const n = Math.round(g * 3); for (let i = 0; i < n; i += 1) { const sh = Math.max(px, Math.round(H * (0.001 + hash(s, step, i, 321) * (0.003 + g * 0.01)))), sy = Math.round(hash(s, step, i, 322) * (H - sh)); ctx.drawImage(ctx.canvas, 0, sy, W, sh, Math.round((hash(s, step, i, 323) - 0.5) * W * (0.03 + g * 0.12)), sy, W, sh) } }
    if (bp < 0.1 && g > 0.5 && hash(s, bi, 324) < 0.5) bands(ctx, src, prev, s + bi, step, 0.08 + g * 0.25, 0.15 + g * 0.25)
    if (g > 0.3 && hash(s, step, 325) < g * 0.2) { const cw = Math.round(W * (0.004 + hash(s, step, 326) * 0.03)), cx = Math.round(hash(s, step, 327) * (W - cw)); ctx.drawImage(ctx.canvas, cx, 0, cw, H, cx, Math.round((hash(s, step, 328) - 0.5) * H * 0.08 * g), cw, H) }
    if (shot.dressing === 0 && g > 0.12) camUi(ctx, frame, at)
    if (shot.dressing === 1 && g > 0.3) { ctx.fillStyle = CREAM; ctx.font = `${Math.round(u * 18)}px ${font}`; ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.globalAlpha = 0.5; ctx.fillText(`${Math.round(8 + hash(bi, 391) * 40)} Mbps  I P B P B  ${String(bi % 300).padStart(3, '0')}`, S.x + S.w, S.y + S.h - Math.round(u * 22)); ctx.globalAlpha = 1 }
    if (shot.dressing === 1 && g > 0.5 && hash(s, step, 392) < 0.5) { const B = Math.round(Math.min(W, H) / 24), cols = Math.ceil(W / B), rows = Math.ceil(H / B); pv.drawImage(ctx.canvas, 0, 0); for (let i = 0; i < Math.round(g * 14); i += 1) { const bx = Math.floor(hash(s, step, i, 393) * cols), by = Math.floor(hash(s, step, i, 394) * rows); ctx.drawImage(prev, Math.floor(hash(s, step, i, 395) * cols) * B, Math.max(0, Math.min(rows - 1, by + Math.round((hash(s, step, i, 396) - 0.5) * 3))) * B, B, B, bx * B, by * B, B, B) } }
    if (shot.dressing === 2 && g > 0.2) { ctx.fillStyle = DEEP; ctx.globalAlpha = 0.1; for (let y = 0; y < H; y += 3 * px) ctx.fillRect(0, y, W, px); ctx.globalAlpha = 0.05; ctx.fillStyle = CREAM; ctx.fillRect(0, Math.round(((at * 0.2) % (H * 1.2)) - H * 0.1), W, Math.round(H * 0.05)); ctx.globalAlpha = 1 }
    if (input.icons.length && g > 0.2 && hash(s, bi, 345) < 0.05 + g * 0.1) { const ic = input.icons[Math.floor(hash(s, bi, 346) * input.icons.length)]; const size = Math.round(Math.min(W, H) * (0.12 + hash(s, bi, 347) * 0.2)); const ix = Math.round(S.x + hash(s, bi, 348) * (S.w - size)), iy = Math.round(S.y + hash(s, bi, 349) * (S.h - size)); ctx.drawImage(ic, ix, iy, size, size); for (let b = 0; b < 3; b += 1) { const by = iy + Math.round(hash(s, b, 350) * size), bh = Math.round(size * (0.02 + hash(s, b, 351) * 0.08)); ctx.drawImage(ctx.canvas, ix, by, size, bh, ix + Math.round((hash(s, b, step, 352) - 0.5) * size * 0.4), by, size, bh) } }
    if (g > 0.5 && hash(s, bi, 343) < 0.05) { const a = (hash(s, bi, 344) - 0.5) * 0.04; ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(a); ctx.drawImage(ctx.canvas, -W / 2, -H / 2); ctx.restore() }
    pieces(ctx, shot, at, 1 + Math.round(g * 2))
  }

  // ----- the shots
  const drawShot = (ctx: CanvasRenderingContext2D, shot: Shot, at: number, frame: number) => {
    const s = shot.seed, p = shot.p, g = strengthOf(shot)
    const progress = clamp01((at - shot.from) / Math.max(1, shot.to - shot.from))
    const src = sourceOf(shot)
    const step = stepOf(shot, at)
    switch (shot.kind) {
      case 'block': { ground(ctx, shot, at); drawBrand(ctx, shot, at); break }
      case 'windows': {
        // The letters open on the picture: by displacement of the same zoomed picture, as an outline alone, as an outline with some windows, or filled on deep.
        const way = Math.floor(p.c * 4)
        const r = brandRect(shot, progress)
        const dark = shot.stacked ? input.logoVerticalDark : input.logoDark
        const mask = () => { sx.clearRect(0, 0, W, H); sx.globalCompositeOperation = 'source-over'; sx.drawImage(r.img, r.x, r.y, r.w, r.h) }
        if (way === 0) displaced(ctx, shot, at, mask, 0.03 + g * 0.05)
        else if (way === 1) { ground(ctx, shot, at); strokeShape(ctx, r.img, dark, hash(s, 206) < 0.6 ? CREAM : accent, r.x, r.y, r.w, r.h) }
        else if (way === 2) { displaced(ctx, shot, at, mask, 0.02 + g * 0.04); strokeShape(ctx, r.img, dark, CREAM, r.x, r.y, r.w, r.h); mask(); sx.globalCompositeOperation = 'source-in'; zoomed(sx, shot, at, 1, Math.round((hash(s, 380) - 0.5) * W * 0.05), 0, 1.1); sx.globalCompositeOperation = 'source-over'; for (let i = 0; i < 2 + Math.round(g * 3); i += 1) { const fw = Math.round(r.w * (0.2 + hash(s, step, i, 381) * 0.4)), fh = Math.round(r.h * (0.3 + hash(s, step, i, 382) * 0.6)); const fx = Math.round(r.x + hash(s, step, i, 383) * (r.w - fw)), fy = Math.round(r.y + hash(s, step, i, 384) * (r.h - fh)); ctx.drawImage(scratch, fx, fy, fw, fh, fx, fy, fw, fh) } }
        else { ground(ctx, { ...shot, ground: 'deep' }, at); mask(); sx.globalCompositeOperation = 'source-in'; if (src) cover(sx, src, r.x, r.y, r.w, r.h, 1.3 + p.b, hash(s, 385), hash(s, 386)); else { sx.fillStyle = accent; sx.fillRect(0, 0, W, H) } sx.globalCompositeOperation = 'source-over'; ctx.drawImage(scratch, 0, 0) }
        if (shot.pill) pillAt(ctx, r.x + r.w / 2, Math.round(r.y + r.h + H * 0.025), Math.max(S.w * 0.35, r.w * 0.7))
        mistreat(ctx, shot, r, at)
        break
      }
      case 'video': {
        // The picture zoomed to a texture, the brand over it, small or large by the draw.
        zoomed(ctx, shot, at, 0.7 + g * 0.2)
        pieces(ctx, shot, at, 2 + Math.round(g * 3))
        hairlines(ctx, shot, at, 1 + Math.round(g * 2))
        if (p.d < 0.5) { const corner = Math.floor(p.e * 4); const { w, h } = logoSize(input.logo, S.w * 0.45); const x = corner % 2 ? S.x + S.w - w : S.x, y = corner < 2 ? S.y : S.y + S.h - h; drawBrand(ctx, { ...shot, bw: 0.45, pill: false, enter: 'none', exit: 'none' }, at, 1, { x, y, w, h }) }
        else drawBrand(ctx, { ...shot, enter: 'none' }, at)
        break
      }
      case 'tear': {
        // One beat: the frame before, with thin bands over a share of it, changing by step.
        ctx.drawImage(held, 0, 0)
        bands(ctx, src, held, s, step, 0.15 + g * 0.3 * p.a, 0.2 + g * 0.3)
        break
      }
      case 'rows': {
        // The scene cut in a few rows sliding slowly, each its own way; a small piece or two riding along.
        ground(ctx, shot, at)
        drawBrand(ctx, { ...shot, enter: 'none', exit: 'none' }, at)
        sc.drawImage(ctx.canvas, 0, 0)
        ctx.fillStyle = DEEP; ctx.fillRect(0, 0, W, H)
        const rows = 3 + Math.round(p.a * 3), rh = Math.ceil(H / rows), local = at - shot.from
        for (let r = 0; r < rows; r += 1) {
          const y = r * rh
          const speed = (hash(s, r, 83) - 0.5) * W * (0.08 + g * 0.25) / 1000
          const shift = Math.round(speed * local + (hash(s, r, 84) - 0.5) * W * 0.1)
          ctx.drawImage(scene, 0, y, W, rh, shift, y, W, rh)
          if (hash(s, r, 85) < 0.4 && src) { const pw = Math.round(W * (0.08 + hash(s, r, 86) * 0.14)), ph = Math.round(rh * 0.5); const px0 = (((Math.round(hash(s, r, 88) * W + speed * 2 * local) % (W + pw)) + W + pw) % (W + pw)) - pw; cover(ctx, src, px0, y + Math.round(rh * 0.25), pw, ph, 2 + hash(s, r, 89) * 3, hash(s, r, 90), hash(s, r, 91)); ctx.strokeStyle = CREAM; ctx.lineWidth = px; ctx.strokeRect(px0 + 0.5, y + Math.round(rh * 0.25) + 0.5, pw - 1, ph - 1) }
          if (hash(s, r, 97) < 0.35) { ctx.fillStyle = colourAt(hash(s, r, 98)); ctx.globalAlpha = 0.7; ctx.fillRect(0, y + rh - px, W, px); ctx.globalAlpha = 1 }
        }
        break
      }
      case 'feed': {
        // Small cards of the picture passing, not fast, the brand's card among them.
        ground(ctx, { ...shot, ground: 'deep' }, at)
        const local = at - shot.from
        const cw = Math.round(Math.min(W, H) * (0.28 + p.a * 0.2)), ch = Math.round(cw * (0.8 + p.b * 0.6)), gap = Math.round(H * 0.04)
        const cx = Math.round((W - cw) / 2 + (p.c - 0.5) * W * 0.35)
        const dir = p.d < 0.6 ? 1 : -1
        const speed = H * (0.35 + g * 0.7) / 1000
        const offset = (local * speed) % (ch + gap)
        for (let i = -1; i < Math.ceil(H / (ch + gap)) + 1; i += 1) {
          const y = Math.round(dir > 0 ? i * (ch + gap) - offset : H - (i + 1) * (ch + gap) + offset)
          if (hash(s, i, 103) < 0.3) { ctx.fillStyle = DEEP; ctx.fillRect(cx, y, cw, ch); const { w, h } = logoSize(input.logo, cw * 0.8); drawBrand(ctx, { ...shot, pill: false, enter: 'none', exit: 'none', deform: 'none' }, at, 1, { x: cx + Math.round(cw * 0.1), y: y + Math.round(ch / 2 - h / 2), w, h }) }
          else if (src) cover(ctx, src, cx, y, cw, ch, 1.5 + hash(s, i, 104) * 2.5, hash(s, i, 105), hash(s, i, 106))
          ctx.strokeStyle = CREAM; ctx.lineWidth = px; ctx.strokeRect(cx - 2 * px + 0.5, y - 2 * px + 0.5, cw + 4 * px, ch + 4 * px)
          ctx.strokeStyle = colourAt(hash(s, i, 107)); ctx.strokeRect(cx + 2 * px + 0.5, y + 2 * px + 0.5, cw - 4 * px, ch - 4 * px)
        }
        break
      }
      case 'sweep': {
        // A fine line crosses; ahead of it the frame before, behind it this shot's ground and brand; a few thin columns shifted near it.
        ground(ctx, shot, at)
        if (p.a < 0.6) drawBrand(ctx, { ...shot, enter: 'none', exit: 'none' }, at)
        const lx = Math.round((p.b < 0.5 ? progress : 1 - progress) * W)
        ctx.save(); ctx.beginPath(); if (p.b < 0.5) ctx.rect(lx, 0, W - lx, H); else ctx.rect(0, 0, lx, H); ctx.clip(); ctx.drawImage(held, 0, 0); ctx.restore()
        for (let i = 0; i < 2 + Math.round(g * 4); i += 1) { const cw = Math.round(W * (0.003 + hash(s, step, i, 111) * 0.015)), cx = Math.round(lx - W * 0.06 + hash(s, step, i, 112) * W * 0.12); const dy = Math.round((hash(s, step, i, 113) - 0.5) * H * 0.12 * g); if (cx + cw > 0 && cx < W) ctx.drawImage(ctx.canvas, cx, 0, cw, H, cx, dy, cw, H) }
        ctx.fillStyle = hash(s, 118) < 0.7 ? CREAM : colourAt(p.c); ctx.fillRect(lx, 0, px, H)
        break
      }
      case 'zoom': {
        ground(ctx, shot, at)
        const f = 0.3 + easeIn(progress) * 2.4
        drawBrand(ctx, { ...shot, pill: false, enter: 'none', exit: 'none', deform: 'none', bx: 0.5, by: 0.5 }, at, f)
        break
      }
      case 'card': {
        ground(ctx, shot, at)
        drawCard(ctx, shot, at)
        if (p.b < 0.5) { const { w, h } = logoSize(input.logo, S.w * 0.28); drawBrand(ctx, { ...shot, treat: shot.ground === 'panel' ? 'cream' : shot.treat, pill: false, enter: 'none', exit: 'none', deform: 'none' }, at, 1, { x: S.x + S.w - w, y: S.y + S.h - h, w, h }) }
        break
      }
      case 'vomit': {
        // Small fragments gathering from a point and pouring, by step, slowly; the brand under them.
        ground(ctx, shot, at)
        drawBrand(ctx, { ...shot, enter: 'none', exit: 'none' }, at)
        if (pileFor !== s) { pileFor = s; pc.clearRect(0, 0, W, H) }
        const ox = W * (0.2 + p.a * 0.6), oy = H * (0.15 + p.b * 0.5)
        const ang = p.c < 0.6 ? Math.PI / 2 : p.c < 0.75 ? -Math.PI / 2 : p.c < 0.88 ? 0 : Math.PI
        const n = 1 + Math.round(g * 3)
        if (src) for (let i = 0; i < n; i += 1) {
          const spread = 0.1 + progress * 0.7
          const fw = Math.round(W * (0.02 + hash(s, step, i, 132) * 0.08)), fh = Math.round(H * (0.003 + hash(s, step, i, 133) * 0.025))
          const along = hash(s, step, i, 135) * spread, across = (hash(s, step, i, 134) - 0.5) * spread * 0.5
          const fx = Math.round(ox + Math.cos(ang) * along * H * 0.8 - Math.sin(ang) * across * W - fw / 2), fy = Math.round(oy + Math.sin(ang) * along * H * 0.8 + Math.cos(ang) * across * W - fh / 2)
          cover(pc, src, fx, fy, fw, fh, 2 + hash(s, step, i, 136) * 3, hash(s, step, i, 137), hash(s, step, i, 138))
          if (hash(s, step, i, 139) < 0.3) { pc.fillStyle = colourAt(hash(s, step, i, 140)); pc.globalAlpha = 0.4; pc.fillRect(fx, fy, fw, fh); pc.globalAlpha = 1 }
        }
        const drip = Math.round((1 + g * 2) * px)
        pc.globalAlpha = 0.5; pc.drawImage(pile, Math.round(Math.cos(ang) * drip), Math.round(Math.sin(ang) * drip)); pc.globalAlpha = 1
        ctx.drawImage(pile, 0, 0)
        break
      }
      case 'textbig': {
        // The text giant in the back — by displacement of the zoomed picture, or as a cream outline over the ground — a few rows slid on the step; the clean words stay in front.
        const rect = { x: 0, y: 0, w: 0, h: 0 }
        if (p.a < 0.55) displaced(ctx, shot, at, () => { Object.assign(rect, giantMask(sx, at, shot)) }, 0.03 + g * 0.05)
        else { ground(ctx, shot, at); Object.assign(rect, giantMask(sx, at, shot)); const colour = hash(s, 206) < 0.6 ? CREAM : accent; const o = Math.max(2, Math.round(u * 4)); const tint = tinted(scratch, colour, W, H, s2); for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o]]) ctx.drawImage(tint, dx, dy); tinted(scratch, DEEP, W, H, s2); ctx.drawImage(scratch2, 0, 0) }
        const rowsN = 3 + Math.round(p.c * 4), rh = Math.ceil(rect.h / rowsN)
        for (let r = 0; r < rowsN; r += 1) if (hash(s, r, step, 371) < g * 0.5) ctx.drawImage(ctx.canvas, 0, rect.y + r * rh, W, rh, Math.round((hash(s, r, step, 372) - 0.5) * W * (0.04 + g * 0.2)), rect.y + r * rh, W, rh)
        if (p.e < 0.5) { const { w, h } = logoSize(input.logo, S.w * 0.3); drawBrand(ctx, { ...shot, bw: 0.3, pill: false, enter: 'none', exit: 'none' }, at, 1, { x: S.x + S.w - w, y: S.y, w, h }) }
        break
      }
    }
    if (shot.kind !== 'tear') treatFrame(ctx, shot, at, frame)
    // The join at the head of the shot: a light tear of the frame before, or a slam of colour for a breath — never a flash.
    const head = at - shot.from
    if (head < beat * 0.15 && shot.transition !== 'cut') {
      const t = head / (beat * 0.15)
      if (shot.transition === 'slam') { ctx.fillStyle = hash(s, 150) < 0.5 ? accent : secondOf(s); ctx.globalAlpha = (1 - t) * 0.6; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1 }
      else bands(ctx, src, held, s + 1, step, 0.25 * (1 - t), 0.2)
    }
    if (input.text && input.text.lines.length === 1 && shot.kind !== 'card') drawWords(ctx, shot, at)
    if (input.icon) ctx.drawImage(input.icon.image, Math.round(input.icon.x * W), Math.round(input.icon.y * H), Math.round(input.icon.size * u), Math.round(input.icon.size * u))
  }

  const shotAt = (at: number) => { const index = shots.findIndex((s) => at < s.to); return shots[index === -1 ? shots.length - 1 : index] }
  const frame = (ctx: CanvasRenderingContext2D, at: number, frameNo: number) => {
    const shot = shotAt(at)
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
  for (let t = Math.max(0, atMs - 400); t < atMs; t += 40) promo.frame(ctx, t, Math.floor(t / 33))
  promo.frame(ctx, atMs, Math.floor(atMs / 33))
  const blob = await new Promise<Blob | null>((resolve) => work.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('PNG')
  return blob
}
