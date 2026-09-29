/**
 * The words that take a search around a subject and down the ladder.
 *
 * Around a person, each group is one search: the subject's name and the
 * group's words joined by "|" (YouTube reads it as "or"). The owner's own
 * search "will smith homemade" found the clay sculptor: fan-made things,
 * beginnings, bloopers, parodies, family, the street. A theme gets its
 * angles from its own list (era, place, situation), one combination per
 * search, so "ventriloquist" is a hundred subjects and never runs dry.
 */

export type AngleGroup = { label: string; en: string; fr: string; es: string }

export const PERSON_ANGLES: AngleGroup[] = [
  { label: 'bêtisier et coulisses', en: 'bloopers|behind the scenes|outtakes|gag reel|on set', fr: 'bêtisier|coulisses|tournage|making of', es: 'tomas falsas|detrás de cámaras|bloopers' },
  { label: 'moments drôles et bizarres', en: 'funny|weird|hilarious|awkward|prank|crazy moment', fr: 'drôle|fou rire|insolite|bizarre|moment gênant', es: 'gracioso|momento|broma|risa' },
  { label: 'parodies et sosies', en: 'parody|impression|imitation|lookalike|cosplay|spoof', fr: 'parodie|imitation|sosie|déguisé', es: 'parodia|imitación|doble' },
  { label: 'fait maison', en: 'homemade|handmade|fan made|clay|drawing|cake|fan art|lego|stop motion', fr: 'fait maison|dessin|gâteau|pâte à modeler|fan art', es: 'hecho a mano|dibujo|pastel|fan art' },
  { label: 'débuts', en: 'young|first|early|throwback|before famous|debut|rare footage', fr: 'jeune|débuts|premier|rare|archive|inédit', es: 'joven|primer|inicios|rara' },
  { label: 'dans la rue et en famille', en: 'street|singing|dancing|karaoke|family|kids|fans|meets', fr: 'rue|chante|danse|famille|enfants|fans|rencontre', es: 'calle|canta|baila|familia|fans' },
]

export const THEME_ANGLES: AngleGroup[] = [
  { label: 'amateur', en: 'amateur|homemade|home video|backyard', fr: 'amateur|fait maison|jardin', es: 'amateur|casero' },
  { label: 'lieux', en: 'street|village|school|talent show|wedding|market|subway', fr: 'rue|village|école|mariage|marché|métro', es: 'calle|pueblo|escuela|boda|mercado' },
  { label: 'archives', en: 'vintage|vhs|archive|1970s|1980s|1990s|old tv', fr: 'archive|vhs|années 80|années 90|vieille télé|ina', es: 'archivo|vhs|años 80|años 90' },
  { label: 'gens', en: 'kids|grandma|grandpa|family|dad|teacher', fr: 'enfants|grand-mère|papi|famille|papa|prof', es: 'niños|abuela|abuelo|familia' },
  { label: 'ratés et fous', en: 'fail|funny|weird|crazy|gone wrong|epic', fr: 'raté|drôle|bizarre|fou|catastrophe', es: 'fallo|gracioso|raro|loco' },
  { label: 'ailleurs', en: 'japan|brazil|india|nigeria|russia|mexico|korea|turkey', fr: 'japon|brésil|inde|nigeria|russie|mexique|corée|turquie', es: 'japón|brasil|india|rusia|méxico|corea' },
]

/** The eras a theme is combined with, one search each. */
export const THEME_ERAS = ['1970s', '1980s', '1990s', '2000s', '2010s']

/** The language of the angle words: the subject's, when we have it in the table. */
export function anglesIn(group: AngleGroup, lang: string | undefined): string {
  if (lang === 'fr') return group.fr
  if (lang === 'es' || lang === 'pt') return group.es
  return group.en
}

/** The query of a person's around pass: the exact name, then the group's words. */
export function personQuery(label: string, group: AngleGroup, lang: string | undefined): string {
  return `"${label}" ${anglesIn(group, lang)}`
}

/** Every angle a theme may be combined with: the groups, then the eras. */
export function themeAngles(): string[] {
  return [...THEME_ANGLES.map((group) => group.label), ...THEME_ERAS]
}

/** The query of one theme combination: the theme's words, then the angle's. */
export function themeQuery(label: string, angle: string, lang: string | undefined): string {
  const group = THEME_ANGLES.find((candidate) => candidate.label === angle)
  return group ? `${label} ${anglesIn(group, lang)}` : `${label} ${angle}`
}
