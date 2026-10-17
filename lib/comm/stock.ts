/** The stock pictures a promo may use: permissive licences, no attribution owed, known hosts only. */

export const STOCK_PROVIDERS = ['pexels', 'pixabay', 'unsplash']
export const STOCK_HOSTS = ['images.pexels.com', 'cdn.pixabay.com', 'pixabay.com', 'images.unsplash.com']
/** Words the pictures are tagged with; one is drawn, then a random point on the rand axis: a cheap walk of the keywords index. */
export const STOCK_WORDS = ['nature', 'city', 'people', 'water', 'sky', 'street', 'light', 'night', 'summer', 'travel', 'food', 'animal', 'music', 'art', 'color', 'beach', 'forest', 'car', 'space', 'flower', 'house', 'mountain', 'sea', 'sport']

export function stockHostAllowed(url: string): boolean {
  try { return STOCK_HOSTS.includes(new URL(url).hostname) } catch { return false }
}
