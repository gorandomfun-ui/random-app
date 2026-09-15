/** Search destinations, NOT claims about a returned video's country or language. */
const AREAS = [
  { area: 'eastern-europe', places: ['Polska', 'România', 'Srbija', 'Україна'], languages: ['pl', 'ro', 'sr', 'uk'],
    angles: ['koncert amatorski', 'film de familie', 'amaterski film', 'домашнє відео'] },
  { area: 'west-africa', places: ['Ghana', 'Sénégal', 'Nigeria', 'Côte d’Ivoire'], languages: ['en', 'fr', 'en', 'fr'],
    angles: ['local performance', 'fête de quartier', 'homemade invention', 'film amateur'] },
  { area: 'east-africa', places: ['Kenya', 'Tanzania', 'Uganda'], languages: ['en', 'sw', 'en'],
    angles: ['amateur sport', 'muziki', 'home video'] },
  { area: 'southern-africa', places: ['South Africa', 'Madagascar', 'Mozambique'], languages: ['en', 'fr', 'pt'],
    angles: ['independent short film', 'musique amateur', 'festa de família'] },
  { area: 'north-africa', places: ['المغرب', 'الجزائر', 'مصر', 'Tunisie'], languages: ['ar', 'ar', 'ar', 'fr'],
    angles: ['موسيقى', 'حرف يدوية', 'فيلم قصير', 'fête amateur'] },
  { area: 'japan', places: ['日本', '大阪', '北海道', '沖縄'], languages: ['ja', 'ja', 'ja', 'ja'],
    angles: ['自主制作映画', '自作楽器', 'ホームビデオ', 'ゲーム実況'] },
  { area: 'korea', places: ['한국', '부산', '제주'], languages: ['ko', 'ko', 'ko'],
    angles: ['독립영화', '길거리 공연', '가족 여행'] },
  { area: 'caribbean', places: ['Jamaica', 'Haïti', 'Trinidad', 'República Dominicana', 'Guadeloupe'], languages: ['en', 'fr', 'en', 'es', 'fr'],
    angles: ['local performance', 'musique amateur', 'home video', 'fiesta familiar', 'sport amateur'] },
  { area: 'south-america', places: ['Perú', 'Colombia', 'Brasil', 'Bolivia'], languages: ['es', 'es', 'pt', 'es'],
    angles: ['cortometraje independiente', 'experimento casero', 'vídeo de família', 'música experimental'] },
  { area: 'central-asia', places: ['Қазақстан', 'Uzbekistan', 'Mongolia'], languages: ['kk', 'en', 'en'],
    angles: ['музыка', 'home video', 'local performance'] },
  { area: 'oceania', places: ['New Zealand', 'Fiji', 'Australia'], languages: ['en', 'en', 'en'],
    angles: ['local festival', 'family celebration', 'experimental short film'] },
  { area: 'western-europe', places: ['Portugal', 'Slovenija', 'Norge', 'France'], languages: ['pt', 'sl', 'no', 'fr'],
    angles: ['música experimental', 'amaterski film', 'hjemmevideo', 'spectacle amateur'] },
] as const
export const SEARCH_AREAS = AREAS.map(x => x.area)
export type SearchCoverage = { area: string; place: string; language: string }
export function geographicSearch(ordinal: number) {
  const n = Math.max(0, Math.floor(ordinal)), area = AREAS[n % AREAS.length]
  const cycle = Math.floor(n / AREAS.length), slot = cycle % area.places.length
  const place = area.places[slot], language = area.languages[slot]
  // Half the returns use a broad place-led search. No mandatory 'weird' token.
  const query = cycle % 2 ? place : `${place} ${area.angles[slot]}`
  return { query, language, coverage: { area: area.area, place, language } }
}
