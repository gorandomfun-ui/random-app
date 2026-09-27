/**
 * Which "websites" are not websites worth a draw. Measured on 27 September:
 * the 77,023 stored sites all came from Google's custom search, and most were
 * a single dull page — a puzzle for sale, a restaurant menu, a university
 * programme, a press article, a council page, a newsletter, even YouTube
 * videos. The owner wants the web of object-sites: toys, experiments,
 * archives, museums, games, strange personal projects.
 *
 * Read from the address and the title only, pure, so it serves the door and
 * the sweep of what is stored alike. A site's own front page is given the
 * benefit of the doubt; a deep page has to be something other than these.
 */

export type BoringReason = 'shop' | 'video' | 'article' | 'admin' | 'listing' | 'document' | 'mail' | 'media' | 'page'

const SHOP_HOST = /(?:^|\.)(?:shop|store|boutique|tienda|loja|shopify|etsy|amazon|ebay|aliexpress|alibaba|temu|walmart|target|bestbuy|ikea|zalando|rakuten|mercadolibre)\./i
const SHOP_PATH = /\/(?:shop|store|boutique|tienda|loja|cart|panier|checkout|product|produit|producto|products|productos|produits|collections?|catalog|catalogue|item|items|dp|gp\/product|pricing|tarifs|subscribe|abonnement|buy|acheter|order|commande|sale|soldes|offers?)(?:\/|$|\?|-)/i
/** App stores and stock images: a page to buy or license something. */
const STORE_HOST = /(?:^|\.)(?:apps\.apple\.com|play\.google\.com|chrome\.google\.com|chromewebstore\.google\.com|addons\.mozilla\.org|microsoft\.com\/store|photos\.com|pikbest\.com|shutterstock\.com|istockphoto\.com|freepik\.com|dreamstime\.com|alamy\.com|gettyimages\.[a-z.]+|depositphotos\.com|123rf\.com|vecteezy\.com|canva\.com)$/i
/** One track or one post on a platform: a song page, not a site. */
const MEDIA_HOST = /(?:^|\.)(?:soundcloud\.com|bandcamp\.com|spotify\.com|deezer\.com|music\.apple\.com|mixcloud\.com|instagram\.com|facebook\.com|pinterest\.[a-z.]+|linkedin\.com|tumblr\.com)$/i
const WIKI_HOST = /(?:^|\.)wiki(?:pedia|media|source|voyage|quote)\.org$/i
const PRESS_HOST = /^(?:press|pressroom|newsroom|media|investors?)\./i
/** Hosts of personal projects and curiosities, where a deep page is the site itself. */
const PROJECT_HOST = /(?:^|\.)(?:github\.io|neocities\.org|itch\.io|glitch\.me|archive\.org|observablehq\.com|netlify\.app|vercel\.app|pages\.dev|tilde\.[a-z]+|carrd\.co)$/i
const PRICE = /(?:[$€£¥]\s?\d|\d[\d.,]*\s?(?:€|eur|usd|\$))/i

const VIDEO_HOST = /(?:^|\.)(?:youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com|tiktok\.com|twitch\.tv)$/i
const VIDEO_PATH = /\/(?:watch|shorts|video|reel|reels|p)\b/i

const NEWS_HOST = /(?:^|\.)(?:[\w-]*news[\w-]*|[\w-]*times|[\w-]*post|[\w-]*herald|[\w-]*tribune|[\w-]*gazette|[\w-]*journal|[\w-]*jornal|[\w-]*diario|hollywoodreporter|variety|deadline|indiatv|ndtv|bbc|cnn|reuters|apnews|theguardian|lemonde|lefigaro|francetvinfo|francetelevisions|elpais|spiegel|forbes|businessinsider|huffpost|buzzfeed|tmz|people)\.[a-z.]+$/i
const DATED_PATH = /\/(?:19|20)\d{2}\/(?:0?[1-9]|1[0-2])(?:\/|$)|\/(?:19|20)\d{2}-\d{2}-\d{2}/
const ARTICLE_PATH = /\/(?:news|noticias|noticia|actualites?|actualidad|article|articles|articulo|artikel|story|stories|press|press-releases?|pressreleases|communiques?|magazine|blogs?|posts?|opinion|columns?|blogs-e-colunas|editorial)\/[^/]+/i
/** A listicle or a how-to, told by its title: the blog post, not the place it talks about. */
const LISTICLE = /^(?:the\s+)?(?:top\s+)?\d+\s+\w|\b(?:best|top)\s+\d+\b|\bhow to\b|\btips\b|\bguide\b|\bworth\b|\breasons\b|\bthings to do\b|\bwhat to (?:see|do|eat)\b|\bà (?:ne pas manquer|voir absolument)\b|\bmeilleurs?\b/i

const ADMIN_HOST = /(?:^|\.)(?:gov|gob|gouv|gv|go|govt|gov\.[a-z]{2}|gob\.[a-z]{2}|gouv\.[a-z]{2})\.?[a-z]*$|\.(?:gov|mil)$|(?:^|\.)(?:uni4edu|studyportals|coursera|udemy)\./i
const ADMIN_PATH = /\/(?:about(?:-us)?|contact(?:-us)?|faq|careers?|jobs?|emplois?|login|signin|sign-in|register|signup|account|privacy|terms|legal|mentions-legales|cookies|admissions?|programs?|programmes?|programas?|courses?|cursos?|departments?|faculty|staff|board|commission|media-hub|press-kit|settings|support|help|donate)(?:\/|$|\?|-)/i
const LISTING_PATH = /\/(?:events?|upcoming-events|agenda|calendar|calendrier|menus?|carta|tickets?|billets?|entradas|reservations?|booking|horaires|schedule|tv-guide|programme-tv|film-guide|listings?|results?|standings)(?:\/|$|\?|-)/i
const DOCUMENT = /\.(?:pdf|docx?|xlsx?|pptx?|zip)(?:$|\?)|\/(?:docs?|documentation|wiki\/[^/]+\/edit|api)\//i
const MAIL = /(?:^|\.)(?:stibee\.com|mailchi\.mp|list-manage\.com|substack\.com|beehiiv\.com|campaign-archive\.com)$|\/(?:emails?|newsletters?)\//i

function parts(url: string): { host: string; path: string; root: boolean } | null {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname.replace(/\/+$/, '')
    return { host: parsed.hostname.toLowerCase(), path, root: path === '' || /^\/(?:index\.html?|home|accueil|en|fr|es|de)$/i.test(path) }
  } catch {
    return null
  }
}

/**
 * Why this page is not a site worth a draw, or null when it may be one.
 * `provider` 'google-cse': a search result is some page deep inside some site;
 * unless it is a site's front page or on a project host, it is a single page,
 * and that is what the owner found dull. Even a short address (/enrollment,
 * /price-list, /private-events) was one: 4,824 of them, nearly all dull.
 */
export function boringWebReason(url: string | null | undefined, title?: string | null, provider?: string | null): BoringReason | null {
  const reason = reasonOf(url, title, provider)
  return reason && CURIOUS_REASONS.has(reason) && CURIOUS.test(title ?? '') ? null : reason
}

/**
 * A page, an article or a listing whose title names something curious is kept:
 * the Museum of the Weird, a museum of impossible objects, a cartoon from 1919,
 * a roadside mystery. Set aside with the rest on 27 September, 7,310 of them;
 * about one in three was worth it, and the owner asked for them back.
 */
const CURIOUS_REASONS = new Set<BoringReason>(['page', 'article', 'listing'])
export const CURIOUS = /\b(?:museum|musée|museo|archive|archives|archivo|collection|gallery|galerie|interactive|interactif|map|carte|mapa|atlas|game|jeu|juego|generator|simulator|virtual|explore|timeline|history of|histoire|curious|weird|strange|bizarre|oddities|vintage|retro|old|ancient|lost|forgotten|abandoned|secret|hidden|mystery|legend|folklore|museum of|library of|database of|every|world's|smallest|largest|oldest|longest|tiny|miniature|toy|toys|puppet|robot|machine|automaton|sound|radio|synth|music box|collection of)\b/i

/**
 * Platforms and big hosts: their front page is not a small site of someone's,
 * so a page found on them is not turned into one (see frontPageOf).
 */
const PLATFORM_HOST = /(?:^|\.)(?:yelp\.[a-z.]+|tripadvisor\.[a-z.]+|trip\.com|booking\.com|airbnb\.[a-z.]+|expedia\.[a-z.]+|agoda\.com|hotels\.com|medium\.com|naver\.com|daum\.net|microsoft\.com|google\.[a-z.]+|goo\.gl|youtube\.com|facebook\.com|fb\.com|instagram\.com|linkedin\.com|threads\.net|wikipedia\.org|wikimedia\.org|wikidata\.org|fandom\.com|wikia\.com|amazon\.[a-z.]+|ebay\.[a-z.]+|etsy\.com|apple\.com|pinterest\.[a-z.]+|reddit\.com|tiktok\.com|x\.com|twitter\.com|github\.com|gitlab\.com|wordpress\.com|blogspot\.com|blogger\.com|substack\.com|tumblr\.com|wix\.com|squarespace\.com|weebly\.com|eventbrite\.[a-z.]+|meetup\.com|timeout\.com|imdb\.com|spotify\.com|soundcloud\.com|bandcamp\.com|vimeo\.com|dailymotion\.com|twitch\.tv|scribd\.com|academia\.edu|researchgate\.net|issuu\.com|slideshare\.net|yahoo\.[a-z.]+|msn\.com|aol\.com|bing\.com|baidu\.com|yandex\.[a-z.]+|pagesjaunes\.fr|yellowpages\.[a-z.]+|foursquare\.com|glassdoor\.[a-z.]+|indeed\.[a-z.]+|craigslist\.org|zillow\.com|opentable\.[a-z.]+|thefork\.[a-z.]+|ubereats\.com|doordash\.com|deliveroo\.[a-z.]+|jumia\.[a-z.]+|mercadolibre\.[a-z.]+|alibaba\.com|aliexpress\.com|archive\.org|quora\.com|stackexchange\.com|stackoverflow\.com|nytimes\.com|bbc\.co\.uk|bbc\.com|cnn\.com|theguardian\.com|forbes\.com)$/i

/**
 * The front page of the site a page belongs to, when that site is someone's
 * own — a plumber in Douala, a brewery, a theatre — and not a platform, a
 * newspaper, an encyclopaedia or a shop chain. The owner's picture of the web
 * part (28 September): "des sites de plombier au Cameroun", not always
 * interesting, but a site, never a page of text.
 */
export function frontPageOf(url: string | null | undefined): string | null {
  const address = parts(url ?? '')
  if (!address) return null
  const { host } = address
  if (PLATFORM_HOST.test(host) || NEWS_HOST.test(host) || WIKI_HOST.test(host) || PRESS_HOST.test(host) || SHOP_HOST.test(host)
    || STORE_HOST.test(host) || VIDEO_HOST.test(host) || MEDIA_HOST.test(host) || MAIL.test(host)) return null
  if (/^(?:\d+\.){3}\d+$/.test(host) || !host.includes('.')) return null
  return `https://${host}/`
}

function reasonOf(url: string | null | undefined, title?: string | null, provider?: string | null): BoringReason | null {
  const address = parts(url ?? '')
  if (!address) return 'document'
  const { host, path, root } = address
  const text = title ?? ''
  if (VIDEO_HOST.test(host) && (VIDEO_PATH.test(path) || host.endsWith('youtu.be'))) return 'video'
  if (MAIL.test(host) || MAIL.test(path)) return 'mail'
  if (DOCUMENT.test(path)) return 'document'
  if (STORE_HOST.test(host)) return 'shop'
  if (MEDIA_HOST.test(host) && !root) return 'media'
  if (SHOP_HOST.test(host) || SHOP_PATH.test(path) || (!root && PRICE.test(text))) return 'shop'
  if (WIKI_HOST.test(host) && !root) return 'article'
  if (PRESS_HOST.test(host)) return 'article'
  if (ADMIN_HOST.test(host) && !root) return 'admin'
  if (ADMIN_PATH.test(path)) return 'admin'
  if (LISTING_PATH.test(path)) return 'listing'
  if (NEWS_HOST.test(host) && !root) return 'article'
  if (DATED_PATH.test(path) || ARTICLE_PATH.test(path)) return 'article'
  if (!root && LISTICLE.test(text)) return 'article'
  if (provider === 'google-cse' && !root && !PROJECT_HOST.test(host)) return 'page'
  return null
}
