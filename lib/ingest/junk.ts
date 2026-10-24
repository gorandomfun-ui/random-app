/**
 * Ads posing as videos. Measured on 27 September over a day's 24,598
 * entries: 54 scams (verified accounts for sale, "customer care numbers")
 * and 447 product tops from a single farm, always cut from the same pattern
 * ("Top 5 Triangle Shawl Scarves For Summer: Top 5 Best Sellers",
 * "Cheap & Best Top 5 … Unboxing & Review"). The owner's rule: the scams go,
 * a few tops stay for the fun of it — ten a day — and titles full of
 * hashtags are left alone, they are mostly real little videos.
 *
 * Pure: the daily allowance is counted by the store.
 */

export type JunkKind = 'scam' | 'product-top' | 'minors'

/**
 * Titles that sexualise minors, refused whatever the account (24 October: a piracy bait titled after a 14-year-old
 * "gravure idol", 人気中学生グラドル…(14)): the Japanese junior-idol trade's words, a schoolchild next to a pin-up word,
 * and the English words of the same trade. No age alone: "(14)" is as often an episode.
 */
const MINORS = new RegExp([
  'ジュニアアイドル', '着エロ', '(?:中学生|小学生).{0,8}(?:グラドル|グラビア|水着|イメージビデオ)', '(?:グラドル|グラビア|水着|イメージビデオ).{0,12}(?:中学生|小学生)',
  '\\bjunior idols?\\b', '\\bjailbait\\b', '\\b(?:pre-?teens?|underage)\\b.{0,20}\\b(?:models?|bikinis?|sexy|hot)\\b',
].join('|'), 'i')

/** Accounts for sale, support numbers, contact lines: nothing to watch. */
const SCAM = new RegExp([
  '\\bbuy (?:old )?verified\\b', '\\bverified [\\w ]{0,30}accounts?\\b.*\\b(?:buy|sale|shop|deliver)', '\\baccounts? (?:to|for) (?:buy|sale)\\b',
  '\\bplatforms? for buying\\b', '(?:customer|care|support|help ?desk|helpline|toll[- ]?free|contact|service)\\W+(?:phone\\W+)?(?:number|no\\.?)\\b',
  '\\bphone number\\b.*\\b(?:help|support|care|contact|desk)\\b', '\\b(?:help|support|care|contact|desk)\\b.*\\bphone number\\b',
].join('|'), 'i')

/**
 * The product-top farm's own wording, not any "top 10": "Top 10 goals of the season" stays.
 * On 28 September the farm had changed its words — "Top 5 Best Top 5 … (Must Have!)",
 * "Why Everyone Is Buying Top 5 …" — and about a thousand had come through; each new
 * pattern still needs the farm's "Top n" next to it.
 */
const PRODUCT_TOP = new RegExp([
  '\\btop \\d{1,2} best sellers?\\b', '\\bcheap (?:&|and) best top \\d{1,2}\\b', '\\bamazing top \\d{1,2}\\b.*\\byou need to see\\b',
  '\\bultimate guide to the best top \\d{1,2}\\b', '\\bunboxing (?:&|and) review\\b', '\\btop \\d{1,2}\\b.*\\bbuying guide\\b',
  '\\btop \\d{1,2}\\b.*\\(must have!?\\)', '\\bwhy everyone is buying top \\d{1,2}\\b', '\\btop \\d{1,2} best top \\d{1,2}\\b',
  // …and on the evening of 28 September: "Ultimate Guide to the Best Handmade Traditional Kazakh Tush Kiiz Wall Hanging - Kazakh…"
  '^ultimate guide to the best [^-]{10,} - \\S',
  // 20 October, a deal farm on Dailymotion: the product's name cut short, then its tag — "4L-20L Wax Melter Candle
  // Melting Pot DIY Candle Making Pouring... -- Hot Deal 20", "ROCKBROS Waterproof Motorcycle Leg Bag… -- Top Ra".
  // Counted in the ten a day like the others (the owner: "on peut resserrer mais pas virer").
  '\\.{3}\\s*--\\s*(?:hot deals?|top ra|best (?:sellers?|deals?|prices?)|great deals?|new arrivals?|limited offer|on sale)',
].join('|'), 'i')

export function junkKind(title: string | null | undefined): JunkKind | null {
  const text = (title ?? '').trim()
  if (!text) return null
  if (MINORS.test(text)) return 'minors'
  if (SCAM.test(text)) return 'scam'
  if (PRODUCT_TOP.test(text)) return 'product-top'
  return null
}

/** How many product tops a day may still come in. */
export const PRODUCT_TOP_DAILY = 10
