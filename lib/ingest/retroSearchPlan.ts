import { youtubeQuotaWindow } from '../discovery/youtubeBudget'
import { geographicSearch } from '../discovery/searchGeography'
import { seeded, shuffled } from '../discovery/random'

const THEMES = [
  'retro tv show', 'public access', 'vintage advertising', 'festival documentary',
  'retro gaming arcade', 'city travelogue', 'home video', 'science documentary',
  'design showcase', 'music performance', 'dance competition', 'cooking show',
  'kids program', 'news special', 'behind the scenes', 'talk show', 'variety show',
  'technology expo', 'sports recap', 'festival recap',
]

/** Historical footage can be uploaded today: years belong in queries, not upload-date exclusions.
 * All existing themes rotate; morning/evening no longer repeat the same first ten.
 * A viewCount sort finds established uploads, not proof of a historical trend. */
export function retroSearchPlan(count: number, now = Date.now()) {
  const window = youtubeQuotaWindow(now)
  const day = Math.floor(Date.parse(`${window.day}T00:00:00Z`) / 86400000)
  const turn = day * 2 + Number(window.afternoon), random = seeded(turn)
  const themes = shuffled(THEMES, random), queries: string[] = []
  const latestYear = new Date(now).getUTCFullYear() - 8
  for (let i = 0; i < Math.min(10, Math.max(2, count)); i++) {
    const year = 1965 + Math.floor(random() * Math.max(1, latestYear - 1965 + 1))
    const topic = i % 4 === 3 ? geographicSearch(turn + i).query : themes[i]
    // Keep some sparse queries; never require full episodes or broadcast terminology.
    queries.push(`${topic} ${year}${i % 3 === 0 ? ' archive' : ''}`)
  }
  return { queries, order: window.afternoon ? 'relevance' as const : 'viewCount' as const }
}

export function youtubeSearchBatch(per: number, pages: number, fast: boolean) {
  return { per: fast ? 50 : Math.min(50, Math.max(1, per)), pages: fast ? 1 : pages,
    concurrency: fast ? 4 : 2, timeout: fast ? 25000 : 45000 }
}
