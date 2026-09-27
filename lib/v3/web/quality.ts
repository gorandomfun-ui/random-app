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
const STORE_HOST = /(?:^|\.)(?:apps\.apple\.com|play\.google\.com|chrome\.google\.com|addons\.mozilla\.org|microsoft\.com\/store|photos\.com|pikbest\.com|shutterstock\.com|istockphoto\.com|freepik\.com|dreamstime\.com|alamy\.com|gettyimages\.[a-z.]+|depositphotos\.com|123rf\.com|vecteezy\.com|canva\.com)$/i
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
