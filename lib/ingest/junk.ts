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

export type JunkKind = 'scam' | 'product-top'

/** Accounts for sale, support numbers, contact lines: nothing to watch. */
const SCAM = new RegExp([
  '\\bbuy (?:old )?verified\\b', '\\bverified [\\w ]{0,30}accounts?\\b.*\\b(?:buy|sale|shop|deliver)', '\\baccounts? (?:to|for) (?:buy|sale)\\b',
  '\\bplatforms? for buying\\b', '(?:customer|care|support|help ?desk|helpline|toll[- ]?free|contact|service)\\W+(?:phone\\W+)?(?:number|no\\.?)\\b',
  '\\bphone number\\b.*\\b(?:help|support|care|contact|desk)\\b', '\\b(?:help|support|care|contact|desk)\\b.*\\bphone number\\b',
].join('|'), 'i')

/** The product-top farm's own wording, not any "top 10": "Top 10 goals of the season" stays. */
const PRODUCT_TOP = new RegExp([
  '\\btop \\d{1,2} best sellers?\\b', '\\bcheap (?:&|and) best top \\d{1,2}\\b', '\\bamazing top \\d{1,2}\\b.*\\byou need to see\\b',
  '\\bultimate guide to the best top \\d{1,2}\\b', '\\bunboxing (?:&|and) review\\b', '\\btop \\d{1,2}\\b.*\\bbuying guide\\b',
].join('|'), 'i')

export function junkKind(title: string | null | undefined): JunkKind | null {
  const text = (title ?? '').trim()
  if (!text) return null
  if (SCAM.test(text)) return 'scam'
  if (PRODUCT_TOP.test(text)) return 'product-top'
  return null
}

/** How many product tops a day may still come in. */
export const PRODUCT_TOP_DAILY = 10
