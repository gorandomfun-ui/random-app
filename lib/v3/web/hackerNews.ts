/**
 * Websites from Hacker News "Show HN": people showing a thing they made — a
 * game in the browser, a map, a toy, a strange archive. Free, no key, no
 * quota (the Algolia search behind hn.algolia.com), and exactly the web the
 * owner wants instead of Google's single pages (27 September: "trouve un
 * moyen ... ingérer des trucs intéressants en restant dans les quotas").
 *
 * Pure: which searches to make, and which hits are a site worth a draw.
 */

export const HN_SEARCH = 'https://hn.algolia.com/api/v1/search'
export const HN_MIN_POINTS = 40
export const HN_HITS_PER_SEARCH = 50
/** Older posts point to dead or resold domains more often than not. */
export const HN_FIRST_YEAR = 2016

/** Playful words: Show HN is mostly developer tools, these find the rest. */
export const HN_QUERIES = [
  'game', 'browser game', 'puzzle', 'daily puzzle', 'interactive', 'map', 'visualization', 'visualizing', 'generator',
  'simulator', 'simulation', 'toy', 'music', 'synth', 'drum', 'piano', 'draw', 'drawing', 'art', 'museum', 'archive',
  'radio', 'globe', 'quiz', 'weird', 'random', 'explore', 'pixel', 'poetry', 'poem', 'history', 'space', 'ocean',
  'birds', 'animals', 'sounds', 'maze', 'chess', 'wikipedia', 'timeline', 'atlas', 'planets', 'earth', 'moon', 'sky',
  'trains', 'planes', 'flights', 'recipes', 'cats', 'dinosaurs', 'webcam', 'guess', 'emoji', 'ascii', 'retro', 'fun',
  'silly', 'useless', 'made a site', 'made a website', 'website where', 'for kids', 'my daughter', 'my son',
  'weekend project', 'infinite', 'every', 'world', 'city', 'ambient', 'typewriter',
] as const

/** Code, app stores, videos, social posts and write-ups: not a site to land on. */
const SKIP_HOST = /(?:^|\.)(?:github\.com|gist\.github\.com|gitlab\.com|bitbucket\.org|codeberg\.org|sr\.ht|sourceforge\.net|apps\.apple\.com|itunes\.apple\.com|play\.google\.com|chrome\.google\.com|chromewebstore\.google\.com|addons\.mozilla\.org|microsoftedge\.microsoft\.com|marketplace\.visualstudio\.com|store\.steampowered\.com|youtube\.com|youtu\.be|vimeo\.com|twitter\.com|x\.com|reddit\.com|news\.ycombinator\.com|docs\.google\.com|drive\.google\.com|dropbox\.com|medium\.com|substack\.com|dev\.to|npmjs\.com|pypi\.org|crates\.io|kickstarter\.com|indiegogo\.com|producthunt\.com|arxiv\.org|huggingface\.co|colab\.research\.google\.com|loom\.com|linkedin\.com|facebook\.com|instagram\.com|tiktok\.com)$/i
/** A tool for developers or a business, told by its title. */
const DEV_TITLE = /\(yc [a-z]\d+\)|\bc\+\+|\b(?:api|apis|sdk|cli|framework|library|database|postgres|sqlite|redis|kafka|graphql|react|hook|csv|json|yaml|regex|npm|webpack|kubernetes|k8s|docker|devops|llms?|gpt|openai|saas|b2b|crm|startup|yc [swf]\d{2}|self-hosted|builder|personal finance|business|mba|compiler|terminal|vs ?code|neovim|emacs|plugin|extension|dashboard|analytics|monitoring|observability|invoic\w*|seo|marketing|newsletter|productivity|workflow|no-code|low-code|boilerplate|crypto|bitcoin|nft|blockchain|web3|trading|stocks?|investing|for developers|for teams|for startups|for businesses|alternative|foss|sql|iphone|ios|android|macos|linux|ai|ai-powered|chatgpt|claude|encrypted|end-to-end|privacy|screenshots?|app for|tool for|tool to|web app for|css|html|ui|components|theme|layouts?)\b/i

export interface HnHit {
  objectID?: string
  title?: string | null
  url?: string | null
  points?: number | null
  created_at_i?: number | null
  story_text?: string | null
}

export interface HnSite {
  url: string
  title: string
  text: string
  points: number
  postId: string
}

/** One page of the posts since the first year whose title has these words, most upvoted first. */
export function hnSearchUrl(query: string, page = 0): string {
  const url = new URL(HN_SEARCH)
  url.searchParams.set('query', query)
  url.searchParams.set('tags', 'show_hn')
  // The words must be in the title, as written: "stars" found "startups" otherwise.
  url.searchParams.set('restrictSearchableAttributes', 'title')
  url.searchParams.set('typoTolerance', 'false')
  url.searchParams.set('numericFilters', `points>=${HN_MIN_POINTS},created_at_i>${Date.UTC(HN_FIRST_YEAR, 0, 1) / 1000}`)
  url.searchParams.set('hitsPerPage', String(HN_HITS_PER_SEARCH))
  url.searchParams.set('page', String(page))
  return url.toString()
}

/** Beyond the first page, one page at random: the whole archive, over the days. */
export function hnNextPage(pages: number, random: () => number): number | null {
  return pages > 1 ? 1 + Math.floor(random() * (pages - 1)) : null
}

export function hnQueries(count: number, random: () => number): string[] {
  const pool = [...HN_QUERIES]
  const out: string[] = []
  while (out.length < count && pool.length) out.push(pool.splice(Math.floor(random() * pool.length), 1)[0])
  return out
}

function plain(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim()
}

/** The site a Show HN post points to, or null when it is code, a store, a video or a tool for developers. */
export function hnSite(hit: HnHit): HnSite | null {
  const link = (hit.url ?? '').trim()
  if (!/^https?:\/\//i.test(link)) return null
  let host: string
  try {
    host = new URL(link).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
  if (SKIP_HOST.test(host)) return null
  const title = (hit.title ?? '').replace(/^\s*show hn\s*[:–-]\s*/i, '').trim()
  if (!title || DEV_TITLE.test(title)) return null
  const story = plain(hit.story_text ?? '')
  return {
    url: link,
    title: title.slice(0, 160),
    text: (story || title).slice(0, 280),
    points: Number(hit.points) || 0,
    postId: String(hit.objectID ?? ''),
  }
}
