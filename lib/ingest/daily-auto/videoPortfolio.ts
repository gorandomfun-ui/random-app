import { hash, seeded, shuffled } from '../../discovery/random'

// Query coverage only: these labels must never become tags or evidence on a result.
// Each group keeps contemporary and unusual routes into the same broad universe.
const ROUTES = [
  { id: 'music', current: ['new music video', 'nouveau clip musique', 'live fan recording'], unusual: ['experimental instrument performance', 'concert groupe amateur', 'rehearsal homemade instrument'] },
  { id: 'sport', current: ['sports highlights', 'nouvelle figure skateboard', 'resumen deportivo'], unusual: ['unusual amateur sport', 'tournoi sport local', 'obstacle course homemade'] },
  { id: 'cinema', current: ['official movie trailer', 'nouveau court métrage', 'estreno cine independiente'], unusual: ['student surreal short film', 'film amateur experimental', 'low budget science fiction film'] },
  { id: 'science', current: ['science demonstration', 'nouvelle expérience scientifique', 'experimento ciencia'], unusual: ['homemade physics experiment', 'machine experimentale artisanale', 'unusual laboratory demonstration'] },
  { id: 'games', current: ['new game speedrun', 'nouveau jeu indépendant', 'videojuego mod gameplay'], unusual: ['unexpected game physics', 'jeu video controleur artisanal', 'experimental game mechanic'] },
  { id: 'animation', current: ['independent animation', 'court métrage animation', '自主制作アニメ'], unusual: ['experimental stop motion', 'animation papier artisanale', 'surreal puppet film'] },
  { id: 'craft', current: ['handmade object process', 'creation artisanale', '手工制作'], unusual: ['unusual material sculpture', 'objet detourne fabrication', 'kinetic sculpture homemade'] },
  { id: 'dance', current: ['dance performance', 'battle danse', 'danza contemporanea'], unusual: ['unusual dance performance', 'danse spectacle amateur', 'experimental movement performance'] },
  { id: 'food', current: ['food creation', 'recette creation originale', 'cocina experimental'], unusual: ['unusual food preparation', 'cuisine technique artisanale', 'homemade cooking invention'] },
  { id: 'art', current: ['performance art', 'nouvelle installation artistique', 'arte performance'], unusual: ['outsider art performance', 'spectacle absurde amateur', 'experimental sound installation'] },
  { id: 'comedy', current: ['comedy sketch', 'nouveau sketch humour', 'comedia cortometraje'], unusual: ['surreal comedy sketch', 'improvisation absurde', 'amateur comedy performance'] },
  { id: 'nature', current: ['wildlife observation', 'observation nature', 'naturaleza descubrimiento'], unusual: ['unusual animal behaviour', 'phenomene naturel observation', 'microscopic pond life'] },
  { id: 'technology', current: ['robotics demonstration', 'animation generative', 'nouvelle creation video IA'], unusual: ['homemade mechanical robot', 'electronic art experiment', 'unexpected computer art'] },
  { id: 'everyday', current: ['personal video diary', 'journal video quotidien', 'video casero'], unusual: ['home movie celebration', 'spectacle jardin amateur', 'local community talent show'] },
  { id: 'fashion', current: ['independent fashion show', 'defile creation mode', 'diseno moda desfile'], unusual: ['experimental costume performance', 'costume fabrique maison', 'wearable sculpture performance'] },
  { id: 'places', current: ['city walking tour', 'decouverte quartier', '街歩き'], unusual: ['unexpected local attraction', 'visite lieu insolite', 'small town festival recording'] },
]

type Lane = 'existing' | 'contemporary' | 'unusual'
export type PlannedQuery = { query: string; lane: Lane; route?: string }
export function planVideoQueries(legacy: string[], options: {
  count: number; seed: string; offset?: number; now?: number
}): PlannedQuery[] {
  const count = Math.max(1, Math.min(60, Math.floor(options.count) || 8))
  const offset = Number.isSafeInteger(options.offset) && options.offset! >= 0 ? options.offset! : 0
  const random = seeded(hash(options.seed)), routes = shuffled(ROUTES, random)
  const lanes = shuffled<Lane>(['existing', 'existing', 'contemporary', 'unusual'], random)
  const used = new Set<string>(), out: PlannedQuery[] = []
  let legacyIndex = 0
  const year = new Date(options.now ?? Date.now()).getUTCFullYear()
  for (let i = 0; i < count; i++) {
    const n = offset + i, lane = lanes[n % lanes.length]
    if (lane === 'existing') {
      while (legacyIndex < legacy.length && used.has(legacy[legacyIndex].toLowerCase())) legacyIndex++
      const query = legacy[legacyIndex++]
      if (query) { used.add(query.toLowerCase()); out.push({ query, lane }); continue }
    }
    const newSlot = Math.floor(n / lanes.length) * 2 + lanes.slice(0, n % lanes.length).filter(x => x !== 'existing').length
    const route = routes[newSlot % routes.length]
    const chosenLane = lane === 'existing' ? 'unusual' : lane
    const vocabulary = chosenLane === 'contemporary' ? route.current : route.unusual
    const cycle = Math.floor(newSlot / routes.length)
    let query = vocabulary[cycle % vocabulary.length]
    // A year is a search hint, not proof of freshness or of being a trend.
    if (chosenLane === 'contemporary' && cycle % 2 === 0) query += ` ${year}`
    if (used.has(query.toLowerCase())) query += ` ${['performance', 'recording', 'creation'][cycle % 3]}`
    used.add(query.toLowerCase()); out.push({ query, lane: chosenLane, route: route.id })
  }
  return out
}
