/**
 * The promo: short films and stills that speak of Random itself, after the
 * owner's references (NUK/INSPIS, INSPIS_2) and the site's own Home glitch.
 *
 * The shape of the references: the brand clean on black for a moment; a hint
 * (fringes, drips, dots); a burst — the brand exploding into its cells filled
 * with texture, a datamosh of bands with bars at the sides, a grid of small
 * screens with timecodes, the brand filled and fringed among pixel confetti
 * with its letters swapped, the brand duplicated like a film reel, a sweep, a
 * fine vomit, the curator's words giant — then a long settle where residues
 * STAY: vertical bars of colour, a small block, a few confetti, and the brand
 * micro-shifts. Cycles of that, scaled by the force: at the top it is the
 * references; low down the bursts are short and light.
 *
 * The finesse of the Home, from its own code: hundreds of hair-thin lines at a
 * low opacity with a gradient along them, one-pixel media lines and thin tears
 * where the picture passes far zoomed, small blocks and dark voids, all of it
 * jumping by steps with delays, under a veil of scanlines. That bed runs all
 * the time, in the chosen colours.
 *
 * The stock pictures and videos are never shown raw: posterised into the
 * palette's tones and laid in coarse pixels — a television's abstraction —
 * everywhere, letters included. The Fond moment is the one time the picture
 * fills the frame whole: in its own colours by steps, tinted, veiled and
 * torn, never clean. The brand is central mostly, overflows and grows at
 * moments, and is deformed by the glitches themselves. Nothing changes every
 * frame: the glitch moves by steps. Every number comes from a hash, so a
 * seed gives the same film twice. The sound, when the curator has tracks,
 * is rendered from the same plan (promoSound) and recorded with the film.
 */

import { recorderChoice } from './montage'
import { audioContext } from './promoSound'

const CREAM = '#F8F5E6', DEEP = '#121210'
const SITE = 'GORANDOM.FUN'

const hash = (...n: number[]) => { let h = 2166136261; for (const v of n) { h ^= Math.floor(v * 1000) + 0x9e3779b9; h = Math.imul(h, 16777619) } return ((h >>> 0) % 100000) / 100000 }
const easeOut = (t: number) => 1 - (1 - t) * (1 - t)
const easeIn = (t: number) => t * t
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const rgbOf = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
const mix = (a: string, b: string, t: number) => { const [x, y] = [rgbOf(a), rgbOf(b)]; return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}` }
const rgba = (hex: string, a: number) => { const [r, g, b] = rgbOf(hex); return `rgba(${r}, ${g}, ${b}, ${a})` }

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

// ----- the moments the curator may allow
export type ShotKind = 'blocks' | 'mosh' | 'screens' | 'confetti' | 'reel' | 'sweep' | 'vomit' | 'textbig' | 'column' | 'windows' | 'split' | 'ecto' | 'back'
export const SHOTS: Array<{ key: ShotKind; name: string; hint: string }> = [
  { key: 'blocks', name: 'Éclats', hint: 'la marque explose en cellules remplies de texture, des blocs épars, des barres aux côtés' },
  { key: 'mosh', name: 'Datamosh', hint: 'des bandes de texture au milieu, des barres de couleur aux côtés, les petits textes d’une caméra' },
  { key: 'screens', name: 'Écrans', hint: 'une grille de petits écrans de texture avec leurs timecodes, qui défile lentement, la marque parmi eux' },
  { key: 'confetti', name: 'Confettis', hint: 'la marque remplie et frangée, des confettis de pixels, les lettres qui s’échangent' },
  { key: 'reel', name: 'Bobine', hint: 'la marque répétée en bobine qui glisse, la texture en colonnes aux côtés' },
  { key: 'sweep', name: 'Balayage', hint: 'une ligne fine qui révèle le plan suivant' },
  { key: 'vomit', name: 'Vomi', hint: 'de petits fragments qui s’accumulent depuis un point et coulent' },
  { key: 'textbig', name: 'Texte géant', hint: 'ton texte en géant, en texture décalée ou en contour, coupé par quelques rangées' },
  { key: 'column', name: 'Colonne', hint: 'après une rafale : une colonne noire au centre avec la marque, la texture qui bouge sur les côtés' },
  { key: 'windows', name: 'Lettres-fenêtres', hint: 'l’image en texture plein cadre, la même image décalée dans les lettres ; parfois un contour' },
  { key: 'split', name: 'Lettres éclatées', hint: 'une ligne balaie, les lettres se décalent en colonnes avec leurs doubles sombres, des blocs de collage glissent ; les lettres restent décalées' },
  { key: 'ecto', name: 'Ectoplasme', hint: 'l’image solarisée en deux couleurs vives et du noir, qui ondule plein cadre ; la marque petite en bas' },
  { key: 'back', name: 'Fond', hint: 'l’image ou la vidéo plein cadre, dans ses couleurs mais par paliers et en gros pixels, teintée, voilée, striée, déchirée par pas ; la marque et le texte par-dessus ; jamais propre' },
]
/** What the film plays with: the brand block (letters stacked, with the address), the wordmark on one line, or one of the site's icons. */
export type Subject = 'block' | 'wordmark' | 'icon'
export const SUBJECTS: Array<{ key: Subject; name: string; hint: string }> = [
  { key: 'block', name: 'Bloc marque', hint: 'RAN sur DOM, avec l’adresse' },
  { key: 'wordmark', name: 'Logo RANDOM', hint: 'le mot sur une ligne' },
  { key: 'icon', name: 'Icônes', hint: 'une icône du site, grande, traitée comme la marque' },
]
export type BrandMode = 'center' | 'random' | 'deformed' | 'exploded'
export const BRAND_MODES: Array<{ key: BrandMode; name: string; hint: string }> = [
  { key: 'center', name: 'Centre', hint: 'la marque au centre, comme dans les refs ; elle déborde et grossit par moments' },
  { key: 'random', name: 'Aléatoire', hint: 'sa place change d’un cycle à l’autre' },
  { key: 'deformed', name: 'Déformée', hint: 'étirée, cisaillée, en miroir pendant les retombées' },
  { key: 'exploded', name: 'Éclatée', hint: 'ses cellules se dispersent plus loin et plus souvent' },
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
  /** The subjects the film may play with; one per cycle, sometimes two together. */
  subjects: Subject[]
  /** How far the stock picture may be recognised, 0.15 (matter only) to 0.7 (nearly itself, in coarse pixels). */
  recognition: number
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

type Phase = 'calm' | 'hint' | 'burst' | 'settle' | 'card'
type Treatment = 'cream' | 'second' | 'stroke' | 'filled'
type Residue = 'bars' | 'block' | 'confetti' | 'line' | 'split' | 'pile' | 'none'
export type Shot = {
  phase: Phase; kind: ShotKind; from: number; to: number; seed: number
  /** How hard the moment hits, 0..1, already scaled by the force. */
  g: number
  video: number; picture: number; card: number
  treat: Treatment; stacked: boolean; pill: boolean; hud: boolean; scan: boolean
  /** The cycle's subject, the icon it uses when it is one, and a second subject that joins it on some cycles. */
  subject: Subject; iconIndex: number; duo: Subject | null
  bx: number; by: number; bw: number; huge: boolean
  /** How the picture is treated this cycle: posterised in the palette, in its own colours, or solarised — plain is the Fond's ground only; and its grain. */
  look: 'poster' | 'own' | 'solar' | 'plain'; grain: number
  /** The cycle this shot belongs to: what must hold across its hint, burst and settle keys on it. */
  cycle: number
  /** The big camera interface over this cycle. */
  cam: boolean
  residue: Residue[]
  enter: boolean; exit: boolean
  p: { a: number; b: number; c: number; d: number; e: number; f: number }
}

/** The film's beat in ms, by the seed: 84 to 114 to the minute. */
export const beatOf = (seed: number) => 60000 / (84 + hash(seed, 1) * 30)

/** The run of cycles: calm, hint, burst, settle; the cards between cycles; the brand clean to close. */
export function planShots(input: Pick<PromoInput, 'seconds' | 'intensity' | 'seed' | 'shots' | 'brandMode' | 'text' | 'subjects' | 'recognition'>, videos: number, pictures: number, iconCount = 0): { shots: Shot[]; beat: number } {
  const subjects: Subject[] = (input.subjects.length ? input.subjects : (['block'] as Subject[])).filter((x) => x !== 'icon' || iconCount > 0)
  if (!subjects.length) subjects.push('block')
  const rn = clamp01((input.recognition - 0.15) / 0.55)
  const k = clamp01(input.intensity)
  const allowed = (input.shots.length ? input.shots : SHOTS.map((s) => s.key)).filter((s) => s !== 'column')
  // The Fond needs a picture or a video to be the ground.
  const usable = allowed.filter((b) => b !== 'back' || videos + pictures > 0)
  const bursts: ShotKind[] = usable.length ? usable : ['blocks', 'mosh', 'confetti']
  const withColumn = !input.shots.length || input.shots.includes('column')
  const lineCount = (input.text?.lines ?? []).filter((l) => l.trim()).length
  const cards = lineCount > 1 ? lineCount : 0
  const total = input.seconds * 1000
  const beat = beatOf(input.seed)
  const out: Shot[] = []
  const favour = new Map<ShotKind, number>(SHOTS.map((sh) => [sh.key, 0.4 + hash(input.seed, sh.key.length, 6) * 1.2]))
  let at = 0, i = 0, card = 0, video = Math.floor(hash(input.seed, 2) * Math.max(1, videos)), picture = Math.floor(hash(input.seed, 3) * Math.max(1, pictures)), last: ShotKind | null = null
  let stacked = hash(input.seed, 4) < 0.65
  let subject: Subject = subjects[Math.floor(hash(input.seed, 63) * subjects.length)], iconIndex = Math.floor(hash(input.seed, 64) * Math.max(1, iconCount)), duo: Subject | null = null
  const mode = input.brandMode
  const params = (s: number) => ({ a: hash(s, 30), b: hash(s, 31), c: hash(s, 32), d: hash(s, 33), e: hash(s, 34), f: hash(s, 35) })
  const place = (s: number) => {
    // Shares of the FRAME, not of the safe area: the brand is large and overflows the safe zone most of the time.
    const bw = mode === 'center' ? 0.74 + hash(s, 14) * 0.2 : 0.55 + hash(s, 14) * 0.4
    const bx = mode === 'center' ? 0.5 : 0.35 + hash(s, 15) * 0.3
    const by = mode === 'center' ? 0.42 + hash(s, 16) * 0.1 : 0.3 + hash(s, 16) * 0.4
    return { bx, by, bw }
  }
  const push = (phase: Phase, kind: ShotKind, len: number, s: number, extra: Partial<Shot> = {}) => {
    const g = clamp01((phase === 'burst' ? 0.55 + k * 0.45 : phase === 'hint' ? 0.35 + k * 0.3 : phase === 'settle' ? 0.12 + k * 0.25 : 0.08 + k * 0.15) * (0.85 + hash(s, 36) * 0.3))
    const pl = place(s)
    const treatments: Treatment[] = ['cream', 'cream', 'cream', 'second', 'stroke', 'filled']
    out.push({ phase, kind, from: at, to: Math.min(total, at + len), seed: s, g, video, picture, card: -1, treat: treatments[Math.floor(hash(s, 13) * treatments.length)], stacked, pill: hash(s, 24) < 0.55, hud: hash(s, 25) < 0.5, scan: hash(s, 26) < 0.45, subject, iconIndex, duo, ...pl, huge: false, cycle: i, look: cycleLook, grain: cycleGrain, cam: cycleCam, residue: [], enter: false, exit: false, p: params(s), ...extra })
    at += len
  }
  const bumper = input.seconds <= 3
  const closing = bumper ? 0 : Math.round(900 + k * 300)
  // The picture's look and the camera, drawn per cycle.
  let cycleLook: Shot['look'] = 'poster', cycleGrain = 6, cycleCam = false
  const drawCycle = (s: number) => {
    // The picture's look: its own colours oftener and a finer grain as the recognition rises.
    const q = hash(s, 60)
    cycleLook = q < 0.3 + rn * 0.5 ? 'own' : q < 0.55 + rn * 0.4 ? 'poster' : 'solar'
    const coarse = 3 + (1 - rn) * 9
    cycleGrain = Math.max(2, Math.round(coarse * (0.7 + hash(s, 61) * 0.6)))
    cycleCam = hash(s, 62) < 0.35
    // The subject: one of those allowed, changing on most cycles; a second one joins on some.
    if (subjects.length > 1 && hash(s, 65) < 0.7) { const others = subjects.filter((x) => x !== subject); subject = others[Math.floor(hash(s, 66) * others.length)] }
    iconIndex = Math.floor(hash(s, 67) * Math.max(1, iconCount))
    stacked = subject === 'block'
    duo = subjects.length > 1 && hash(s, 68) < 0.3 ? subjects.filter((x) => x !== subject)[Math.floor(hash(s, 69) * (subjects.length - 1))] ?? null : null
  }
  drawCycle(input.seed)
  // The first calm: the brand arriving — or, now and then, a burst straight away.
  if (hash(input.seed, 7) < 0.8 || bumper) push('calm', 'column', Math.round(bumper ? 300 : 450 + hash(input.seed, 8) * 700), input.seed * 23 + 1, { enter: true })
  while (at < total - closing) {
    const s = input.seed * 23 + i * 131 + 7
    // A card takes a cycle's place when lines remain and the room runs short, or now and then.
    const left = total - closing - at
    const mustCard = card < cards && left < (cards - card + 1) * 2200
    if (card < cards && (mustCard || hash(s, 5) < 0.35)) {
      push('card', 'column', Math.round((1400 + hash(s, 9) * 900) * (1 - k * 0.3)), s, { card, p: params(s) })
      card += 1; i += 1; continue
    }
    drawCycle(s)
    if (hash(s, 8) < 0.5 && videos > 1) video = (video + 1 + Math.floor(hash(s, 9) * (videos - 1))) % videos
    if (hash(s, 10) < 0.5 && pictures > 1) picture = (picture + 1 + Math.floor(hash(s, 11) * (pictures - 1))) % pictures
    // The burst kind, by the draw's taste, never twice in a row.
    const pool = bursts.filter((b) => b !== last)
    const sum = pool.reduce((a, b) => a + (favour.get(b) ?? 1), 0)
    let q = hash(s, 6) * sum
    let kind: ShotKind = pool[pool.length - 1]
    for (const b of pool) { q -= favour.get(b) ?? 1; if (q <= 0) { kind = b; break } }
    const huge = hash(s, 40) < 0.35 + k * 0.2
    // Hint, burst, settle; the burst longer and the settle shorter with the force; a column settle now and then.
    push('hint', kind, Math.round(120 + hash(s, 41) * 160), s + 1, { huge })
    const stretch = kind === 'vomit' ? 2.6 : kind === 'ecto' ? 1.8 : kind === 'back' ? 1.5 : kind === 'split' || kind === 'windows' ? 1.4 : 1
    push('burst', kind, Math.round((bumper ? 700 : 420 + k * 900) * (0.75 + hash(s, 42) * 0.5) * stretch), s + 2, { huge })
    const residues: Residue[] = []
    if (kind === 'split') residues.push('split')
    if (kind === 'vomit') residues.push('pile')
    const rq = hash(s, 43)
    if (rq < 0.6) residues.push('bars')
    if (hash(s, 44) < 0.45) residues.push('block')
    if (hash(s, 45) < 0.4 + k * 0.3) residues.push('confetti')
    if (hash(s, 46) < 0.35) residues.push('line')
    const settleKind: ShotKind = withColumn && kind !== 'back' && hash(s, 47) < 0.3 ? 'column' : kind
    push('settle', settleKind, Math.round((bumper ? 800 : 1500 + hash(s, 48) * 1500) * (1.15 - k * 0.3)), s + 3, { residue: residues, huge: false })
    // A calm between cycles, sometimes.
    if (!bumper && hash(s, 49) < 0.4 && at < total - closing - 800) push('calm', 'column', Math.round(400 + hash(s, 50) * 600), s + 4)
    i += 1; last = kind
  }
  if (closing) { const s = input.seed * 23 + 9999; push('calm', 'column', total - at, s, { treat: 'cream', pill: true, subject: 'block', stacked: true, duo: null, bx: 0.5, by: 0.46, bw: 0.68, enter: hash(s, 18) < 0.4 }) }
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
  const others = input.palette.filter((c) => c && c.toLowerCase() !== accent.toLowerCase())
  /** The inks, as the Home's: each colour, a lighter and a deeper shade of it, and the cream. */
  const colours = [accent, ...others]
  const inks = colours.flatMap((c) => [c, mix(c, CREAM, 0.45), mix(c, '#000000', 0.42)])
  const inkAt = (q: number) => inks[Math.floor(q * inks.length)]
  let currentInks: string[] = []
  const colourAt = (q: number) => q < 0.4 - rn * 0.15 ? colours[Math.floor(hash(q * 1000, 200) * colours.length)] : q < 0.55 - rn * 0.15 ? CREAM : q < 0.8 + rn * 0.1 && currentInks.length ? currentInks[Math.floor(hash(q * 1000, 202) * currentInks.length)] : inkAt(hash(q * 1000, 201))
  const force = clamp01(input.intensity)
  const u = Math.min(W, H) / 1080
  const px = Math.max(1, Math.round(u))
  const font = input.titleFont
  const { shots, beat } = planShots(input, input.videos.length, input.stock.length, input.icons.length)
  const rn = clamp01((input.recognition - 0.15) / 0.55)
  const make = (w = W, h = H) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }
  const scratch = make(), scratch2 = make(), prev = make(), held = make(), pile = make()
  const sx = scratch.getContext('2d')!, s2 = scratch2.getContext('2d')!, pv = prev.getContext('2d')!, hc = held.getContext('2d')!, pc = pile.getContext('2d')!
  let heldFor = -1, pileFor = -1

  // ----- the step clock: the glitch moves by steps, slower when calm.
  const stepOf = (shot: Shot, at: number, scale = 1) => Math.floor(at / ((260 - shot.g * 170) * scale))
  const localOf = (shot: Shot, at: number) => clamp01((at - shot.from) / Math.max(1, shot.to - shot.from))

  // ----- sources, as matter only: posterised into the palette's tones, in coarse pixels, redone by step for a video.
  const videoOf = (shot: Shot) => { const v = input.videos[shot.video % Math.max(1, input.videos.length)]; return v && v.readyState >= 2 ? v : null }
  const pictureOf = (shot: Shot) => input.stock[shot.picture % Math.max(1, input.stock.length)] ?? null
  const sourceOf = (shot: Shot): CanvasImageSource | null => videoOf(shot) ?? pictureOf(shot)
  /** The matter canvases, three kept by key — the moment's look, the Fond's ground, a treatment's — so a frame needing two does not redo them. */
  const matterSlots: Array<{ key: string; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }> = []
  /** The picture's own inks: its two dominant hues, saturated — so the picture gives its tint to the whole film. */
  const pictureInkCache = new Map<string, string[]>()
  const hsl2hex = (h: number, sat: number, l: number) => { const f = (n: number) => { const k = (n + h / 30) % 12; const a = sat * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))) }; return `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('')}` }
  const pictureInks = (shot: Shot): string[] => {
    const key = `${shot.video}:${shot.picture}`
    const cached = pictureInkCache.get(key)
    if (cached) return cached
    const src = sourceOf(shot)
    if (!src) return []
    const small = make(24, 24), g = small.getContext('2d', { willReadFrequently: true })!
    cover(g, src, 0, 0, 24, 24)
    const d = g.getImageData(0, 0, 24, 24).data
    const bins = new Array<number>(12).fill(0), sats = new Array<number>(12).fill(0)
    for (let p = 0; p < d.length; p += 4) {
      const r = d[p] / 255, gg = d[p + 1] / 255, b = d[p + 2] / 255, mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), sat = mx ? (mx - mn) / mx : 0
      if (sat < 0.18 || mx < 0.15) continue
      const h = mx === r ? ((gg - b) / (mx - mn) + 6) % 6 : mx === gg ? (b - r) / (mx - mn) + 2 : (r - gg) / (mx - mn) + 4
      const bin = Math.floor(h * 2) % 12; bins[bin] += sat; sats[bin] += 1
    }
    const order = bins.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]).filter(([v]) => v > 0).slice(0, 2)
    const out = order.map(([, i]) => hsl2hex(i * 30 + 15, 0.85, 0.52))
    pictureInkCache.set(key, out)
    return out
  }
  const matterOf = (shot: Shot, at: number): HTMLCanvasElement | null => {
    const src = sourceOf(shot)
    if (!src) return null
    const isVideo = Boolean(videoOf(shot))
    const plain = shot.look === 'plain'
    const MW = Math.max(16, Math.round(W / shot.grain)), MH = Math.max(16, Math.round(H / shot.grain))
    const key = `${shot.video}:${shot.picture}:${isVideo ? Math.floor(at / 120) : 0}:${plain ? shot.cycle : shot.seed % 7}:${shot.look}:${shot.grain}`
    const hit = matterSlots.find((slot) => slot.key === key)
    if (hit) return hit.canvas
    let slot = matterSlots.length < 3 ? null : matterSlots.shift()!
    if (!slot) { const canvas = make(MW, MH); slot = { key, canvas, ctx: canvas.getContext('2d', { willReadFrequently: true })! } }
    slot.key = key; matterSlots.push(slot)
    const matterCanvas = slot.canvas, mc = slot.ctx
    if (matterCanvas.width !== MW || matterCanvas.height !== MH) { matterCanvas.width = MW; matterCanvas.height = MH }
    // The Fond's ground is the picture whole; the matter elsewhere a crop far zoomed by the seed.
    if (plain) cover(mc, src, 0, 0, MW, MH); else cover(mc, src, 0, 0, MW, MH, 1.2 + hash(shot.seed, 360) * 1.2, hash(shot.seed, 361), hash(shot.seed, 362))
    const data = mc.getImageData(0, 0, MW, MH), d = data.data
    if (shot.look === 'own' || plain) {
      // The picture's own colours, quantised to a few levels: the picture shows through, in coarse pixels, never clean. Finer steps for the Fond.
      const stepSize = plain ? Math.round(24 + (1 - rn) * 20) : Math.round(52 - rn * 36), half = Math.round(stepSize / 2)
      for (let p = 0; p < d.length; p += 4) { d[p] = Math.min(255, Math.floor(d[p] / stepSize) * stepSize + half); d[p + 1] = Math.min(255, Math.floor(d[p + 1] / stepSize) * stepSize + half); d[p + 2] = Math.min(255, Math.floor(d[p + 2] / stepSize) * stepSize + half) }
    } else if (shot.look === 'solar') {
      // Solarised: three levels — deep, one vivid ink of the picture, one of the palette — with dark edges where the levels meet.
      const inks = pictureInks(shot)
      const c1 = inks[0] ?? colours[0], c2 = inks[1] ?? colours[Math.floor(hash(shot.seed, 363) * colours.length)]
      const tones = [rgbOf(DEEP), rgbOf(c1), rgbOf(c2)]
      const levels = new Uint8Array(MW * MH)
      for (let p = 0; p < d.length; p += 4) { const lum = (d[p] * 0.299 + d[p + 1] * 0.587 + d[p + 2] * 0.114) / 255; levels[p / 4] = lum < 0.3 ? 0 : lum < 0.62 ? 1 : 2 }
      for (let i = 0; i < levels.length; i += 1) { const x = i % MW, y = Math.floor(i / MW); const edge = (x > 0 && levels[i - 1] !== levels[i]) || (y > 0 && levels[i - MW] !== levels[i]); const t = edge ? tones[0] : tones[levels[i]]; d[i * 4] = t[0]; d[i * 4 + 1] = t[1]; d[i * 4 + 2] = t[2] }
    } else {
      const c = colours[Math.floor(hash(shot.seed, 363) * colours.length)]
      const tones = [DEEP, mix(c, '#000000', 0.42), c, mix(c, CREAM, 0.45), CREAM].map(rgbOf)
      for (let p = 0; p < d.length; p += 4) {
        const lum = (d[p] * 0.299 + d[p + 1] * 0.587 + d[p + 2] * 0.114) / 255
        const n = (((p / 4) % 2) + (Math.floor(p / 4 / MW) % 2)) * 0.07
        const t = tones[Math.max(0, Math.min(4, Math.floor((lum + n) * 4.4)))]
        d[p] = t[0]; d[p + 1] = t[1]; d[p + 2] = t[2]
      }
    }
    mc.putImageData(data, 0, 0)
    return matterCanvas
  }
  /** Matter drawn to cover a rectangle, in coarse pixels, a crop by the seed. */
  const matterIn = (ctx: CanvasRenderingContext2D, shot: Shot, at: number, x: number, y: number, w: number, h: number, zoom = 1, fx = 0.5, fy = 0.5) => {
    const m = matterOf(shot, at)
    if (!m) { ctx.fillStyle = inkAt(hash(x, y, 364)); ctx.fillRect(x, y, w, h); return }
    ctx.imageSmoothingEnabled = false
    cover(ctx, m, x, y, w, h, zoom, fx, fy)
    ctx.imageSmoothingEnabled = true
  }

  // ----- the Home's bed: lines, media lines, tears, blocks and voids, jumping by steps with delays.
  type Frag = { kind: 'line' | 'media' | 'tear' | 'block' | 'void'; x: number; y: number; w: number; h: number; a: number; c: string; delay: number; drift: number; pop: boolean; zoom: number; fx: number; fy: number }
  const bedCache = new Map<number, Frag[]>()
  const bedOf = (shot: Shot): Frag[] => {
    const key = Math.floor(shot.seed / 23)
    let f = bedCache.get(key)
    if (f) return f
    f = []
    const r = (i: number, k: number) => hash(key, i, k)
    const lines = 60 + Math.round(force * 110), tears = 6 + Math.round(force * 16), blocks = 4 + Math.round(force * 10)
    for (let i = 0; i < lines; i += 1) f.push({ kind: r(i, 1) > 0.54 ? 'media' : 'line', x: -0.1 + r(i, 2) * 1.2, y: r(i, 3), w: 0.05 + r(i, 4) * 0.78, h: (r(i, 5) > 0.8 ? 2 + r(i, 6) * 2 : 0.6 + r(i, 6) * 1.4) * px, a: 0.12 + r(i, 7) * 0.34, c: inkAt(r(i, 8)), delay: r(i, 9) * 3000, drift: (-18 + r(i, 10) * 36) * u, pop: r(i, 11) > 0.78, zoom: 1.4 + r(i, 12) * 2.8, fx: r(i, 13), fy: r(i, 14) })
    for (let i = 0; i < tears; i += 1) f.push({ kind: 'tear', x: -0.08 + r(i, 21) * 1.1, y: r(i, 22), w: 0.15 + r(i, 23) * 0.72, h: (4 + r(i, 24) * 18) * u, a: 0.14 + r(i, 25) * 0.34, c: inkAt(r(i, 26)), delay: r(i, 27) * 3000, drift: (-24 + r(i, 28) * 48) * u, pop: r(i, 29) > 0.55, zoom: 1.2 + r(i, 30) * 2.6, fx: r(i, 31), fy: r(i, 32) })
    for (let i = 0; i < blocks; i += 1) f.push({ kind: r(i, 41) > 0.72 ? 'void' : 'block', x: -0.03 + r(i, 42) * 1.04, y: r(i, 43), w: 0.05 + r(i, 44) * 0.34, h: (14 + r(i, 45) * 64) * u, a: r(i, 41) > 0.72 ? 0.42 + r(i, 46) * 0.28 : 0.2 + r(i, 46) * 0.36, c: inkAt(r(i, 47)), delay: r(i, 48) * 3000, drift: (-28 + r(i, 49) * 56) * u, pop: r(i, 50) > 0.42, zoom: 1.6 + r(i, 51) * 3.4, fx: r(i, 52), fy: r(i, 53) })
    bedCache.set(key, f)
    return f
  }
  const bed = (ctx: CanvasRenderingContext2D, shot: Shot, at: number, strength: number) => {
    const frags = bedOf(shot)
    const cycle = 10000
    for (const fr of frags) {
      // The jump: at rest, then out to the drift, back a little, then at rest — by steps on a ten-second cycle, each with its delay.
      const t = ((at + fr.delay) % cycle) / cycle
      const dx = t < 0.34 ? 0 : t < 0.39 ? fr.drift : t < 0.44 ? fr.drift * -0.45 : 0
      if (fr.pop && t > 0.53 && t < 0.6) continue
      const x = Math.round(fr.x * W + dx), y = Math.round(fr.y * H), w = Math.round(fr.w * W), h = Math.max(1, Math.round(fr.h))
      ctx.globalAlpha = fr.a * strength
      if (fr.kind === 'line') {
        const gr = ctx.createLinearGradient(x, 0, x + w, 0)
        gr.addColorStop(0, rgba(fr.c, 0)); gr.addColorStop(0.14, fr.c); gr.addColorStop(0.44, rgba(CREAM, 0.64)); gr.addColorStop(0.66, fr.c); gr.addColorStop(1, rgba(fr.c, 0))
        ctx.fillStyle = gr; ctx.fillRect(x, y, w, h)
      } else if (fr.kind === 'void') {
        ctx.fillStyle = DEEP; ctx.fillRect(x, y, w, h); ctx.fillStyle = fr.c; ctx.fillRect(x, y, px, h); ctx.fillRect(x, y + h - px, w, px)
      } else {
        matterIn(ctx, shot, at, x, y, w, h, fr.zoom, fr.fx, fr.fy)
        if (fr.kind === 'tear') { ctx.fillStyle = rgba(CREAM, 0.38); ctx.fillRect(x, y, 2 * px, h) }
      }
    }
    ctx.globalAlpha = 1
  }
  const scanlines = (ctx: CanvasRenderingContext2D, a: number) => { ctx.fillStyle = rgba(CREAM, a); for (let y = 0; y < H; y += 3 * px) ctx.fillRect(0, y, W, px) }
  /** The Fond: the picture as the ground of a whole cycle — its own colours by steps, in coarse pixels, tinted with the dominant colour, veiled, striped, torn by step. Never clean. */
  const backdrop = (ctx: CanvasRenderingContext2D, shot: Shot, at: number, veil: number) => {
    const s = shot.seed, step = stepOf(shot, at, 1.5)
    // Coarser pixels, fewer colour steps and a stronger tint as the recognition is low: the picture is read, not seen.
    const ground: Shot = { ...shot, look: 'plain', grain: Math.max(3, Math.round((3.5 + (1 - rn) * 4.5) * (0.85 + hash(shot.cycle, 510) * 0.3))) }
    matterIn(ctx, ground, at, 0, 0, W, H)
    ctx.fillStyle = rgba(accent, 0.12 + (1 - rn) * 0.18); ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = rgba(DEEP, veil); ctx.fillRect(0, 0, W, H)
    const n = 1 + Math.round(shot.g * 6)
    for (let i = 0; i < n; i += 1) {
      if (hash(s, step, i, 502) > 0.6) continue
      const h = Math.max(2 * px, Math.round(H * (0.004 + hash(s, step, i, 503) * 0.05))), y = Math.round(hash(s, step, i, 504) * (H - h)), dx = Math.round((hash(s, step, i, 505) - 0.5) * W * (0.03 + shot.g * 0.2))
      ctx.drawImage(ctx.canvas, 0, y, W, h, dx, y, W, h)
      if (hash(s, i, 506) < 0.3) { ctx.fillStyle = rgba(CREAM, 0.5); ctx.fillRect(0, y, W, px) }
    }
    scanlines(ctx, 0.05)
  }

  // ----- small pieces: bars at the sides, confetti, the camera's tiny texts, the pill.
  const bars = (ctx: CanvasRenderingContext2D, shot: Shot, at: number, n: number, alpha: number) => {
    const s = shot.seed, step = stepOf(shot, at, 2)
    for (let i = 0; i < n; i += 1) {
      const side = hash(s, i, 60) < 0.5 ? 0 : 1
      const bw = Math.round(W * (0.008 + hash(s, i, 61) * (0.015 + shot.g * 0.035))), bx = side ? W - Math.round(W * (0.02 + hash(s, i, 62) * 0.12)) - bw : Math.round(W * (0.02 + hash(s, i, 62) * 0.12))
      const flick = hash(step, i, 63) < 0.15 ? 0.5 : 1
      ctx.globalAlpha = alpha * flick
      ctx.fillStyle = colourAt(hash(s, i, 64)); ctx.fillRect(bx, 0, bw, H)
      // A lighter core and a few dark gaps, as a bar on a screen.
      ctx.fillStyle = rgba(CREAM, 0.35); ctx.fillRect(bx + Math.round(bw * 0.35), 0, Math.max(px, Math.round(bw * 0.2)), H)
      ctx.fillStyle = DEEP; for (let j = 0; j < 3; j += 1) if (hash(s, i, j, 65) < 0.5) ctx.fillRect(bx, Math.round(hash(s, i, j, step, 66) * H), bw, Math.round(H * (0.004 + hash(s, i, j, 67) * 0.02)))
    }
    ctx.globalAlpha = 1
  }
  const confetti = (ctx: CanvasRenderingContext2D, shot: Shot, at: number, n: number, area: { x: number; y: number; w: number; h: number }) => {
    const s = shot.seed, step = stepOf(shot, at)
    for (let i = 0; i < n; i += 1) {
      if (hash(s, i, step, 70) < 0.35) continue
      const sz = Math.round(u * (6 + hash(s, i, 71) * 14))
      ctx.fillStyle = colourAt(hash(s, i, 72)); ctx.globalAlpha = 0.7 + hash(s, i, 73) * 0.3
      ctx.fillRect(Math.round(area.x + hash(s, i, 74) * (area.w - sz)), Math.round(area.y + hash(s, i, 75) * (area.h - sz)), sz, sz)
    }
    ctx.globalAlpha = 1
  }
  const hud = (ctx: CanvasRenderingContext2D, shot: Shot, at: number, frame: number) => {
    const s = shot.seed
    ctx.save(); ctx.globalAlpha = 0.6; ctx.fillStyle = CREAM; ctx.font = `${Math.round(u * 16)}px ${font}`; ctx.textBaseline = 'top'; ctx.textAlign = 'left'
    // The swatches, tiny, top left; a label; a timecode; numbers at the corners.
    colours.slice(0, 3).forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(S.x + i * Math.round(u * 14), S.y, Math.round(u * 12), Math.round(u * 12)) })
    ctx.fillStyle = CREAM
    ctx.fillText('RAN', S.x + Math.round(u * 50), S.y)
    ctx.textAlign = 'right'; ctx.fillText(`${String(Math.floor(at / 1000)).padStart(2, '0')}:${String(frame % 30).padStart(2, '0')}`, S.x + S.w, S.y)
    ctx.fillText(`${String(100 + Math.floor(hash(s, 80) * 160))}`, S.x + S.w, S.y + S.h - Math.round(u * 18))
    ctx.textAlign = 'left'; ctx.fillText(`00:${String(Math.floor(at / 100) % 60).padStart(2, '0')}`, S.x, S.y + S.h - Math.round(u * 18))
    ctx.restore()
  }
  /** The camera's interface, big, at the frame's edges: coloured brackets, the status line with swatches, F R N down the right, a counter, a progress line, a bar. */
  const camBig = (ctx: CanvasRenderingContext2D, shot: Shot, at: number, frame: number) => {
    const m = Math.round(W * 0.06), l = Math.round(W * 0.1), t = Math.floor(at / 1000)
    const flick = hash(Math.floor(at / 130), shot.seed, 410) < 0.12 ? 0.35 : 1
    ctx.save(); ctx.globalAlpha = 0.9 * flick
    const cs = [colours[0], colours[1] ?? CREAM, colours[2] ?? colours[0], CREAM]
    ctx.lineWidth = Math.max(2, Math.round(u * 5))
    ;([[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]] as const).forEach(([cx, cy, dx, dy], i) => { ctx.strokeStyle = cs[(i + Math.floor(at / 900)) % cs.length]; ctx.beginPath(); ctx.moveTo(cx, cy + dy * l); ctx.lineTo(cx, cy); ctx.lineTo(cx + dx * l, cy); ctx.stroke() })
    ctx.fillStyle = CREAM; ctx.font = `${Math.round(u * 36)}px ${font}`; ctx.textBaseline = 'top'; ctx.textAlign = 'left'
    colours.slice(0, 3).forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(m + i * Math.round(u * 26), m + Math.round(u * 6), Math.round(u * 22), Math.round(u * 22)) })
    ctx.fillStyle = CREAM; ctx.fillText(`17:${String(13 + t).padStart(2, '0')}  ${String(140 + (frame % 9)).padStart(3, '0')}`, m + Math.round(u * 80), m)
    ctx.textAlign = 'right'; ctx.fillStyle = colours[0]; ctx.beginPath(); ctx.arc(W - m - Math.round(u * 40), m + Math.round(u * 15), Math.round(u * 9), 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = CREAM; ctx.fillText('●', W - m, m)
    ;['F', 'R', 'N'].forEach((ch, i) => ctx.fillText(ch, W - m, Math.round(H * 0.18) + i * Math.round(u * 40)))
    ctx.textAlign = 'left'; ctx.fillText(`${72 + (Math.floor(at / 700) % 8)}:00`, m, H - m - Math.round(u * 70))
    ctx.fillStyle = rgba(CREAM, 0.6); ctx.fillRect(Math.round(W * 0.3), H - m - Math.round(u * 20), Math.round(W * 0.4), px)
    ctx.fillStyle = CREAM; ctx.fillRect(Math.round(W * 0.3), H - m - Math.round(u * 22), Math.round(W * 0.4 * ((at % 4000) / 4000)), 3 * px)
    ctx.restore()
  }
  const pillAt = (ctx: CanvasRenderingContext2D, cx: number, y: number, width: number, alpha = 1) => {
    const w = Math.round(width), h = Math.round(w * 0.14), x = Math.round(cx - w / 2), r = h / 2
    ctx.globalAlpha = alpha
    ctx.fillStyle = accent; ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2); ctx.lineTo(x + r, y + h); ctx.arc(x + r, y + r, r, Math.PI / 2, -Math.PI / 2); ctx.closePath(); ctx.fill()
    ctx.fillStyle = CREAM; ctx.font = `700 ${Math.round(h * 0.5)}px ${font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(SITE, cx, y + h / 2)
    ctx.globalAlpha = 1
  }

  const wrap = (ctx: CanvasRenderingContext2D, line: string, maxW: number) => { const lines: string[] = []; let cur = ''; for (const w of line.split(/\s+/)) { const next = cur ? `${cur} ${w}` : w; if (ctx.measureText(next).width > maxW && cur) { lines.push(cur); cur = w } else cur = next } lines.push(cur); return lines }

  // ----- the brand: its rectangle (overflowing when huge), its cells, its treatments and mistreatments.
  const logoOf = (shot: Shot): HTMLImageElement => shot.subject === 'icon' && input.icons.length ? input.icons[shot.iconIndex % input.icons.length] : shot.subject === 'block' ? input.logoVertical : input.logo
  const darkOf = (shot: Shot): HTMLImageElement | null => shot.subject === 'icon' ? null : shot.subject === 'block' ? input.logoVerticalDark : input.logoDark
  /** The subject's shape in deep: the dark letters, or the icon tinted. */
  const deepOf = (shot: Shot, w: number, h: number): CanvasImageSource => darkOf(shot) ?? tinted(logoOf(shot), DEEP, w, h, s2)
  /** The constant words' block, when there is one: the brand keeps clear of it. */
  const measure = make(8, 8).getContext('2d')!
  const wordsBlock = (): { y: number; h: number } | null => {
    const t = input.text
    const line = t?.lines.length === 1 ? t.lines[0].trim() : ''
    if (!t || !line) return null
    const size = Math.round(t.size * u)
    measure.font = `${t.weight} ${size}px ${t.font}`
    const maxW = t.x === null ? S.w : t.width * W
    const lines = wrap(measure, line, maxW)
    const blockH = Math.round(lines.length * size * 1.1)
    const zone = Math.floor(hash(input.seed, 360) * 3)
    const top = t.y === null ? Math.round(zone === 0 ? S.y : zone === 1 ? S.y + S.h / 2 - blockH / 2 : S.y + S.h - blockH) : Math.round(t.y * H)
    return { y: top, h: blockH }
  }
  const brandRect = (shot: Shot, at: number) => {
    const img = logoOf(shot)
    const base = shot.huge ? W * (1.05 + hash(shot.seed, 61) * 0.35) * (shot.subject === 'icon' ? 0.7 : 1) : W * shot.bw * (shot.subject === 'icon' ? 0.62 : shot.stacked ? 0.82 : 1)
    let w = Math.round(base), h = Math.round(w * img.naturalHeight / Math.max(1, img.naturalWidth))
    if (!shot.huge && h > H * 0.75) { const f = H * 0.75 / h; w = Math.round(w * f); h = Math.round(h * f) }
    const breathe = 1 + Math.sin(at / 1700 + shot.seed) * 0.012
    const cx = shot.huge ? W / 2 : shot.bx * W
    let cy = shot.huge ? H / 2 : shot.by * H
    // The brand keeps its place and passes behind the words, in another treatment (drawBrand); on one cycle in three it steps aside instead — just enough, the nearer side.
    const wb = shot.huge || hash(shot.cycle, 520) >= 0.33 ? null : wordsBlock()
    if (wb) {
      const margin = H * 0.02
      const y0 = cy - h / 2, y1 = cy + h / 2
      if (y1 > wb.y - margin && y0 < wb.y + wb.h + margin) {
        const above = wb.y - margin - h / 2, below = wb.y + wb.h + margin + h / 2
        cy = cy - above <= below - cy ? Math.max(h / 2 * 0.8, above) : Math.min(H - h / 2 * 0.8, below)
      }
    }
    return { img, x: Math.round(cx - w * breathe / 2), y: Math.round(cy - h * breathe / 2), w: Math.round(w * breathe), h: Math.round(h * breathe) }
  }
  /** The letters as cells: six across, or three over three. */
  const cellsOf = (shot: Shot, r: { x: number; y: number; w: number; h: number }) => {
    const cols = shot.subject === 'icon' ? 2 : shot.stacked ? 3 : 6, rows = shot.subject === 'icon' ? 2 : shot.stacked ? 2 : 1
    const cw = r.w / cols, ch = r.h / rows
    const out: Array<{ x: number; y: number; w: number; h: number; sx: number; sy: number; sw: number; sh: number; i: number }> = []
    const img = logoOf(shot)
    for (let row = 0; row < rows; row += 1) for (let col = 0; col < cols; col += 1) out.push({ x: r.x + col * cw, y: r.y + row * ch, w: cw, h: ch, sx: col * img.naturalWidth / cols, sy: row * img.naturalHeight / rows, sw: img.naturalWidth / cols, sh: img.naturalHeight / rows, i: row * cols + col })
    return out
  }
  const tinted = (img: CanvasImageSource, colour: string, w: number, h: number, target = sx) => {
    const c = target === sx ? scratch : scratch2
    target.clearRect(0, 0, W, H); target.globalCompositeOperation = 'source-over'; target.drawImage(img, 0, 0, w, h)
    target.globalCompositeOperation = 'source-in'; target.fillStyle = colour; target.fillRect(0, 0, w, h); target.globalCompositeOperation = 'source-over'
    return c
  }
  /** A real outline: the tinted shape laid in eight directions, the deep shape over it. */
  const strokeShape = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, dark: HTMLImageElement | null, colour: string, x: number, y: number, w: number, h: number) => {
    const o = Math.max(2, Math.round(u * 4))
    const tint = tinted(img, colour, w, h)
    for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o], [-o, -o], [o, -o], [-o, o], [o, o]]) ctx.drawImage(tint, 0, 0, w, h, x + dx, y + dy, w, h)
    if (dark) ctx.drawImage(dark, x, y, w, h); else ctx.drawImage(tinted(img, DEEP, w, h, s2), 0, 0, w, h, x, y, w, h)
  }
  /** The brand filled with matter: the shape as a mask on the texture. */
  const filledShape = (ctx: CanvasRenderingContext2D, shot: Shot, at: number, img: HTMLImageElement, x: number, y: number, w: number, h: number, zoom = 1.3) => {
    sx.clearRect(0, 0, W, H); sx.globalCompositeOperation = 'source-over'; sx.drawImage(img, x, y, w, h)
    sx.globalCompositeOperation = 'source-in'; matterIn(sx, shot, at, x, y, w, h, zoom, hash(shot.seed, 90), hash(shot.seed, 91)); sx.globalCompositeOperation = 'source-over'
    ctx.drawImage(scratch, 0, 0)
  }
  /** True when a rectangle crosses the constant words' block: what is drawn there passes behind the words. */
  const behindWords = (r: { y: number; h: number }) => { const wb = wordsBlock(); return Boolean(wb) && r.y < wb!.y + wb!.h + H * 0.01 && r.y + r.h > wb!.y - H * 0.01 }
  /** The brand in its treatment, whole — with the entrance and the exit of a calm, and the deformations of the deformed mode. Behind the words it is never cream like them: a colour, an outline, or filled with matter. */
  const drawBrand = (ctx: CanvasRenderingContext2D, shot: Shot, at: number, place?: { x: number; y: number; w: number; h: number }, alphaIn = 1) => {
    const r = place ?? brandRect(shot, at)
    const img = logoOf(shot), dark = darkOf(shot)
    const behind = behindWords(r)
    const treat: Treatment = behind && shot.treat === 'cream' ? (['second', 'stroke', 'filled'] as Treatment[])[Math.floor(hash(shot.cycle, 521) * 3)] : shot.treat
    const local = localOf(shot, at)
    let { x, y, w, h } = r
    let alpha = alphaIn, spread = 0
    if (shot.enter && local < 0.3) { const t = easeOut(local / 0.3); const q = hash(shot.seed, 92); if (q < 0.4) { const f = 1.8 - 0.8 * t; const nw = Math.round(w * f), nh = Math.round(h * f); x = Math.round(x + w / 2 - nw / 2); y = Math.round(y + h / 2 - nh / 2); w = nw; h = nh } else if (q < 0.7) spread = 1 - t; else alpha *= t }
    if (shot.exit && local > 0.85) { const t = easeIn((local - 0.85) / 0.15); spread = t * 1.2 }
    if (input.brandMode === 'deformed' && shot.phase === 'settle') {
      const q = hash(shot.seed, 93)
      if (q < 0.33) { const f = 1.08 + hash(shot.seed, 94) * 0.35 + Math.sin(at / 1300) * 0.04; const nw = Math.round(w * f); x = Math.round(x + w / 2 - nw / 2); w = nw }
      else if (q < 0.66) { ctx.save(); ctx.transform(1, 0, (hash(shot.seed, 95) - 0.5) * 0.5 + Math.sin(at / 1100) * 0.06, 1, 0, 0); x -= Math.round(((hash(shot.seed, 95) - 0.5) * 0.5) * (y + h / 2)) }
      else { ctx.save(); ctx.translate(x + w, 0); ctx.scale(-1, 1); x = 0 }
    }
    ctx.globalAlpha = alpha
    if (spread > 0.001) {
      for (const c of cellsOf(shot, { x, y, w, h })) { const ang = hash(shot.seed, c.i, 96) * Math.PI * 2, dist = (0.1 + hash(shot.seed, c.i, 97) * 0.4) * W * spread; ctx.drawImage(img, c.sx, c.sy, c.sw, c.sh, Math.round(c.x + Math.cos(ang) * dist), Math.round(c.y + Math.sin(ang) * dist * 0.7), Math.round(c.w), Math.round(c.h)) }
    } else if (shot.residue.includes('split')) splitCells(ctx, shot, { x, y, w, h }, 1)
    else switch (treat) {
      case 'second': ctx.drawImage(tinted(img, others[0] ?? accent, w, h), 0, 0, w, h, x, y, w, h); break
      case 'stroke': strokeShape(ctx, img, dark, hash(shot.seed, 98) < 0.6 ? CREAM : accent, x, y, w, h); break
      case 'filled': { const o = Math.max(1, Math.round(u * 2)); const tint = tinted(img, CREAM, w, h); for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o]]) ctx.drawImage(tint, 0, 0, w, h, x + dx, y + dy, w, h); filledShape(ctx, shot, at, img, x, y, w, h); break }
      default: ctx.drawImage(img, x, y, w, h)
    }
    if (input.brandMode === 'deformed' && shot.phase === 'settle' && hash(shot.seed, 93) >= 0.33) ctx.restore()
    ctx.globalAlpha = 1
    // The pill under the block, unless it or the block would cross the words.
    const pillW = Math.max(S.w * 0.35, r.w * 0.7), pillY = Math.round(r.y + r.h + H * 0.025)
    if (shot.pill && shot.subject === 'block' && spread < 0.2 && alpha > 0.5 && !place && !shot.huge && !behind && !behindWords({ y: pillY, h: pillW * 0.14 })) pillAt(ctx, r.x + r.w / 2, pillY, pillW, alpha)
  }
  /** The letters displaced in columns with their dark doubles offset — the shattered arrangement of the references, which stays. */
  const splitCells = (ctx: CanvasRenderingContext2D, shot: Shot, r: { x: number; y: number; w: number; h: number }, amount: number) => {
    const img = logoOf(shot), dark = darkOf(shot)
    const s = Math.floor(shot.seed / 23) * 23 + 2
    const deep = dark ?? tinted(img, DEEP, img.naturalWidth, img.naturalHeight, s2)
    for (const c of cellsOf(shot, r)) {
      const dx = Math.round((hash(s, c.i, 400) - 0.5) * r.w * 0.45 * amount), dy = Math.round((hash(s, c.i, 401) - 0.5) * r.h * 0.5 * amount)
      const ox = Math.round(u * (10 + hash(s, c.i, 402) * 30)) * (hash(s, c.i, 403) < 0.5 ? -1 : 1)
      const x = Math.round(c.x + dx), y = Math.round(c.y + dy), w = Math.round(c.w), h = Math.round(c.h)
      if (hash(s, c.i, 404) < 0.7) ctx.drawImage(deep, c.sx, c.sy, c.sw, c.sh, x + ox, y, w, h)
      ctx.drawImage(img, c.sx, c.sy, c.sw, c.sh, x, y, w, h)
    }
  }
  /** The brand mistreated by the moment's strength, by step: thin slices; a cell swapped or mirrored; a fringe in two inks on strong steps. */
  const mistreat = (ctx: CanvasRenderingContext2D, shot: Shot, r: { x: number; y: number; w: number; h: number }, at: number, g = shot.g) => {
    if (g < 0.08) return
    const s = shot.seed, step = stepOf(shot, at)
    const x0 = Math.max(0, r.x - Math.round(W * 0.03)), y0 = Math.max(0, r.y - Math.round(H * 0.01)), w0 = Math.min(W - x0, r.w + Math.round(W * 0.06)), h0 = Math.min(H - y0, r.h + Math.round(H * 0.02))
    if (w0 <= 0 || h0 <= 0) return
    if (hash(s, step, 300) < g * 0.7) { const n = 1 + Math.round(g * 5); for (let i = 0; i < n; i += 1) { const sh = Math.max(px, Math.round(h0 * (0.008 + hash(s, step, i, 301) * 0.05))), sy = y0 + Math.round(hash(s, step, i, 302) * (h0 - sh)); ctx.drawImage(ctx.canvas, x0, sy, w0, sh, x0 + Math.round((hash(s, step, i, 303) - 0.5) * w0 * (0.04 + g * 0.25)), sy, w0, sh) } }
    if (hash(s, step, 304) < g * 0.35) { const cells = cellsOf(shot, r); const a = cells[Math.floor(hash(s, step, 305) * cells.length)], b = cells[Math.floor(hash(s, step, 306) * cells.length)]; if (a && b && a !== b) { sx.clearRect(0, 0, W, H); sx.globalCompositeOperation = 'source-over'; sx.drawImage(ctx.canvas, a.x, a.y, a.w, a.h, b.x, b.y, b.w, b.h); sx.drawImage(ctx.canvas, b.x, b.y, b.w, b.h, a.x, a.y, a.w, a.h); ctx.drawImage(scratch, a.x, a.y, a.w, a.h, a.x, a.y, a.w, a.h); ctx.drawImage(scratch, b.x, b.y, b.w, b.h, b.x, b.y, b.w, b.h) } }
    // The fringe: the subject's own shape in two inks, offset either side — never the frame's region, which would lay a solid block behind the letters.
    if (g > 0.5 && hash(s, step, 307) < g * 0.4) { const off = Math.round(u * (3 + g * 5)), img = logoOf(shot); ctx.globalAlpha = 0.5; ctx.drawImage(tinted(img, accent, r.w, r.h), 0, 0, r.w, r.h, r.x - off, r.y, r.w, r.h); ctx.drawImage(tinted(img, others[0] ?? CREAM, r.w, r.h), 0, 0, r.w, r.h, r.x + off, r.y, r.w, r.h); ctx.globalAlpha = 1 }
  }

  // ----- the words
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
    const zone = preferred
    const left = t.x === null ? S.x : t.x * W, top = t.y === null ? topOf(zone) : Math.round(t.y * H)
    const x = Math.round(left + (t.align === 'center' ? maxW / 2 : t.align === 'right' ? maxW : 0))
    const step = stepOf(shot, at)
    const jx = shot.g > 0.5 && hash(step, 350) < shot.g * 0.3 ? Math.round((hash(step, 351) - 0.5) * W * 0.03) : 0
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, Math.round(size * 0.12)); ctx.strokeStyle = DEEP
    lines.forEach((l, i) => { const y = top + i * Math.round(size * 1.1); ctx.strokeText(l, x + jx, y); ctx.fillStyle = CREAM; ctx.fillText(l, x + jx, y) })
  }
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
    const shown = Math.ceil(line.length * Math.min(1, (at - shot.from) / 500))
    let count = 0
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, Math.round(size * 0.12)); ctx.strokeStyle = DEEP
    lines.forEach((l, i) => { const part = l.slice(0, Math.max(0, shown - count)); count += l.length + 1; const y = top + i * Math.round(size * 1.1); ctx.strokeText(part, x, y); ctx.fillStyle = CREAM; ctx.fillText(part, x, y) })
  }
  const giantMask = (target: CanvasRenderingContext2D, at: number, shot: Shot) => {
    const line = (input.text?.lines[0] ?? 'RANDOM').trim().toUpperCase() || 'RANDOM'
    const words = line.split(/\s+/).slice(0, 4)
    target.clearRect(0, 0, W, H); target.globalCompositeOperation = 'source-over'
    target.font = `900 100px ${input.text?.font ?? font}`
    const widest = Math.max(...words.map((w) => target.measureText(w).width), 1)
    const size = Math.round(Math.min(100 * W * 1.05 / widest, H * 0.9 / Math.max(1, words.length) / 1.05))
    target.font = `900 ${size}px ${input.text?.font ?? font}`; target.textAlign = 'center'; target.textBaseline = 'middle'; target.fillStyle = CREAM
    const cy0 = H / 2 - (words.length - 1) * size * 0.525
    words.forEach((w, i) => target.fillText(w, W / 2 + Math.round((hash(shot.seed, i, 370) - 0.5) * W * 0.1 * Math.sin(at / 900 + i)), cy0 + i * size * 1.05))
    return { x: 0, y: Math.round(cy0 - size * 0.6), w: W, h: Math.round(words.length * size * 1.05 + size * 0.2) }
  }

  // ----- the moments
  const sideTexture = (ctx: CanvasRenderingContext2D, shot: Shot, at: number, inner: { x: number; w: number }, alpha = 0.85) => {
    // The texture on the sides of a column, in a few columns moving by step.
    const step = stepOf(shot, at, 2)
    ctx.globalAlpha = alpha
    for (const [x0, x1] of [[0, inner.x], [inner.x + inner.w, W]]) {
      const cols = 2 + Math.round(hash(shot.seed, x0, 100) * 3), cw = Math.ceil((x1 - x0) / cols)
      for (let c = 0; c < cols; c += 1) matterIn(ctx, shot, at, x0 + c * cw, 0, cw, H, 1.5 + hash(shot.seed, c, x0, 101) * 2, hash(shot.seed, step, c, x0, 102), hash(shot.seed, step, c, x0, 103))
    }
    ctx.globalAlpha = 1
  }
  const drawMoment = (ctx: CanvasRenderingContext2D, shot: Shot, at: number, frame: number) => {
    const s = shot.seed, p = shot.p, g = shot.g
    const local = localOf(shot, at)
    const step = stepOf(shot, at)
    ctx.fillStyle = DEEP; ctx.fillRect(0, 0, W, H)
    currentInks = pictureInks(shot)
    const r = brandRect(shot, at)
    switch (shot.phase) {
      case 'calm': {
        bed(ctx, shot, at, 0.6 + force * 0.4)
        drawBrand(ctx, shot, at)
        mistreat(ctx, shot, r, at, g * 0.6)
        break
      }
      case 'card': {
        if (p.a < 0.5) { ctx.fillStyle = hash(s, 204) < 0.6 ? accent : (others[0] ?? accent); ctx.fillRect(0, 0, W, H) } else bed(ctx, shot, at, 0.8)
        drawCard(ctx, shot, at)
        if (p.b < 0.5) { const w = Math.round(S.w * 0.26), h = Math.round(w * input.logo.naturalHeight / Math.max(1, input.logo.naturalWidth)); drawBrand(ctx, { ...shot, subject: 'wordmark', stacked: false, treat: 'cream', pill: false, residue: [] }, at, { x: S.x + S.w - w, y: S.y + S.h - h, w, h }) }
        break
      }
      case 'hint': {
        // The brand with the first signs: a fringe in two inks, drips falling from the letters, a dot pattern through it, or a flicker of its outline. For the Fond, the ground arrives in columns.
        if (shot.kind === 'back') { backdrop(ctx, shot, at, 0.3); const cols = 8 + Math.round(p.a * 6), cw = Math.ceil(W / cols); ctx.fillStyle = DEEP; for (let c = 0; c < cols; c += 1) if (hash(s, c, 507) > local * 1.15) ctx.fillRect(c * cw, 0, cw, H); bed(ctx, shot, at, 0.3) }
        else bed(ctx, shot, at, 0.7 + force * 0.3)
        const way = Math.floor(p.a * 4)
        drawBrand(ctx, shot, at)
        if (way === 0) { const off = Math.round(u * (4 + local * 8)), img = logoOf(shot); ctx.globalAlpha = 0.6; ctx.drawImage(tinted(img, accent, r.w, r.h), 0, 0, r.w, r.h, r.x - off, r.y, r.w, r.h); ctx.drawImage(tinted(img, others[0] ?? CREAM, r.w, r.h), 0, 0, r.w, r.h, r.x + off, r.y, r.w, r.h); ctx.globalAlpha = 1; ctx.drawImage(img, r.x, r.y, r.w, r.h) }
        else if (way === 1) { for (let i = 0; i < 4 + Math.round(g * 8); i += 1) { const x = Math.round(r.x + hash(s, i, 110) * r.w), y0 = Math.round(r.y + hash(s, i, 111) * r.h); const len = Math.round(local * H * (0.1 + hash(s, i, 112) * 0.3)); ctx.fillStyle = hash(s, i, 113) < 0.5 ? CREAM : colourAt(hash(s, i, 114)); ctx.globalAlpha = 0.8; ctx.fillRect(x, y0, px, len); ctx.globalAlpha = 1 } }
        else if (way === 2) { ctx.fillStyle = DEEP; const d = Math.max(3, Math.round(u * 7)); for (let y = r.y; y < r.y + r.h; y += d) for (let x = r.x + ((Math.round(y / d) % 2) ? d / 2 : 0); x < r.x + r.w; x += d) ctx.fillRect(Math.round(x), y, Math.max(1, Math.round(d * 0.45)), Math.max(1, Math.round(d * 0.45))) }
        else if (hash(step, s, 115) < 0.5) { ctx.fillStyle = DEEP; ctx.fillRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4); strokeShape(ctx, logoOf(shot), darkOf(shot), CREAM, r.x, r.y, r.w, r.h) }
        void deepOf
        break
      }
      case 'burst': {
        if (shot.kind !== 'back') bed(ctx, shot, at, 0.5)
        switch (shot.kind) {
          case 'back': {
            // The Fond: the picture as the ground, the Home's lines over it, the brand in its treatment over that, mistreated; a bar at a side now and then; the camera's small texts.
            backdrop(ctx, shot, at, 0.22 + (1 - rn) * 0.16)
            bed(ctx, shot, at, 0.3)
            if (p.d < 0.4) bars(ctx, shot, at, 1, 0.7)
            drawBrand(ctx, shot, at)
            mistreat(ctx, shot, r, at, g)
            if (shot.hud) hud(ctx, shot, at, frame)
            break
          }
          case 'blocks': {
            // The brand's cells thrown apart, each filled with matter; blocks of matter around; bars at the sides; the camera's texts.
            bars(ctx, shot, at, 1 + Math.round(g * 2), 0.8)
            const cells = cellsOf(shot, r)
            const spread = easeOut(Math.min(1, local * 2)) * (0.3 + g * 0.5) * (input.brandMode === 'exploded' ? 1.5 : 1)
            for (let i = 0; i < Math.round(6 + g * 14); i += 1) { const bw = Math.round(W * (0.06 + hash(s, step, i, 120) * 0.25)), bh = Math.round(H * (0.02 + hash(s, step, i, 121) * 0.1)); matterIn(ctx, shot, at, Math.round(hash(s, step, i, 122) * (W - bw)), Math.round(hash(s, step, i, 123) * (H - bh)), bw, bh, 1.5 + hash(s, i, 124) * 3, hash(s, step, i, 125), hash(s, step, i, 126)) }
            for (const c of cells) {
              const ang = hash(s, c.i, 127) * Math.PI * 2, dist = (0.1 + hash(s, c.i, 128) * 0.35) * W * spread
              const x = Math.round(c.x + Math.cos(ang) * dist + (hash(s, step, c.i, 129) - 0.5) * W * 0.02), y = Math.round(c.y + Math.sin(ang) * dist * 0.7)
              if (hash(s, step, c.i, 130) < 0.6) { sx.clearRect(0, 0, W, H); sx.globalCompositeOperation = 'source-over'; sx.drawImage(logoOf(shot), c.sx, c.sy, c.sw, c.sh, x, y, Math.round(c.w), Math.round(c.h)); sx.globalCompositeOperation = 'source-in'; matterIn(sx, shot, at, x, y, Math.round(c.w), Math.round(c.h), 1.2 + hash(s, c.i, 131) * 2, hash(s, step, c.i, 132), hash(s, step, c.i, 133)); sx.globalCompositeOperation = 'source-over'; ctx.drawImage(scratch, x, y, Math.round(c.w), Math.round(c.h), x, y, Math.round(c.w), Math.round(c.h)) }
              else ctx.drawImage(logoOf(shot), c.sx, c.sy, c.sw, c.sh, x, y, Math.round(c.w), Math.round(c.h))
            }
            if (shot.hud) hud(ctx, shot, at, frame)
            break
          }
          case 'mosh': {
            // A band of the frame, at the middle, filled with rows of matter shifted by step; bars at the sides; the brand over it, torn; the camera's texts.
            bars(ctx, shot, at, 2 + Math.round(g * 2), 0.85)
            const top = Math.round(H * (0.25 + p.a * 0.2)), bottom = Math.round(H * (0.55 + p.b * 0.25))
            let y = top, i = 0
            while (y < bottom) { const bh = Math.max(2 * px, Math.round(H * (0.004 + hash(s, step, i, 140) * 0.035))); const dx = Math.round((hash(s, step, i, 141) - 0.5) * W * (0.1 + g * 0.35)); if (hash(s, step, i, 142) < 0.8) matterIn(ctx, shot, at, dx, y, W, bh, 1 + hash(s, i, 143) * 2.5, hash(s, step, i, 144), hash(s, i, 145)); else { ctx.fillStyle = colourAt(hash(s, i, 146)); ctx.globalAlpha = 0.8; ctx.fillRect(Math.round(hash(s, i, 147) * W * 0.4), y, Math.round(W * (0.2 + hash(s, i, 148) * 0.6)), Math.max(px, Math.round(bh * 0.3))); ctx.globalAlpha = 1 } y += bh; i += 1 }
            drawBrand(ctx, shot, at)
            mistreat(ctx, shot, r, at, g)
            if (shot.hud) hud(ctx, shot, at, frame)
            break
          }
          case 'screens': {
            // A grid of small screens, each a crop of matter with its own timecode, scrolling slowly, re-cropped by step; the brand's screen among them.
            const cols = W > H ? 4 : 3, cw = Math.round(W / cols), ch = Math.round(cw * (W > H ? 0.6 : 0.68)), gap = Math.round(u * 6)
            const rows = Math.ceil(H / ch) + 2
            const offset = ((at - shot.from) * H * 0.00028 * (0.6 + g * 0.8)) % ch
            const step2 = stepOf(shot, at, 1.6)
            ctx.font = `${Math.round(u * 13)}px ${font}`; ctx.textBaseline = 'top'
            for (let row = -1; row < rows; row += 1) for (let col = 0; col < cols; col += 1) {
              const x = col * cw + gap, y = Math.round(row * ch - offset) + gap, w = cw - gap * 2, h = ch - gap * 2
              const id = (row + 100) * 7 + col
              if (col === Math.floor(cols / 2) && (row + 100) % 3 === 1) { ctx.fillStyle = DEEP; ctx.fillRect(x, y, w, h); const li = logoOf(shot), lw = Math.round(w * (shot.subject === 'icon' ? 0.45 : 0.7)), lh = Math.round(lw * li.naturalHeight / Math.max(1, li.naturalWidth)); ctx.drawImage(li, x + Math.round((w - lw) / 2), y + Math.round((h - lh) / 2), lw, Math.min(lh, h)) }
              else { matterIn(ctx, shot, at, x, y, w, h, 1 + hash(s, id, 150) * 2, hash(s, step2, id, 151), hash(s, step2, id, 152)); if (hash(s, step2, id, 153) < 0.25) { ctx.fillStyle = colourAt(hash(s, id, 154)); ctx.globalAlpha = 0.5; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1 } }
              ctx.strokeStyle = rgba(CREAM, 0.5); ctx.lineWidth = px; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
              ctx.fillStyle = CREAM; ctx.globalAlpha = 0.7; ctx.textAlign = 'left'; ctx.fillText(`${String(hash(s, id, 155) * 60 | 0).padStart(2, '0')}:${String((Math.floor(at / 100) + id) % 60).padStart(2, '0')}`, x + Math.round(u * 6), y + Math.round(u * 5)); ctx.globalAlpha = 1
            }
            if (shot.hud) hud(ctx, shot, at, frame)
            break
          }
          case 'confetti': {
            // The brand filled with matter and fringed, its letters swapped; pixel confetti over the frame; a bar at one side.
            bars(ctx, shot, at, 1, 0.75)
            confetti(ctx, shot, at, Math.round(30 + g * 90), { x: 0, y: 0, w: W, h: H })
            filledShape(ctx, shot, at, logoOf(shot), r.x, r.y, r.w, r.h, 1.1 + p.c)
            mistreat(ctx, shot, r, at, Math.max(0.6, g))
            if (shot.hud) hud(ctx, shot, at, frame)
            break
          }
          case 'reel': {
            // The brand repeated above and below, the reel sliding; thin lines between; matter in columns at the sides.
            const inner = { x: Math.round(W * 0.14), w: Math.round(W * 0.72) }
            sideTexture(ctx, shot, at, inner, 0.7)
            ctx.fillStyle = DEEP; ctx.fillRect(inner.x, 0, inner.w, H)
            const img = logoOf(shot), lw = Math.min(r.w, Math.round(inner.w * 0.9)), lh = Math.round(lw * img.naturalHeight / Math.max(1, img.naturalWidth)), pitch = lh + Math.round(H * 0.06)
            const slide = Math.round((at - shot.from) * H * 0.00035 * (p.d < 0.5 ? 1 : -1))
            for (let i = -2; i <= 3; i += 1) { const y = Math.round(H / 2 - lh / 2 + i * pitch + slide % pitch); ctx.drawImage(img, Math.round(W / 2 - lw / 2), y, lw, lh); ctx.fillStyle = rgba(CREAM, 0.5); ctx.fillRect(inner.x, y + lh + Math.round(H * 0.03), inner.w, px) }
            mistreat(ctx, shot, { x: Math.round(W / 2 - lw / 2), y: Math.round(H / 2 - lh / 2), w: lw, h: lh }, at, g * 0.8)
            break
          }
          case 'sweep': {
            // A fine line crosses; ahead of it the frame before, behind it the brand on the bed; thin columns shifted near the line.
            drawBrand(ctx, shot, at)
            const lx = Math.round((p.b < 0.5 ? local : 1 - local) * W)
            ctx.save(); ctx.beginPath(); if (p.b < 0.5) ctx.rect(lx, 0, W - lx, H); else ctx.rect(0, 0, lx, H); ctx.clip(); ctx.drawImage(held, 0, 0); ctx.restore()
            for (let i = 0; i < 2 + Math.round(g * 5); i += 1) { const cw = Math.round(W * (0.003 + hash(s, step, i, 160) * 0.015)), cx = Math.round(lx - W * 0.06 + hash(s, step, i, 161) * W * 0.12); const dy = Math.round((hash(s, step, i, 162) - 0.5) * H * 0.15 * g); if (cx + cw > 0 && cx < W) ctx.drawImage(ctx.canvas, cx, 0, cw, H, cx, dy, cw, H) }
            ctx.fillStyle = hash(s, 163) < 0.7 ? CREAM : colourAt(p.c); ctx.fillRect(lx, 0, px, H)
            break
          }
          case 'vomit': {
            // Small fragments of matter gathering from a point and pouring, by step; the brand under them.
            drawBrand(ctx, shot, at)
            if (pileFor !== s) { pileFor = s; pc.clearRect(0, 0, W, H) }
            const ox = W * (0.2 + p.a * 0.6), oy = H * (0.15 + p.b * 0.5)
            const ang = p.c < 0.6 ? Math.PI / 2 : p.c < 0.75 ? -Math.PI / 2 : p.c < 0.88 ? 0 : Math.PI
            for (let i = 0; i < 1 + Math.round(g * 3); i += 1) { const spread = 0.1 + local * 0.7; const fw = Math.round(W * (0.02 + hash(s, step, i, 170) * 0.08)), fh = Math.round(H * (0.003 + hash(s, step, i, 171) * 0.025)); const along = hash(s, step, i, 172) * spread, across = (hash(s, step, i, 173) - 0.5) * spread * 0.5; matterIn(pc, shot, at, Math.round(ox + Math.cos(ang) * along * H * 0.8 - Math.sin(ang) * across * W - fw / 2), Math.round(oy + Math.sin(ang) * along * H * 0.8 + Math.cos(ang) * across * W - fh / 2), fw, fh, 2 + hash(s, step, i, 174) * 3, hash(s, step, i, 175), hash(s, step, i, 176)) }
            const drip = Math.round((1 + g * 2) * px)
            pc.globalAlpha = 0.5; pc.drawImage(pile, Math.round(Math.cos(ang) * drip), Math.round(Math.sin(ang) * drip)); pc.globalAlpha = 1
            ctx.drawImage(pile, 0, 0)
            break
          }
          case 'textbig': {
            // The curator's words giant: matter through them, shifted a little from a matter ground; or an outline on the bed; rows slid by step; the clean words stay in front.
            const rect = { x: 0, y: 0, w: 0, h: 0 }
            if (p.a < 0.55) { matterIn(ctx, shot, at, 0, 0, W, H, 1.1, hash(s, 180), hash(s, 181)); ctx.fillStyle = rgba(DEEP, 0.35); ctx.fillRect(0, 0, W, H); Object.assign(rect, giantMask(sx, at, shot)); sx.globalCompositeOperation = 'source-in'; matterIn(sx, shot, at, Math.round((hash(s, 182) - 0.5) * W * 0.08), Math.round((hash(s, 183) - 0.5) * H * 0.05), W, H, 1.25, hash(s, 180), hash(s, 181)); sx.globalCompositeOperation = 'source-over'; ctx.drawImage(scratch, 0, 0) }
            else { Object.assign(rect, giantMask(sx, at, shot)); const colour = hash(s, 184) < 0.6 ? CREAM : accent; const o = Math.max(2, Math.round(u * 4)); const tint = tinted(scratch, colour, W, H, s2); for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o]]) ctx.drawImage(tint, dx, dy); tinted(scratch, DEEP, W, H, s2); ctx.drawImage(scratch2, 0, 0) }
            const rowsN = 3 + Math.round(p.c * 4), rh = Math.ceil(rect.h / rowsN)
            for (let rr = 0; rr < rowsN; rr += 1) if (hash(s, rr, step, 185) < g * 0.5) ctx.drawImage(ctx.canvas, 0, rect.y + rr * rh, W, rh, Math.round((hash(s, rr, step, 186) - 0.5) * W * (0.04 + g * 0.2)), rect.y + rr * rh, W, rh)
            break
          }
          case 'windows': {
            // The picture as texture, full frame, veiled; the same texture shifted inside the letters, so the letters show subtly; a cream outline on some.
            const ws = shot.look === 'own' && rn < 0.5 ? { ...shot, grain: Math.max(shot.grain, 8) } : shot
            matterIn(ctx, ws, at, 0, 0, W, H, 1.15, hash(s, 420), hash(s, 421))
            ctx.fillStyle = rgba(DEEP, (shot.look === 'own' ? 0.45 : 0.3) * (1 - rn * 0.6)); ctx.fillRect(0, 0, W, H)
            const sh = Math.round((hash(s, 422) - 0.5) * W * (0.05 + g * 0.08)), sv = Math.round((hash(s, 423) - 0.5) * H * 0.04)
            sx.clearRect(0, 0, W, H); sx.globalCompositeOperation = 'source-over'; sx.drawImage(logoOf(shot), r.x, r.y, r.w, r.h)
            sx.globalCompositeOperation = 'source-in'; matterIn(sx, shot, at, sh, sv, W, H, 1.3, hash(s, 420), hash(s, 421)); sx.globalCompositeOperation = 'source-over'
            ctx.drawImage(scratch, 0, 0)
            if (p.c < 0.45) strokeShape(ctx, logoOf(shot), darkOf(shot), hash(s, 424) < 0.6 ? CREAM : accent, r.x, r.y, r.w, r.h)
            if (p.c < 0.45) { sx.globalCompositeOperation = 'source-over'; sx.clearRect(0, 0, W, H); sx.drawImage(logoOf(shot), r.x, r.y, r.w, r.h); sx.globalCompositeOperation = 'source-in'; matterIn(sx, shot, at, sh, sv, W, H, 1.3, hash(s, 420), hash(s, 421)); sx.globalCompositeOperation = 'source-over'; for (let i = 0; i < 2 + Math.round(g * 3); i += 1) { const fw = Math.round(r.w * (0.2 + hash(s, step, i, 425) * 0.4)), fh = Math.round(r.h * (0.3 + hash(s, step, i, 426) * 0.6)); const fx = Math.round(r.x + hash(s, step, i, 427) * (r.w - fw)), fy = Math.round(r.y + hash(s, step, i, 428) * (r.h - fh)); ctx.drawImage(scratch, fx, fy, fw, fh, fx, fy, fw, fh) } }
            mistreat(ctx, shot, r, at, g * 0.7)
            break
          }
          case 'split': {
            // A fine line sweeps; the letters shatter in columns with their dark doubles; collage blocks of texture slide in columns; it stays.
            const inner = { x: Math.round(W * 0.12), w: Math.round(W * 0.76) }
            const cols = 3 + Math.round(p.a * 2), cw = Math.ceil(W / cols)
            for (let c = 0; c < cols; c += 1) { if (hash(s, c, 430) < 0.55) continue; const slide = Math.round((at - shot.from) * H * 0.0004 * (hash(s, c, 431) < 0.5 ? 1 : -1)); for (let b = 0; b < 3; b += 1) { const bh = Math.round(H * (0.08 + hash(s, c, b, 432) * 0.2)), by = ((Math.round(hash(s, c, b, 433) * H + slide) % (H + bh)) + H + bh) % (H + bh) - bh; matterIn(ctx, shot, at, c * cw + Math.round(cw * 0.1), by, Math.round(cw * 0.8), bh, 1.5 + hash(s, c, b, 434) * 2, hash(s, c, b, 435), hash(s, c, b, 436)) } }
            void inner
            splitCells(ctx, shot, { ...r, w: Math.round(r.w * (1 + g * 0.2)) }, Math.min(1, local * 2.5))
            if (local < 0.45) { const lx = Math.round((p.b < 0.5 ? local / 0.45 : 1 - local / 0.45) * W); ctx.fillStyle = CREAM; ctx.fillRect(lx, 0, Math.max(2, Math.round(u * 4)), H) }
            break
          }
          case 'ecto': {
            // The picture solarised full frame — two vivid inks and deep with dark edges — waving slowly by rows; a strip of noise at the foot; the brand small at the bottom.
            const m = matterOf({ ...shot, look: 'solar' }, at)
            if (m) { ctx.imageSmoothingEnabled = false; const rowsN = 48, rh = Math.ceil(H / rowsN); for (let i = 0; i < rowsN; i += 1) { const y = i * rh; const dx = Math.round(Math.sin(i / rowsN * 6.5 + at / 800) * W * (0.02 + g * 0.04) + Math.sin(i / rowsN * 19 - at / 1100) * W * 0.012); ctx.drawImage(m, 0, Math.floor(i / rowsN * m.height), m.width, Math.max(1, Math.ceil(m.height / rowsN)), dx, y, W, rh) } ctx.imageSmoothingEnabled = true }
            else { ctx.fillStyle = accent; ctx.fillRect(0, 0, W, H) }
            for (let i = 0; i < 14; i += 1) { const y = H - Math.round(H * 0.1) + Math.round(hash(s, step, i, 440) * H * 0.1), hh = Math.max(px, Math.round(hash(s, step, i, 441) * 3 * px)); ctx.fillStyle = hash(s, i, 442) < 0.5 ? DEEP : colourAt(hash(s, i, 443)); ctx.fillRect(Math.round(hash(s, step, i, 444) * W * 0.5), y, Math.round(W * (0.2 + hash(s, i, 445) * 0.8)), hh) }
            if (local > 0.55) { const w = Math.round(W * 0.42), h = Math.round(w * input.logo.naturalHeight / Math.max(1, input.logo.naturalWidth)); ctx.fillStyle = rgba(DEEP, 0.75); ctx.fillRect(Math.round(W / 2 - w * 0.6), Math.round(H * 0.84 - h * 0.7), Math.round(w * 1.2), Math.round(h * 2.4)); drawBrand(ctx, { ...shot, subject: 'wordmark', stacked: false, treat: 'cream', pill: true, residue: [] }, at, { x: Math.round(W / 2 - w / 2), y: Math.round(H * 0.84 - h / 2), w, h }); pillAt(ctx, W / 2, Math.round(H * 0.84 + h / 2 + H * 0.015), w * 0.8) }
            break
          }
          default: { drawBrand(ctx, shot, at); mistreat(ctx, shot, r, at, g) }
        }
        break
      }
      case 'settle': {
        // The long settle: the brand back, with what the burst left — bars, a block, confetti, a line — and micro-shifts by step.
        if (shot.kind === 'column') {
          const inner = { x: Math.round(W * (0.14 + p.a * 0.1)), w: Math.round(W * (0.55 + p.b * 0.2)) }
          sideTexture(ctx, shot, at, inner, 0.8)
          ctx.fillStyle = DEEP; ctx.fillRect(inner.x, 0, inner.w, H)
          bed(ctx, shot, at, 0.35)
          const img = logoOf(shot), lw = Math.min(r.w, Math.round(inner.w * 0.88)), lh = Math.round(lw * img.naturalHeight / Math.max(1, img.naturalWidth))
          drawBrand(ctx, { ...shot, pill: false }, at, { x: Math.round(inner.x + inner.w / 2 - lw / 2), y: Math.round(H / 2 - lh / 2), w: lw, h: lh })
        } else {
          if (shot.kind === 'back') { backdrop(ctx, shot, at, 0.3 + local * 0.3); bed(ctx, shot, at, 0.3) } else bed(ctx, shot, at, 0.6 + force * 0.4)
          if (shot.residue.includes('bars')) bars(ctx, shot, at, 1 + Math.round(p.d * g * 3), (0.5 + g * 0.4) * (1 - local * 0.3))
          if (shot.residue.includes('block')) { const bw = Math.round(W * (0.04 + p.e * 0.06)), bh = Math.round(bw * (0.8 + p.f)); const bx = p.c < 0.5 ? Math.round(W * 0.06) : W - bw - Math.round(W * 0.06), by = Math.round(H * (0.3 + hash(s, 190) * 0.4)); matterIn(ctx, shot, at, bx, by, bw, bh, 2.5, hash(s, 191), hash(s, 192)); ctx.strokeStyle = rgba(CREAM, 0.6); ctx.lineWidth = px; ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1) }
          if (shot.residue.includes('confetti')) confetti(ctx, shot, at, Math.round(4 + (1 - local) * 10), { x: 0, y: 0, w: W, h: H })
          if (shot.residue.includes('line')) { ctx.fillStyle = colourAt(p.f); ctx.globalAlpha = 0.7; if (p.e < 0.5) ctx.fillRect(Math.round(p.a * W), 0, px, H); else ctx.fillRect(0, Math.round(p.b * H), W, px); ctx.globalAlpha = 1 }
          if (shot.residue.includes('pile') && pileFor >= 0) { ctx.globalAlpha = Math.max(0, 0.9 - local * 0.9); ctx.drawImage(pile, 0, 0); ctx.globalAlpha = 1 }
          drawBrand(ctx, shot, at)
        }
        if (local < 0.15) mistreat(ctx, shot, r, at, Math.max(shot.g, 0.5) * (1 - local / 0.15))
        else mistreat(ctx, shot, r, at, g * 0.5)
        if (shot.hud && p.a < 0.4) hud(ctx, shot, at, frame)
        break
      }
    }
    if (shot.duo && shot.phase !== 'card' && shot.phase !== 'burst') {
      // The second subject, a third of the width, in the corner away from the words, mistreated a little.
      const second: Shot = { ...shot, subject: shot.duo, stacked: shot.duo === 'block', huge: false, pill: false, residue: [], treat: shot.treat === 'filled' ? 'cream' : shot.treat }
      const si = logoOf(second), sw2 = Math.round(W * (shot.duo === 'icon' ? 0.2 : 0.3)), sh2 = Math.round(sw2 * si.naturalHeight / Math.max(1, si.naturalWidth))
      const wb = wordsBlock()
      const top = wb ? wb.y > H / 2 : hash(s, 480) < 0.5
      const place = { x: hash(s, 481) < 0.5 ? Math.round(W * 0.06) : W - sw2 - Math.round(W * 0.06), y: top ? Math.round(H * 0.06) : H - sh2 - Math.round(H * 0.06), w: sw2, h: sh2 }
      drawBrand(ctx, second, at, place)
      mistreat(ctx, second, place, at, g * 0.5)
    }
    if (shot.cam && shot.phase !== 'card' && shot.phase !== 'calm') camBig(ctx, shot, at, frame)
    if (shot.scan && shot.phase !== 'card') scanlines(ctx, 0.05 + g * 0.06)
    // A thin interface's residue on a few frames of a strong moment: the frame shifted a few pixels.
    if (g > 0.6 && hash(step, s, 200) < 0.12) ctx.drawImage(ctx.canvas, Math.round((hash(step, 201) - 0.5) * W * 0.03), 0)
    if (input.text && input.text.lines.length === 1 && shot.phase !== 'card') drawWords(ctx, shot, at)
    if (input.icon) ctx.drawImage(input.icon.image, Math.round(input.icon.x * W), Math.round(input.icon.y * H), Math.round(input.icon.size * u), Math.round(input.icon.size * u))
  }

  const shotAt = (at: number) => { const index = shots.findIndex((s) => at < s.to); return shots[index === -1 ? shots.length - 1 : index] }
  const frame = (ctx: CanvasRenderingContext2D, at: number, frameNo: number) => {
    const shot = shotAt(at)
    if (heldFor !== shot.seed) { heldFor = shot.seed; hc.drawImage(prev, 0, 0) }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = true
    drawMoment(ctx, shot, at, frameNo)
    pv.drawImage(ctx.canvas, 0, 0)
  }
  return { shots, beat, frame, shotAt }
}

/** The film recorded as an MP4 (Chrome, Edge) at the format's size, drawn live into the preview as it goes; its sound, when there is one, started with it and heard meanwhile. */
export async function recordPromo(input: PromoInput, preview?: HTMLCanvasElement | null, onProgress?: (p: number) => void, sound?: AudioBuffer | null): Promise<{ blob: Blob; extension: 'mp4' | 'webm' }> {
  const choice = recorderChoice((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t))
  if (!choice) throw new Error('Ce navigateur n’enregistre pas de vidéo : Chrome ou Edge sur ordinateur.')
  const format = formatOf(input.format)
  const W = format.w, H = format.h
  const work = document.createElement('canvas'); work.width = W; work.height = H
  const ctx = work.getContext('2d')!
  const promo = createPromo(input, W, H)
  const stream = work.captureStream(30)
  let startSound: (() => void) | null = null, stopSound: (() => void) | null = null
  if (sound) {
    try {
      const audio = audioContext(); await audio.resume()
      const source = audio.createBufferSource(); source.buffer = sound
      const sink = audio.createMediaStreamDestination()
      source.connect(sink); source.connect(audio.destination)
      for (const track of sink.stream.getAudioTracks()) stream.addTrack(track)
      startSound = () => source.start(); stopSound = () => { try { source.stop() } catch { /* ended */ } }
    } catch { /* a silent film then */ }
  }
  const recorder = new MediaRecorder(stream, { mimeType: choice.mimeType, videoBitsPerSecond: 12_000_000, audioBitsPerSecond: 160_000 })
  const chunks: Blob[] = []
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
  const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve() })
  const total = input.seconds * 1000
  const previewCtx = preview?.getContext('2d') ?? null
  recorder.start(500)
  startSound?.()
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
  stopSound?.()
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
