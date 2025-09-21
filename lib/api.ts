// lib/api.ts
export type RandomTypes = Array<'image'|'quote'|'fact'|'joke'|'video'|'web'>

export async function fetchRandom({ types, lang }: { types: RandomTypes, lang: 'en'|'fr'|'de'|'jp' }) {
  const qs = new URLSearchParams({
    types: types.join(','),
    lang,
    // anti-cache dev/proxy
    t: String(Date.now()),
  })
  const res = await fetch(`/api/random?${qs.toString()}`, {
    cache: 'no-store', // Next 14: désactive le cache fetch côté client
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  // l’API renvoie { item: {...} } — on renvoie tel quel pour que page.tsx fasse res.item
  return await res.json()
}
