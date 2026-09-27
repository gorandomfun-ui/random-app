/**
 * Live music from everywhere, asked for by the owner on 27 September:
 * concerts, unexpected concerts, a band filmed from the back of a village
 * square in Guatemala, and recent clips from many countries — not only the
 * big names. On that day only 332 of 2,135 music entries were live.
 *
 * Each style goes with the places where it is played, so a query reads like
 * something a person would film and title: "marimba en vivo guatemala",
 * "huayno fiesta patronal cusco", "gnawa live essaouira". The day picks the
 * queries, the same all day, different the next.
 */

/** A style and where it lives. */
const STYLES: ReadonlyArray<[string, readonly string[]]> = [
  ['marimba', ['guatemala', 'chiapas', 'honduras', 'costa rica']],
  ['cumbia', ['colombia', 'peru', 'argentina', 'mexico', 'bolivia']],
  ['huayno', ['cusco', 'puno', 'ayacucho', 'bolivia']],
  ['son jarocho', ['veracruz', 'tlacotalpan']],
  ['banda sinaloense', ['sinaloa', 'jalisco', 'zacatecas']],
  ['chilena', ['oaxaca', 'guerrero']],
  ['forró', ['nordeste', 'pernambuco', 'ceara']],
  ['frevo', ['recife', 'olinda']],
  ['candombe', ['montevideo']],
  ['chamamé', ['corrientes', 'misiones']],
  ['kompa', ['haiti', 'port-au-prince']],
  ['rara', ['haiti']],
  ['son cubano', ['santiago de cuba', 'la habana', 'trinidad cuba']],
  ['calypso', ['trinidad', 'tobago']],
  ['rumba congolaise', ['kinshasa', 'brazzaville']],
  ['highlife', ['ghana', 'accra', 'kumasi']],
  ['mbalax', ['dakar', 'senegal']],
  ['kora griot', ['mali', 'bamako', 'gambie']],
  ['gnawa', ['essaouira', 'marrakech', 'tanger']],
  ['chaabi', ['alger', 'casablanca']],
  ['raï', ['oran', 'algerie']],
  ['éthio-jazz', ['addis abeba', 'ethiopie']],
  ['salegy', ['madagascar']],
  ['maloya', ['la reunion']],
  ['dabke', ['liban', 'palestine', 'jordanie']],
  ['halay', ['anatolie', 'kurdistan']],
  ['rebetiko', ['athenes', 'thessalonique', 'crete']],
  ['fanfare balkanique', ['serbie', 'guca', 'macedoine']],
  ['sevdah', ['bosnie', 'sarajevo']],
  ['horo', ['bulgarie']],
  ['taraf', ['roumanie', 'maramures']],
  ['polska', ['suede', 'dalecarlie']],
  ['fest-noz', ['bretagne']],
  ['sean-nós', ['irlande', 'connemara']],
  ['pipe band', ['ecosse', 'highlands']],
  ['fado', ['lisbonne', 'coimbra', 'alfama']],
  ['flamenco', ['sevilla', 'jerez', 'granada']],
  ['trikitixa', ['pays basque', 'euskadi']],
  ['canto a tenore', ['sardaigne']],
  ['tarantella', ['pouilles', 'calabre', 'naples']],
  ['joik', ['laponie', 'sapmi']],
  ['throat singing', ['tuva', 'mongolie']],
  ['morin khuur', ['mongolie', 'oulan-bator']],
  ['qawwali', ['lahore', 'delhi', 'ajmer']],
  ['baul', ['bengale', 'bangladesh']],
  ['rajasthani folk', ['rajasthan', 'jaisalmer']],
  ['bhangra', ['punjab']],
  ['gamelan', ['bali', 'java', 'yogyakarta']],
  ['dangdut', ['indonesie', 'jakarta']],
  ['kulintang', ['mindanao', 'philippines']],
  ['molam', ['isan', 'laos']],
  ['luk thung', ['thailande']],
  ['taiko', ['japon', 'matsuri']],
  ['minyo', ['okinawa', 'japon']],
  ['pansori', ['coree']],
  ['khoomei', ['mongolie']],
  ['string band', ['papouasie', 'fidji']],
  ['slack key', ['hawaii']],
  ['cajun', ['louisiane', 'lafayette']],
  ['zydeco', ['louisiane']],
  ['bluegrass', ['appalaches', 'kentucky']],
  ['conjunto tejano', ['texas', 'san antonio']],
  ['mariachi', ['jalisco', 'guadalajara', 'plaza garibaldi']],
  ['steelpan', ['trinidad', 'port of spain']],
]

/** How it was filmed: the unexpected, the amateur, the village square. */
const FORMS = [
  'en vivo', 'ao vivo', 'live', 'concierto', 'concert', 'fiesta patronal', 'banda de pueblo', 'feria', 'baile popular',
  'serenata', 'festival', 'fête de village', 'mariage', 'wedding', 'street', 'plaza', 'market', 'procession', 'jam session',
  'filmed in the crowd', 'fan recording', 'amateur', 'village', 'boda',
]

/** Recent clips, many countries: the new songs of places that are not on the charts. */
const CLIP_FORMS = ['videoclip oficial', 'clip officiel', 'official music video', 'clipe oficial', 'offizielles musikvideo', 'video ufficiale', 'new music video']
const CLIP_PLACES = [
  'guatemala', 'paraguay', 'bolivia', 'ecuador', 'honduras', 'nicaragua', 'cuba', 'haiti', 'jamaica', 'cote d ivoire', 'cameroun',
  'benin', 'togo', 'burkina faso', 'niger', 'tchad', 'soudan', 'tanzania', 'uganda', 'zambia', 'mozambique', 'angola', 'cap vert',
  'kazakhstan', 'ouzbekistan', 'kirghizistan', 'azerbaidjan', 'georgie', 'armenie', 'albanie', 'kosovo', 'moldavie', 'estonie',
  'islande', 'feroe', 'nepal', 'bhoutan', 'sri lanka', 'myanmar', 'cambodge', 'laos', 'mongolie', 'papouasie', 'samoa', 'tonga',
]

/** Words a music video's title carries in most languages. */
const MUSIC_WORDS = /\b(?:live|en vivo|ao vivo|en direct|concert|concerts|concierto|conciertos|konzert|festival|song|songs|music|musique|musica|música|musik|band|banda|orchestra|orquesta|orchestre|choir|chorale|coro|singer|sings|singing|chant|chanteur|chanteuse|cantante|canta|dance|danse|danza|baile|tanz|folk|folklore|folklórico|performance|session|jam|remix|videoclip|clip|clipe|cover|instrumental|guitar|guitare|guitarra|piano|violin|violon|drums|percussion|trio|quartet|ensemble|fanfare|brass|opera|opéra|aria|recording|album|tune|melody|mélodie|serenata|sérénade|choeur|chœur|bal|toque|rhythm|ritmo)\b/i

const fold = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
export const STYLE_NAMES: readonly string[] = STYLES.map(([style]) => style)

/**
 * Whether a result of a live music query is music. Dailymotion answers a
 * place name alone — "khoomei mongolie" brought the COP17 in Mongolia — so a
 * result is kept only if its title names the style asked for or speaks of
 * music; the rest is not given the music label.
 */
export function isMusicResult(title: string | null | undefined, query: string): boolean {
  const text = title ?? ''
  if (MUSIC_WORDS.test(text)) return true
  const folded = ` ${fold(text).replace(/[^\p{L}\p{N}]+/gu, ' ')} `
  const style = STYLE_NAMES.find((name) => fold(query).startsWith(fold(name)))
  return Boolean(style && folded.includes(` ${fold(style).replace(/[^\p{L}\p{N}]+/gu, ' ')} `))
}

function seeded(seed: number): () => number {
  let state = seed >>> 0 || 1
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5
    return (state >>> 0) / 0x1_0000_0000
  }
}
const pick = <T,>(values: readonly T[], random: () => number): T => values[Math.floor(random() * values.length)]

export function liveQuery(random: () => number): string {
  const [style, places] = pick(STYLES, random)
  const form = pick(FORMS, random)
  const shape = random()
  if (shape < 0.45) return `${style} ${form} ${pick(places, random)}`
  if (shape < 0.75) return `${style} ${form}`
  return `${style} ${pick(places, random)}`
}

export function clipQuery(random: () => number, year: number): string {
  return `${pick(CLIP_FORMS, random)} ${year} ${pick(CLIP_PLACES, random)}`
}

export type LiveSearch = { query: string; kind: 'live' | 'clip' }

/** The day's queries: the same all day, different the next. */
export function liveQueriesForDay(day: Date, counts: { dailymotion: number; youtubeLive: number; youtubeClips: number }): { dailymotion: string[]; youtube: LiveSearch[] } {
  const dayIndex = Math.floor(day.getTime() / 86_400_000)
  const random = seeded(dayIndex * 2654435761)
  const year = day.getUTCFullYear()
  const unique = (make: () => string, n: number): string[] => {
    const out = new Set<string>()
    for (let attempt = 0; out.size < n && attempt < n * 20; attempt += 1) out.add(make())
    return [...out]
  }
  const dailymotion = unique(() => liveQuery(random), counts.dailymotion)
  const youtube: LiveSearch[] = [
    ...unique(() => liveQuery(random), counts.youtubeLive).map((query) => ({ query, kind: 'live' as const })),
    ...unique(() => clipQuery(random, year), counts.youtubeClips).map((query) => ({ query, kind: 'clip' as const })),
  ]
  return { dailymotion, youtube }
}
