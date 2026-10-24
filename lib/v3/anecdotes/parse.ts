/**
 * Reading Wikipedia's "Did you know" archives: the rendered page cut into its hooks, each hook made a sentence that
 * names the article it is about — French "Le saviez-vous ?", English "Did you know", German "Schon gewusst?", Spanish
 * "¿Sabías que…?" (Japanese has nothing of the kind).
 *
 * The rules of the prototype the import of 20 October was made with (docs/reports/anecdotes/dyk-anecdotes.mts, 35,907
 * cards), unchanged: an anecdote's id is the hash of its words, so a hook read again is the same anecdote and its card
 * the same card (lib/v3/anecdotes/cards.ts).
 *
 * Set aside: what is not a hook, a hook without its article or whose article was deleted, leftover markup, a sentence
 * cut short, under 40 or over 220 characters, a repeat (the same words, or one article's anecdote reworded). Tagged
 * only: deaths, wars, politics and the like (one in three is kept, cards.ts), a wording tied to its day ("currently")
 * and the April fools' hooks.
 */

import { createHash } from 'node:crypto'

import * as cheerio from 'cheerio'

export type AnecdoteLang = 'fr' | 'en' | 'de' | 'es'

export const WIKI_HOST: Record<AnecdoteLang, string> = {
  en: 'en.wikipedia.org',
  fr: 'fr.wikipedia.org',
  de: 'de.wikipedia.org',
  es: 'es.wikipedia.org',
}

/** A page as the API's `action=parse` renders it. */
export type WikiPage = { title: string; html: string }

export type Anecdote = {
  id: string
  lang: AnecdoteLang
  text: string
  article: { title: string; url: string }
  /** The day it was on the main page, "YYYY-MM-DD" ("YYYY-MM" for the Spanish months), when the archive says. */
  date: string | null
  year: number | null
  source: { name: string; page: string; pageUrl: string; license: 'CC BY-SA 4.0' }
  /** "converted": a "... that X?" hook made the statement "X." */
  form: 'statement' | 'converted' | 'question'
  sensitive: boolean
  sensitiveTerms?: string[]
  timeRelative?: boolean
  aprilFools?: boolean
}

/** Why a hook is set aside. */
export type Drop = 'notHook' | 'noArticle' | 'deletedArticle' | 'leftoverMarkup' | 'truncated' | 'tooShort' | 'tooLong' | 'duplicate'

/** A hook made a sentence with its article: what the repeats are judged on comes next (AnecdoteSieve). */
export type Hook = {
  lang: AnecdoteLang
  page: string
  date: string | null
  year: number | null
  text: string
  form: Anecdote['form']
  article: { title: string; url: string }
  /** The words a repeat is told by: lower case, no accents, no punctuation. */
  key: string
}

/** What a page gave: its hooks in page order, and how many of its candidates were set aside, by reason. */
export type PageReading = { raw: number; hooks: Hook[]; dropped: Partial<Record<Drop, number>> }

/** The section's name on each Wikipedia, as the anecdote's source. */
const SECTION_NAME: Record<AnecdoteLang, string> = {
  en: 'Wikipedia \u2013 Did you know',
  fr: 'Wikipédia \u2013 Le saviez-vous ?',
  de: 'Wikipedia \u2013 Schon gewusst?',
  es: 'Wikipedia \u2013 \u00BFSabías que\u2026?',
}

const MONTHS: Record<AnecdoteLang, string[]> = {
  en: ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'],
  fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
  de: ['januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'],
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
}

const pad = (n: number) => String(n).padStart(2, '0')

function isoDate(lang: AnecdoteLang, day: string | number, monthName: string, year: string | number): string | null {
  const month = MONTHS[lang].indexOf(monthName.toLowerCase()) + 1
  if (!month) return null
  return `${year}-${pad(month)}-${pad(Number(day))}`
}

/** Italic parentheticals that point at the picture beside the hook: "(pictured)", "(photo)", "(Bild)", "(en la imagen)"… */
const IMAGE_MARKER: Record<AnecdoteLang, RegExp> = {
  en: /\b(pictured|illustrated|depicted|shown|featured|portrayed|left|right|centre|center|top|bottom|above|below|inset|audio|video|animated|animation|example)\b/i,
  fr: /\b(photo|photographie|illustration|illustré|illustrée|image|portrait|carte|gravure|tableau|dessin|statue|sculpture|vidéo|schéma|affiche|timbre|logo|peinture|mosaïque|exemple|reconstitution|animation|armoiries|couverture|en haut|en bas|ci-contre|ci-dessus|à droite|à gauche)\b/i,
  de: /\b(Bild|Foto|Abbildung|Abb\.|Gemälde|Karte|Zeichnung|Skulptur|Statue|links|rechts|oben|unten)\b/i,
  es: /\b(imagen|foto|fotografía|ilustración|retrato|mapa|grabado|cuadro|pintura|dibujo|escultura|estatua|derecha|izquierda)\b/i,
}

/** The same markers when the italics were lost: "(photo)", "(pictured in 1922)", "(Bild)", "(en la imagen)". */
const TEXT_MARKER: Record<AnecdoteLang, RegExp> = {
  en: /\s*\((?:[^()]{0,40}\s)?(?:pictured|illustrated|depicted)(?:[\s,][^()]{0,40})?\)/gi,
  fr: /\s*\((?:en |sur la |voir )?(?:photos?|photographies?|images?|illustrations?|portraits?|tableaux?|gravures?|cartes?|dessins?|schémas?|affiches?|vidéo|statues?|sculptures?|logo|timbres?|peintures?|ci-contre|ci-dessus|ci-dessous|à droite|à gauche|en haut|en bas)(?:\s(?:du haut|du bas|de gauche|de droite|ci-contre|\d)|\s(?:de|du|des|par) [^()]{1,40})?\)/gi,
  de: /\s*\((?:im |siehe )?(?:Bild|Foto|Abbildung|Abb\.)(?:\s(?:links|rechts|oben|unten))?\)/gi,
  es: /\s*\((?:en la )?(?:imagen|foto|fotografía|ilustración)(?:\s(?:de la )?(?:derecha|izquierda))?\)/gi,
}

/**
 * Sensitive: death, violence, war, crime, sex, politics — tagged, never refused here (the owner: politics limited, not
 * excluded). Matched on the text in lower case without accents; "w:" is a whole word, otherwise the start of a word
 * (anywhere in a German word: Weltkrieg, Kriegsende, ermordet).
 */
const SENSITIVE: Record<AnecdoteLang, string[]> = {
  en: [
    'w:die', 'w:died', 'w:dies', 'w:dying', 'w:dead', 'death', 'kill', 'murder', 'homicide', 'assassin', 'w:executed', 'w:execution',
    'suicide', 'massacre', 'genocide', 'holocaust', 'nazi', 'w:war', 'w:wars', 'wartime', 'warfare', 'battle', 'w:army', 'armies',
    'soldier', 'military', 'troops', 'bomb', 'terror', 'shooting', 'gunman', 'weapon', 'w:rape', 'w:raped', 'rapist', 'tortur', 'slave',
    'prison', 'w:jail', 'w:jailed', 'crime', 'criminal', 'w:sex', 'sexual', 'porn', 'prostitut', 'w:nude', 'w:naked', 'topless',
    'abuse', 'politic', 'election', 'w:elected', 'president', 'prime minister', 'parliament', 'senator', 'congressman', 'government',
    'minister', 'communis', 'fascis', 'dictator', 'w:coup', 'protest', 'w:riot', 'corpse', 'funeral', 'w:gun', 'w:guns',
  ],
  fr: [
    'mort', 'meurt', 'mourut', 'mourir', 'deces', 'decede', 'w:tue', 'w:tues', 'w:tuee', 'w:tuees', 'w:tuer', 'w:tua', 'meurtr',
    'assassin', 'execute', 'execution', 'fusill', 'guillotin', 'w:pendu', 'suicid', 'massacr', 'genocid', 'holocaust', 'shoah', 'nazi',
    'guerre', 'bataille', 'armee', 'soldat', 'militaire', 'bombard', 'w:bombe', 'w:bombes', 'terroris', 'attentat', 'tortur', 'w:viol',
    'w:viols', 'w:violee', 'violence', 'esclav', 'prison', 'emprisonn', 'crime', 'criminel', 'sexuel', 'w:sexe', 'porno', 'prostitu',
    'politi', 'election', 'w:elu', 'w:elue', 'w:elus', 'president', 'depute', 'senateur', 'ministre', 'gouvern', 'communis', 'fascis',
    'dictat', "coup d'etat", 'manifestation', 'emeute', 'cadavre', 'funerailles', 'obseques', 'w:arme', 'w:armes', 'w:fusil',
  ],
  de: [
    'w:tod', 'todes', 'w:tot', 'w:tote', 'w:toten', 'todlich', 'starb', 'gestorben', 'sterben', 'stirbt', 'getotet', 'totung', 'mord',
    'hingericht', 'hinrichtung', 'suizid', 'krieg', 'schlacht', 'armee', 'soldat', 'militar', 'wehrmacht', 'bombe', 'bombard', 'terror',
    'anschlag', 'holocaust', 'shoah', 'nazi', 'nationalsozialis', 'konzentrationslager', 'w:kz', 'massaker', 'folter', 'vergewaltig',
    'sklave', 'sklaverei', 'gefangnis', 'haftling', 'verbrech', 'sexuell', 'porno', 'prostitu', 'politi', 'w:wahl', 'w:wahlen',
    'gewahlt', 'partei', 'kanzler', 'minister', 'regierung', 'prasident', 'abgeordnet', 'bundestag', 'landtag', 'kommunis', 'faschis',
    'diktat', 'putsch', 'protest', 'waffe', 'erschoss', 'leiche', 'begrabnis',
  ],
  es: [
    'muert', 'murio', 'muere', 'fallec', 'asesin', 'w:mato', 'w:matar', 'w:mataron', 'ejecutado', 'ejecucion', 'fusilad', 'suicid',
    'masacr', 'genocid', 'holocaust', 'nazi', 'guerra', 'batalla', 'ejercito', 'soldad', 'militar', 'w:bomba', 'w:bombas', 'bombarde',
    'terroris', 'atentado', 'tortur', 'violacion', 'violad', 'esclav', 'prision', 'carcel', 'w:preso', 'w:presos', 'crimen', 'criminal',
    'sexual', 'porno', 'prostitu', 'politic', 'eleccion', 'elegido', 'president', 'diputad', 'senador', 'ministr', 'gobiern',
    'comunis', 'fascis', 'dictad', 'golpe de estado', 'protesta', 'w:arma', 'w:armas', 'cadaver', 'funeral',
  ],
}

/** A wording that can be stale in an old anecdote ("currently the tallest…"): tagged only. */
const TIME_RELATIVE: Record<AnecdoteLang, RegExp> = {
  en: /\b(currently|recently|at present|presently|to date|so far|this year|last year|today|as of \d{4})\b/i,
  fr: /\b(actuellement|recemment|a ce jour|en ce moment|cette annee|l'an dernier|l'annee derniere|aujourd'hui)\b/i,
  de: /\b(derzeit|zurzeit|aktuell|momentan|gegenwartig|kurzlich|jungst|bislang|bisher|dieses jahr|diesem jahr|vergangenen jahr|letzten jahr|heute)\b/i,
  es: /\b(actualmente|recientemente|hoy en dia|en la actualidad|hasta la fecha|este ano|el ano pasado|hoy)\b/i,
}

const NON_ARTICLE_NS =
  /^(File|Fichier|Datei|Archivo|Image|Imagen|Bild|Category|Catégorie|Kategorie|Categoría|Template|Modèle|Vorlage|Plantilla|Wikipedia|Wikipédia|Portal|Help|Aide|Hilfe|Ayuda|Special|Spécial|Spezial|Especial|User|Utilisateur|Benutzer|Usuario|Talk|Discussion|Diskussion|Discusión|Module|Modul|Módulo|Anexo|Annexe):/i

const norm = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .toLowerCase()
    .replace(/[\u2019`]/g, "'")

const SENSITIVE_RE = Object.fromEntries(
  (Object.entries(SENSITIVE) as Array<[AnecdoteLang, string[]]>).map(([lang, words]) => {
    const parts = words.map((word) => {
      const exact = word.startsWith('w:')
      const term = norm(exact ? word.slice(2) : word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      if (lang === 'de' && !exact) return term
      return exact ? `\\b${term}\\b` : `\\b${term}`
    })
    return [lang, new RegExp(parts.join('|'), 'g')]
  }),
) as Record<AnecdoteLang, RegExp>

const sha1 = (value: string) => createHash('sha1').update(value).digest('hex')

/** The address of a page of that Wikipedia, as the archives link it. */
export function pageUrl(lang: AnecdoteLang, title: string): string {
  return `https://${WIKI_HOST[lang]}/wiki/${encodeURIComponent(title.replace(/ /g, '_')).replace(/%2F/g, '/').replace(/%3A/g, ':')}`
}

/** The words a repeat is told by. */
export function dedupeKey(text: string): string {
  return norm(text).replace(/[^a-z0-9]+/g, ' ').trim()
}

/** An anecdote's id: its language and the hash of its words — the card's `sourceKey` is made of it. */
export function anecdoteId(lang: AnecdoteLang, key: string): string {
  return `${lang}-${sha1(key).slice(0, 12)}`
}

// ---------------------------------------------------------------- one hook

/** The page loaded, and one of its nodes, as the repo's cheerio typings (@types/cheerio) name them. */
type Root = ReturnType<typeof cheerio.load>
type PageNode = ReturnType<ReturnType<Root>['toArray']>[number]

type Candidate = {
  lang: AnecdoteLang
  page: string
  node: PageNode
  $: Root
  date: string | null
  year: number | null
  hasImage: boolean
}

type ArticleLink = { title: string; url: string; red: boolean }

function linkInfo($: Root, a: PageNode, lang: AnecdoteLang): ArticleLink | null {
  const link = $(a)
  const href = link.attr('href') ?? ''
  const red = link.hasClass('new') || href.includes('redlink=1')
  const title = (link.attr('title') ?? '').replace(/\s*\((page does not exist|page inexistante|Seite nicht vorhanden|la página no existe|aún no redactado)\)$/i, '')
  if (!title || NON_ARTICLE_NS.test(title)) return null
  if (!red && !href.startsWith('/wiki/')) return null
  const url = red ? pageUrl(lang, title) : `https://${WIKI_HOST[lang]}${href.split('#')[0]}`
  return { title, url, red }
}

function pickArticle(c: Candidate): ArticleLink | null {
  const { $ } = c
  const root = $(c.node)
  // 1. The bold link is the article the anecdote is about (all four Wikipedias bold it; a German teaser has one link).
  const bold = root.find('b a[href], strong a[href]').toArray().concat(root.find('a[href]').filter((_, a) => $(a).children('b').length > 0).toArray())
  for (const a of bold) {
    const info = linkInfo($, a, c.lang)
    if (info) return info
  }
  // 2. French, 2004–2005: "(voir [[Article]])".
  if (c.lang === 'fr') {
    const voir = root.find('small').filter((_, small) => /^\(\s*voir\b/i.test($(small).text().trim()))
    for (const a of voir.find('a[href]').toArray()) {
      const info = linkInfo($, a, c.lang)
      if (info) return info
    }
  }
  // 3. A German teaser's single link is the new article; an old French or Spanish item without bold, its first article link.
  for (const a of root.find('a[href]').toArray()) {
    const info = linkInfo($, a, c.lang)
    if (info) return info
  }
  return null
}

function cleanText(c: Candidate): string {
  const { $ } = c
  const node = $(c.node).clone()
  node
    .find(
      'style, script, link, meta, sup.reference, .reference, .mw-ref, .noprint, .mw-editsection, figure, .thumb, .thumbinner, [typeof*="mw:File"], img, .dyk-img, .mw-empty-elt, dl, ul, ol',
    )
    .remove()
  node.find('a.external.autonumber').remove() // bare external links rendered as "[1]"
  if (c.lang === 'es') node.find('sup, a.external').remove() // "<sup>[[Article|1]]</sup>" references, "editar"
  if (c.lang === 'fr') node.find('small').filter((_, small) => /^\(\s*voir\b/i.test($(small).text().trim())).remove()
  // The markers of the picture beside the hook.
  node.find('i, em').each((_, element) => {
    const text = $(element).text().trim()
    if (!/^\(.*\)$/.test(text)) return
    const words = text.split(/\s+/).length
    if (words <= 8 && ((c.hasImage && c.lang === 'fr') || IMAGE_MARKER[c.lang].test(text))) $(element).remove()
  })
  let text = node.text()
  text = text
    .replace(/[\u00AD\u200B\u200E\u200F\uFEFF]/g, '')
    .replace(/[\u00A0\u202F\u2009\u2007\s]+/g, ' ')
    .trim()
  text = text.replace(TEXT_MARKER[c.lang], '') // markers whose italics were broken in the wikitext
  return text
    .replace(/\s+([,.)])/g, '$1')
    .replace(/\(\s+/g, '(')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/([^.])\.\.$/, '$1.') // "J.-C.." / "excision. [1]."
}

function capitalise(text: string): string {
  const at = text.search(/\p{L}/u)
  if (at < 0) return text
  const letter = text[at]
  const next = text[at + 1] ?? ''
  if (letter !== letter.toLowerCase() || (next && next === next.toUpperCase() && next !== next.toLowerCase())) return text // already a capital, or "iPhone"
  return text.slice(0, at) + letter.toUpperCase() + text.slice(at + 1)
}

/** Final punctuation, possibly inside closing quotes or brackets. */
const END_PUNCT = /[.!?\u2026]["\u201D\u201C\u2019\u2018\u00BB\u00AB\u203A\u2039)\]\u300D\u300F]*$/
const DE_FUNCTION_WORD =
  /^(Der|Die|Das|Den|Dem|Des|Ein|Eine|Einen|Einem|Einer|Eines|Im|In|Am|An|Auf|Aus|Bei|Mit|Nach|Von|Vom|Vor|Zu|Zum|Zur|Es|Er|Sie|Man|Sich|Nur|Auch|Schon|Fast|Etwa|Rund|Über|Unter|Seit|Bis|Für|Durch|Gegen|Ohne|Um|Während|Wegen|Als|Wie|Wo|So|Dort|Hier|Heute|Damals|Bereits|Erst|Noch|Nicht|Kein|Keine|Jede|Jeder|Jedes|Alle|Viele|Einige|Mehr|Mehrere|Manche|Sein|Seine|Ihr|Ihre)\b/

/** "... that X?" → "X."   "... X?" (es) → "X."   "… que X ?" (fr, rare) → "X."   de 2004–2006 "... dass X?" → "Schon gewusst, dass X?" */
function toSentence(lang: AnecdoteLang, raw: string, year: number | null): { text: string; form: Anecdote['form'] } | null {
  const lead = /^(?:\.{2,}|\u2026)\s*/
  let text = raw
  if (lang === 'en') {
    if (!lead.test(text)) return null
    text = text.replace(/^(?:\.{2,}|\u2026)\s*(?:that\b\s*,?\s*)?/i, '') // a few hooks omit "that"
  } else if (lang === 'de') {
    // The 2004–2006 box read "Schon gewusst, dass …": its item is a verb-final clause that cannot become a statement
    // without reordering, so Wikipedia's own question is kept. Later "?" items are real questions.
    const isClause = lead.test(text) || (/\?$/.test(text) && ((year ?? 0) <= 2006 || /^dass\s/i.test(text) || /^\p{Ll}/u.test(text)))
    if (isClause) {
      let rest = text.replace(lead, '').replace(/^dass\s+/i, '').replace(/\s*\?*$/, '')
      if (DE_FUNCTION_WORD.test(rest)) rest = rest[0].toLowerCase() + rest.slice(1)
      return { text: `Schon gewusst, dass ${rest}?`, form: 'question' }
    }
    if (!END_PUNCT.test(text)) text += '.' // teaser boxes are whole sentences; some just omit the period
    return { text, form: 'statement' }
  } else if (lang === 'fr') {
    if (!lead.test(text)) return { text, form: 'statement' }
    text = text.replace(lead, '').replace(/^qu(?:e\s+|['\u2019]\s*)/i, '')
  } else if (lang === 'es') {
    if (!lead.test(text)) return null
    text = text.replace(lead, '').replace(/^que\s+/i, '')
  }
  // "¿Sabías que… X y que Y?" / "… that X and that Y?": the second "que"/"that" only made sense after the question.
  if (lang === 'en') text = text.replace(/,? and that /g, ' and ')
  if (lang === 'es') text = text.replace(/,? y que /g, ' y ')
  text = text.replace(/\s*\?\s*$/, '').replace(/\?(["\u201D\u2019\u00BB]+)$/, '.$1').trim() // 'a single state?"' → 'a single state."'
  if (!END_PUNCT.test(text)) text += '.' // 'called it "the best"' → 'called it "the best".'
  return { text: capitalise(text), form: 'converted' }
}

function frenchTypography(text: string): string {
  return text.replace(/ ([:;!?\u00BB])/g, '\u00A0$1').replace(/\u00AB /g, '\u00AB\u00A0')
}

const MARKUP_RE = /\[\[|\]\]|\{\{|\}\}|''|<\/?[a-z]|&[a-z]+;|&#\d+;|\|\s*\w+\s*=|\b\d+px\b|(?:Fichier|File|Datei|Archivo|Imagen|Image):/i

/** A candidate made a hook, or why it cannot be one: every rule that does not depend on what was read before it. */
function shape(c: Candidate): Hook | Drop {
  const converted = toSentence(c.lang, cleanText(c), c.year)
  if (!converted) return 'notHook'
  const text = c.lang === 'fr' ? frenchTypography(converted.text) : converted.text
  const article = pickArticle(c)
  if (!article) return 'noArticle'
  if (article.red) return 'deletedArticle'
  if (
    MARKUP_RE.test(text) ||
    c.$(c.node).find('.error, .scribunto-error').filter((_, error) => c.$(error).text().trim() !== '').length ||
    (c.lang === 'fr' && /(^|\s)'(\s|$)|\p{L}'(?=\s)/u.test(text)) // "d’Aletsch' en Suisse": broken ''italics''
  ) return 'leftoverMarkup'
  if (!END_PUNCT.test(text.replace(/\u00A0/g, ' ').trim())) return 'truncated' // "… lors des Jeux olympiques de Pékin", quiz items ending in "Réponse"
  const length = [...text].length
  if (length < 40) return 'tooShort'
  if (length > 220) return 'tooLong'
  return { lang: c.lang, page: c.page, date: c.date, year: c.year, text, form: converted.form, article: { title: article.title, url: article.url }, key: dedupeKey(text) }
}

// ---------------------------------------------------------------- the archives, language by language

function frCandidates(page: WikiPage, currentYear: number): Candidate[] {
  const $ = cheerio.load(page.html)
  const titled = page.title.match(/\/(\d{4})$/)
  const year = titled ? Number(titled[1]) : currentYear // "…/Archives" holds the current year
  const out: Candidate[] = []
  $('.mw-parser-output > ul > li').each((_, li) => {
    const small = $(li).children('dl').find('small').first().text()
    const d = small.match(/du (\d{1,2}|1er) (\p{L}+) (\d{4})/u)
    const date = d ? isoDate('fr', d[1].replace('1er', '1'), d[2], d[3]) : null
    out.push({
      lang: 'fr',
      page: page.title,
      node: li,
      $,
      date,
      year: date ? Number(date.slice(0, 4)) : year,
      hasImage: $(li).children('figure, span[typeof*="mw:File"]').length > 0 || $(li).find('> p > figure').length > 0,
    })
  })
  return out
}

function enCandidates(page: WikiPage): Candidate[] {
  const $ = cheerio.load(page.html)
  const out: Candidate[] = []
  let date: string | null = null
  let imageForNext = false
  $('.mw-parser-output')
    .find('h2, h3, li, .dyk-img, div[style*="float:right"], div[style*="float: right"]')
    .each((_, element) => {
      const tag = 'tagName' in element ? element.tagName.toLowerCase() : undefined
      const text = $(element).text().trim()
      if (tag === 'h3' || tag === 'h2') {
        const heading = text.match(/^(\d{1,2}) (\p{L}+) (\d{4})$/u)
        if (heading) date = isoDate('en', heading[1], heading[2], heading[3])
        return
      }
      if (tag === 'div') {
        if ($(element).find('[typeof*="mw:File"], img').length) imageForNext = true
        return
      }
      const stamp = text.match(/^\d{1,2}:\d{2}, (\d{1,2}) (\p{L}+) (\d{4}) \(UTC\)$/u)
      if (stamp) {
        date = isoDate('en', stamp[1], stamp[2], stamp[3])
        return
      }
      if (!/^(?:\.{2,}|\u2026)/.test(text)) return
      out.push({ lang: 'en', page: page.title, node: element, $, date, year: date ? Number(date.slice(0, 4)) : null, hasImage: imageForNext })
      imageForNext = false
    })
  return out
}

function deCandidates(page: WikiPage): Candidate[] {
  const $ = cheerio.load(page.html)
  const out: Candidate[] = []
  $('.mw-parser-output div.hintergrundfarbe-basis').each((_, box) => {
    const head = $(box).children('span').first().text().trim()
    const d = head.match(/^(\d{1,2})\.\s*(\p{L}+)\s+(\d{4})/u)
    const date = d ? isoDate('de', d[1], d[2], d[3]) : null
    const paragraphs = $(box).children('p')
    if (!paragraphs.length) return
    const holder = $('<div></div>')
    paragraphs.each((_, p) => {
      holder.append($(p).clone())
    })
    out.push({
      lang: 'de',
      page: page.title,
      node: holder.get(0),
      $,
      date,
      year: date ? Number(date.slice(0, 4)) : Number(page.title.match(/Archiv\/(\d{4})/)?.[1] ?? 0) || null,
      hasImage: $(box).find('[typeof*="mw:File"], img').length > 0,
    })
  })
  return out
}

function esCandidates(page: WikiPage): Candidate[] {
  const $ = cheerio.load(page.html)
  const out: Candidate[] = []
  const title = page.title
  let year: number | null = null
  let date: string | null = null
  const dated = title.match(/\((\p{L}+) (\d{4})\)$/u) ?? title.match(/\/(?:\d{1,2} de )?(\p{L}+) de (\d{4})$/u)
  if (dated) {
    year = Number(dated[2])
    const month = MONTHS.es.indexOf(dated[1].toLowerCase()) + 1
    if (month) date = `${dated[2]}-${pad(month)}`
  }
  $('.mw-parser-output')
    .find('p, li')
    .each((_, element) => {
      const text = $(element).text().trim()
      if (!/^(?:\.{2,}|\u2026)\s*\S/.test(text)) return
      if ($(element).find('p, li').length) return // the innermost block only
      out.push({ lang: 'es', page: title, node: element, $, date, year, hasImage: false })
    })
  return out
}

/**
 * The hooks of an archive page, in its order. `months` ("YYYY-MM") keeps only the hooks of those months: the French
 * page holds a whole year. `currentYear` dates the French page of the year under way.
 */
export function readPage(lang: AnecdoteLang, page: WikiPage, options: { months?: readonly string[]; currentYear?: number } = {}): PageReading {
  const all = lang === 'fr'
    ? frCandidates(page, options.currentYear ?? new Date().getUTCFullYear())
    : lang === 'en' ? enCandidates(page) : lang === 'de' ? deCandidates(page) : esCandidates(page)
  const candidates = options.months ? all.filter((c) => c.date !== null && options.months!.includes(c.date.slice(0, 7))) : all
  const reading: PageReading = { raw: candidates.length, hooks: [], dropped: {} }
  for (const candidate of candidates) {
    const shaped = shape(candidate)
    if (typeof shaped === 'string') reading.dropped[shaped] = (reading.dropped[shaped] ?? 0) + 1
    else reading.hooks.push(shaped)
  }
  return reading
}

// ---------------------------------------------------------------- the repeats

const wordsOf = (key: string) => new Set(key.split(' ').filter((word) => word.length > 2))

/**
 * One language's hooks against everything read before them: the same words are a repeat, and so is an article's
 * anecdote sharing six words in ten with one already kept (reworded between two archives). What is stored already
 * counts as read before (`remember`), so a hook kept once is never kept again.
 */
export class AnecdoteSieve {
  /** Hooks set aside as a repeat, of a hook read before or of an anecdote remembered. */
  duplicates = 0
  private readonly seen = new Set<string>()
  private readonly byArticle = new Map<string, Array<Set<string>>>()

  /** An anecdote already stored, as if read before. */
  remember(text: string, articleTitle: string): void {
    const key = dedupeKey(text)
    this.seen.add(key)
    this.byArticle.set(articleTitle, [...(this.byArticle.get(articleTitle) ?? []), wordsOf(key)])
  }

  sift(hooks: readonly Hook[]): Anecdote[] {
    const kept: Anecdote[] = []
    for (const hook of hooks) {
      if (this.seen.has(hook.key)) {
        this.duplicates += 1
        continue
      }
      const words = wordsOf(hook.key)
      const sameArticle = this.byArticle.get(hook.article.title) ?? []
      const near = sameArticle.some((other) => {
        let shared = 0
        for (const word of words) if (other.has(word)) shared++
        return shared / (words.size + other.size - shared) >= 0.6
      })
      if (near) {
        this.duplicates += 1
        continue
      }
      this.seen.add(hook.key)
      this.byArticle.set(hook.article.title, [...sameArticle, words])

      const normalised = norm(hook.text)
      const terms = [...new Set([...normalised.matchAll(SENSITIVE_RE[hook.lang])].map((match) => match[0]))]
      const monthDay = hook.date?.slice(5) ?? ''
      const aprilFools = monthDay === '04-01' || (hook.lang === 'en' && monthDay === '04-02')
      kept.push({
        id: anecdoteId(hook.lang, hook.key),
        lang: hook.lang,
        text: hook.text,
        article: hook.article,
        date: hook.date,
        year: hook.year,
        source: { name: SECTION_NAME[hook.lang], page: hook.page, pageUrl: pageUrl(hook.lang, hook.page), license: 'CC BY-SA 4.0' },
        form: hook.form,
        sensitive: terms.length > 0,
        ...(terms.length ? { sensitiveTerms: terms } : {}),
        ...(TIME_RELATIVE[hook.lang].test(normalised) ? { timeRelative: true } : {}),
        ...(aprilFools ? { aprilFools: true } : {}),
      })
    }
    return kept
  }
}
