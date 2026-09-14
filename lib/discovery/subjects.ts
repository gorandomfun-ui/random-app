/** Subject identity is independent of the broad families used to balance Random. */
export const SUBJECT_VERSION = 5 as const
export type Subject = { key: string; label: string; aliases: string[]; kind: 'entity' | 'topic'; evidence: 'title' | 'description' | 'verified'; tentative?: boolean; domain?: 'fiction' }
export type SubjectAnalysis = { version: typeof SUBJECT_VERSION; title: string; primary?: Subject;
  secondary: Subject[]; moods: string[]; treatments: string[] }
export type SubjectHint = { label: string; aliases?: string[]; kind: 'entity' | 'topic'; domain?: 'fiction' }

export function foldSubject(value: string): string {
  return value.normalize('NFKC').replace(/(?<=\p{L})\$(?=\p{L})/gu, 's')
    .replace(/\b(?:[A-Za-z]\.){2,}[A-Za-z]?/gu, word => word.replaceAll('.', ''))
    .toLowerCase().normalize('NFD').replace(/(\p{Script=Latin})\p{M}+/gu, '$1').normalize('NFC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}
export function hasPhrase(text: string, phrase: string): boolean {
  const t = foldSubject(text), p = foldSubject(phrase)
  return containsFolded(t, p)
}
function containsFolded(t: string, p: string): boolean {
  return Boolean(p && (/[^\p{Script=Latin}\p{N}\s]/u.test(p) ? t.includes(p) : ` ${t} `.includes(` ${p} `)))
}

// A small disambiguation dictionary, NOT the list of subjects the engine can discover.
// Unknown multi-word names are extracted below; trusted source hints can supply more aliases.
const IDENTITIES: SubjectHint[] = [
  { label: 'Johnny Hallyday', aliases: ['Johnny Halliday', 'Johnny Haliday'], kind: 'entity' },
  { label: 'South Park', aliases: ['サウスパーク', 'Eric Cartman', 'Cartman'], kind: 'entity', domain: 'fiction' },
  { label: 'Peppa Pig', aliases: ['ペッパピッグ'], kind: 'entity', domain: 'fiction' },
  { label: 'Ozzy Osbourne', kind: 'entity' }, { label: 'Addison Rae', kind: 'entity' },
  { label: 'The Simpsons', aliases: ['Les Simpson', 'Los Simpson', 'Die Simpsons', 'ザ シンプソンズ'], kind: 'entity', domain: 'fiction' },
  { label: 'Minecraft', kind: 'entity' }, { label: 'Pokémon', aliases: ['Pokemon', 'ポケモン'], kind: 'entity' },
]
const TOPICS: Record<string, string[]> = {
  desert: ['desert', 'désert', 'desierto', 'Wüste', '砂漠'],
  motorcycle: ['motorcycle', 'motorbike', 'moto', 'motorrad', 'motocicleta', 'バイク'],
  'road-trip': ['road trip', 'roadtrip', 'voyage en voiture', 'ロードトリップ'],
  'stone-carving': ['stone carving', 'taille de pierre', 'Steinmetz', '石彫'],
  pottery: ['pottery', 'poterie', 'Töpferei', 'cerámica', '陶芸'],
  skateboarding: ['skateboarding', 'skateboard', 'スケートボード'],
  surfing: ['surfing', 'surfen', 'サーフィン'],
  astronomy: ['astronomy', 'astronomie', 'astronomía', '天文学'],
  robotics: ['robotics', 'robotique', 'Robotik', 'ロボット'],
  'walking-tour': ['walking tour', 'rain walk', 'walk pov', 'pov walk', 'visite à pied', 'Stadtrundgang', '街歩き'],
  'rail-travel': ['train journey', 'voyage en train', 'Zugfahrt', '鉄道旅行'],
  speedrunning: ['speedrunning', 'speedrun'],
}
const MOODS: Record<string, string[]> = {
  fun: ['funny', 'fun', 'comedy', 'comique', 'humour', 'humor', 'drôle', 'marrant', 'lustig', 'divertido', '笑える'],
  weird: ['weird', 'surreal', 'bizarre', 'absurd', 'absurde', 'étrange', 'seltsam', 'surrealista', '奇妙'],
  dark: ['horror', 'horrifique', 'creepy', 'effrayant', 'gruselig', 'terror', '不気味'],
}
const TREATMENTS: Record<string, string[]> = {
  'visual-art': ['caricature', 'portrait drawing', 'dessin', 'sculpture', 'painting', 'peinture', 'origami', 'illustration', 'fan art', 'fanart', '絵', '似顔絵'],
  collection: ['collection', 'collector', 'collectionneur', 'memorabilia', 'Sammlung', 'colección', 'コレクション'],
  cover: ['cover', 'reprise', 'reprend', 'tribute band', 'groupe hommage', '歌ってみた'],
  interview: ['interview', 'entretien', 'entrevista', 'インタビュー'],
  parody: ['parody', 'parodie', 'parodia', 'sketch', 'imitation', 'パロディ'],
  'fan-recording': ['fancam', 'fan recording', 'filmé par un fan', 'captation amateur', 'audience recording'],
  'music-video': ['music video', 'official video', 'official clip', 'clip officiel', 'videoclip', 'ミュージックビデオ', 'lyric video', 'lyrics video', 'official audio', 'visualizer'],
  'live-performance': ['concert', 'live performance', 'performance live', 'live at', 'live in', 'en concert', 'festival', 'コンサート'],
  'behind-scenes': ['behind the scenes', 'backstage', 'coulisses', 'making of', '舞台裏'],
  tutorial: ['tutorial', 'tutoriel', 'how to', 'tuto', 'Anleitung', 'チュートリアル'],
  gameplay: ['gameplay', 'let s play', 'playthrough', '実況プレイ'],
  travelogue: ['road trip', 'roadtrip', 'travel vlog', 'carnet de voyage', 'walking tour', 'voyage personnel'],
  'home-recording': ['home video', 'home movie', 'vidéo de famille', 'vidéo personnelle', 'bedroom', 'dans ma chambre', 'ホームビデオ'],
  analysis: ['analysis', 'analyse', 'explained', 'explique', 'review', 'critique', '解説'],
}

function subject(hint: SubjectHint, evidence: Subject['evidence'] = 'title'): Subject {
  const label = hint.label.trim().slice(0, 100)
  const bare = foldSubject(label).replace(/^(?:the|le|la|les) /u, '')
  return { key: `${hint.kind}:${foldSubject(label)}`, label, kind: hint.kind, evidence, ...(hint.domain ? { domain: hint.domain } : {}),
    aliases: [...new Set([label, ...(bare.split(' ').length >= 2 ? [bare] : []), ...(hint.aliases ?? []).slice(0, 8)].map(foldSubject).filter(Boolean))] }
}
export function topicSubject(key: string, aliases: string[]): Subject {
  return { ...subject({ label: aliases[0], aliases, kind: 'topic' }), key: `topic:${key}` }
}
const identities = IDENTITIES.map(hint => subject(hint))
const moodTerms = Object.entries(MOODS).map(([key, words]) => [key, words.map(foldSubject)] as const)
const treatmentTerms = Object.entries(TREATMENTS).map(([key, words]) => [key, words.map(foldSubject)] as const)
const topicSubjects = Object.entries(TOPICS).map(([key, aliases]) => ({
  ...subject({ label: aliases[0], aliases, kind: 'topic' }), key: `topic:${key}`,
}))
const PLACE_CONTEXT = /(?:walking tour|city walk|park tour|botanical|neighborhood|neighbourhood|公園|散歩|街歩き)/u
const FICTION_CONTEXT = /(?:gif|cartoon|episode|character|animation|animated|fan art|fanart|cartman|simpsons|peppa|エピソード|キャラクター)/u
const matches = (title: string, s: Subject) => s.aliases.some(alias => containsFolded(title, alias)) &&
  !(s.domain === 'fiction' && PLACE_CONTEXT.test(title) && !FICTION_CONTEXT.test(title))
const occurrence = (title: string, s: Subject) => Math.min(...s.aliases.map(alias => {
  const index = title.indexOf(alias); return index < 0 ? Infinity : index
}))

// Capitalisation alone is not proof: remove format words, verbs and ordinary title prose.
const NOT_NAME = new Set((
  'a an the this that my your his her in on at of for by and with from to is are it its who what how why when where which ' +
  'le la les un une des de du au aux et sur dans pour avec mon ma mes son sa ses qui quel quelle comment pourquoi ' +
  'der die das ein eine von mit und im am zu los las el una del con para ' +
  'official music video videos gif gifs reaction reactions funny fun best new old big game games food gaming facts fact console consoles handheld camera laptop device ' +
  'love crushes about psychological science amazing ultimate minutes minute hour full brand tales episodes episode ' +
  'film movie trailer teaser scene season clip clips compilation highlights championship champions television tv ads commercials ' +
  'concert live festival performance singing sing chante chanter chanteur artist artiste caricature painting portrait cover reprise reprend collection ' +
  'interview backstage journey tour walk walking road trip desert motorcycle bike moto usa uk us ' +
  'workshop carving stone guitar punk football college sports sugar factory birthday party piano cosplay meme memes ' +
  'makes making plays play riding rides ride sings singing performing performs playing does doing fait fait fait faire raconte dessine dessin sculpture ' +
  'archive archives tribute part restored edition meets visits visit discovers explains presents cooking kitchen bedroom ' +
  'pov day days minute minuten ' +
  'deutsch english francais french german japanese japan france america american berlin paris tokyo prague boston ' +
  'south north west east park cartoon animation animated business commercial failure success city radio advertisement ' +
  'rare rarest replay replays sport soccer football basketball tennis volleyball swimming running speedrun village seed ' +
  'every beat thought could embarrassed him some small bowls clips shows learns learning exploring discovered creating new latest greatest coolest').split(/\s+/))

function inferredNames(rawTitle: string, musicContext = false): Subject[] {
  // A title's poetic subtitle or uploader suffix must not become its main entity.
  const lead = rawTitle.split(/[|:!?]/u)[0]
  // A work title or a product code is supported by syntax, independent of capitalisation.
  const work = lead.match(/^(.{2,100}?)\s*(?:\([12]\d{3}\)|[-–—])?\s+(?:bande[- ]annonce|official trailer|trailer officiel|teaser officiel)\b/iu)?.[1]
  const code = lead.match(/\b(?=[A-Za-z\d-]{3,16}\b)(?=[A-Za-z\d-]*\d)(?=[A-Za-z\d-]*[A-Za-z])[A-Za-z\d-]+\b/u)?.[0]
  const numberedName = rawTitle.match(/\b([\p{Lu}][\p{L}\p{M}'’.-]{2,}\s+[1-9]\d{0,2})\b/u)?.[1]
  if (work && !/^(?:film|movie|new|nouveau|official)$/iu.test(work.trim())) {
    const label = work.replace(/\s*\([12]\d{3}\)\s*$/u, '').trim()
    return [{ ...subject({ label, kind: 'entity', domain: 'fiction' }), tentative: true }]
  }
  if (code && /(?:handheld|console|camera|laptop|review|tutorial|guide|test)/iu.test(lead)) {
    return [{ ...subject({ label: code, kind: 'entity' }), tentative: true }]
  }
  // Numbered works/products can appear inside ordinary prose (for example a
  // legacy description). Prefer that explicit identity to nearby sentence fragments.
  if (numberedName && !NOT_NAME.has(foldSubject(numberedName).split(' ')[0])) {
    return [{ ...subject({ label: numberedName, kind: 'entity' }), tentative: true }]
  }
  // Syntactic subject leads survive lower case, all caps, stage names and uploader subtitles.
  // Separators inside a name (AC/DC, Mini-Wheats) remain part of that name.
  const segments = rawTitle.split(/\s+[-–—|:/&+]\s+|:\s+/u)
  const firstSegment = segments[0].trim().replace(/^\d{4}\s+/u, '')
  const explicitContext = /(?:commercial|advertisement|werbespot|publicité|interview|collection|gameplay|speedrun|review|fancam|concert|clip officiel|official (?:music )?video|trailer|teaser)/iu.test(rawTitle)
  const plausible = (value: string) => {
    const words = foldSubject(value).split(' ')
    return words.length <= 5 && words.some(w => w.length >= 2 && !NOT_NAME.has(w)) &&
      !words.some(w => NOT_NAME.has(w) && !['the', 'a', 'of', 'de', 'la', 'le', 'les', 'der', 'die', 'das', 'ein', 'eine', 'los', 'las', 'el', 'una', 'del'].includes(w))
  }
  if (segments.length > 1 && plausible(firstSegment) && (musicContext || explicitContext ||
    /[\p{Lu}]/u.test(firstSegment))) {
    return [{ ...subject({ label: firstSegment, kind: 'entity' }), tentative: true }]
  }
  const contextualLead = lead.match(/^(.{2,80}?)\s+(?:(?:tv|television)\s+)?(?:commercial|advertisement|werbespot|publicité|interview|entrevista|collection|gameplay|playthrough|fancam|concert|official (?:music )?video)\b/iu)?.[1]
  if (contextualLead && plausible(contextualLead)) {
    return [{ ...subject({ label: contextualLead.trim(), kind: 'entity' }), tentative: true }]
  }
  const words = lead.match(/[\p{L}][\p{L}\p{M}\p{N}$'’./-]*/gu) ?? []
  const groups: string[][] = []; let group: string[] = []
  // Shouted titles carry no useful capitalisation evidence.
  if (!explicitContext && words.length > 3 && words.filter(w => w === w.toUpperCase()).length / words.length > .7) return []
  const end = () => {
    if (group.length >= 2 && group.length <= 4 || group.length === 1 && group[0].length >= 3 &&
      /(?:commercial|advertisement|werbespot|publicité|interview|portrait|collection|gameplay|speedrun|playthrough|review|fancam|concert|clip officiel|official (?:music )?video|trailer|teaser)/iu.test(rawTitle)) groups.push(group)
    group = []
  }
  for (const word of words) {
    const n = foldSubject(word)
    if (/^\p{Lu}/u.test(word) && n.length >= 2 && !NOT_NAME.has(n) && !topicSubjects.some(s => s.aliases.includes(n))) group.push(word)
    else end()
  }
  end()
  return groups.slice(0, 4).map(parts => ({ ...subject({ label: parts.join(' '), kind: 'entity' }), tentative: true }))
}

export function analyseSubject(title: string, hint?: SubjectHint, musicContext = false): SubjectAnalysis {
  const raw = title.slice(0, 500), normalized = foldSubject(raw)
  const result: SubjectAnalysis = { version: SUBJECT_VERSION, title: normalized, secondary: [], moods: [], treatments: [] }
  const verified = hint && typeof hint.label === 'string' && ['entity', 'topic'].includes(hint.kind)
    ? subject(hint, 'verified') : undefined
  // Even a trusted hint must have source-title support; search queries never enter this function.
  const known = identities.filter(s => matches(normalized, s))
  const names = known.length ? known : inferredNames(raw, musicContext)
  const topics = topicSubjects.filter(s => matches(normalized, s))
  const ordered = [...names, ...topics].sort((a, b) => Number(b.kind === 'entity') - Number(a.kind === 'entity') || occurrence(normalized, a) - occurrence(normalized, b))
  // A creator nickname later in an activity-led title must not hijack that activity.
  const first = ordered[0]
  const leadingTopic = first?.tentative && topics.find(t => occurrence(normalized, t) < occurrence(normalized, first))
  result.primary = verified && matches(normalized, verified) ? verified : leadingTopic || first
  result.secondary = ordered.filter(s => s.key !== result.primary?.key).slice(0, 6)
  result.moods = moodTerms.filter(([, words]) => words.some(word => containsFolded(normalized, word))).map(([key]) => key)
  result.treatments = treatmentTerms.filter(([, words]) => words.some(word => containsFolded(normalized, word))).map(([key]) => key)
  return result
}

/** No subject means no relation. Uncertainty never authorises an unrelated generic fallback. */
export function matchSubject(anchor?: SubjectAnalysis, candidate?: SubjectAnalysis): { score: number; reasons: string[] } | null {
  const primary = anchor?.primary
  if (!primary || anchor.version !== SUBJECT_VERSION) return null
  if (!candidate || candidate.version !== SUBJECT_VERSION) return null
  const candidates = [candidate.primary, ...candidate.secondary].filter((s): s is Subject => Boolean(s))
  const same = (s: Subject) => s.key === primary.key || s.kind === primary.kind && s.aliases.some(alias => primary.aliases.includes(alias))
  if (primary.kind === 'entity') {
    // An incidental shared activity must never replace the named subject.
    if (candidate.primary?.kind === 'entity' && !same(candidate.primary)) return null
    if (!candidates.some(same) && !matches(candidate.title, primary)) {
      return null
    }
  } else {
    if (!candidates.some(same) && !matches(candidate.title, primary)) return null
    // "Desert fun" retains its mood; bare "desert" can span different moods.
    if (anchor.moods.some(mood => !candidate.moods.includes(mood))) return null
  }
  return { score: primary.kind === 'entity' ? .98 : .88, reasons: [`subject:${primary.key}`,
    ...(primary.kind === 'topic' ? anchor.moods.map(mood => `mood:${mood}`) : [])] }
}

/** Existing token indexes support exact subject words; full phrase checking happens after retrieval. */
export function subjectSearchTerms(analysis?: SubjectAnalysis): string[][] {
  if (!analysis?.primary) return []
  return analysis.primary.aliases.slice(0, 4).map(alias => alias.split(/\s+/).filter(word => word.length >= 3)).filter(words => words.length > 0)
}

/** Shared literal evidence, including homonym checks. Never accepts query-derived tags. */
export function subjectInSource(value: string, focus: Subject): boolean {
  return matches(foldSubject(value.slice(0, 1000)), focus)
}
