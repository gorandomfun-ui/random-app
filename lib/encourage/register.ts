// lib/encourage/register.ts
// À appeler quand on clique sur “Go Random” / “Random Again”
const STORAGE_KEY = 'encourage_click_count_v1'

function getCount(): number {
  try { return parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10) || 0 } catch { return 0 }
}
function setCount(n: number) {
  try { localStorage.setItem(STORAGE_KEY, String(n)) } catch {}
}

export function registerRandomClick(step = 1) {
  const next = getCount() + step
  setCount(next)
  // l’overlay écoute cet event et montrera la popup tous les 6 clics
  window.dispatchEvent(new CustomEvent('random:clicked', { detail: { count: next } }))
}
