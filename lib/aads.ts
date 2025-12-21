'use client'

const SCRIPT_ID = 'aads-script'
const SCRIPT_SRC = 'https://static.a-ads.com/js/show_ads.js'

export const AADS_REFRESH_EVENT = 'aads:refresh-slot'
export type AadsRefreshTarget = 'footer' | 'inline'

declare global {
  interface Window {
    __aadsScriptPromise?: Promise<void>
  }
}

export function ensureAadsScript(): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve()
  }

  const globalWindow = window as Window & { __aadsScriptPromise?: Promise<void> }
  if (globalWindow.__aadsScriptPromise) return globalWindow.__aadsScriptPromise
  if (document.getElementById(SCRIPT_ID)) return Promise.resolve()

  globalWindow.__aadsScriptPromise = new Promise((resolve) => {
    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.src = SCRIPT_SRC
    script.async = true
    script.addEventListener('load', () => resolve())
    script.addEventListener('error', () => resolve())
    document.body.appendChild(script)
  })

  return globalWindow.__aadsScriptPromise
}

type MountOptions = {
  onLoad?: () => void
  onFallback?: () => void
  timeoutMs?: number
}

export function mountAadsSlot(
  container: HTMLElement,
  unitId: string | undefined,
  options?: MountOptions
): () => void {
  if (!container || !unitId) {
    options?.onFallback?.()
    return () => undefined
  }

  ensureAadsScript().catch(() => {
    options?.onFallback?.()
  })

  container.replaceChildren()
  const slot = document.createElement('div')
  slot.dataset.aa = unitId
  slot.style.width = '100%'
  slot.style.height = '100%'
  slot.style.display = 'block'
  container.appendChild(slot)

  let timer: number | null = null
  let settled = false

  if (typeof window !== 'undefined') {
    timer = window.setTimeout(() => {
      if (!settled) {
        settled = true
        options?.onFallback?.()
      }
    }, options?.timeoutMs ?? 6000)
  }

  const observer = typeof MutationObserver !== 'undefined'
    ? new MutationObserver(() => {
        if (slot.childElementCount > 0 && !settled) {
          settled = true
          if (timer !== null) {
            window.clearTimeout(timer)
            timer = null
          }
          options?.onLoad?.()
          observer.disconnect()
        }
      })
    : null

  observer?.observe(slot, { childList: true })

  return () => {
    observer?.disconnect()
    if (timer !== null) {
      window.clearTimeout(timer)
      timer = null
    }
  }
}

export function dispatchAadsRefresh(target: AadsRefreshTarget) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(AADS_REFRESH_EVENT, { detail: { slot: target } }))
}

export type AadsRefreshEvent = CustomEvent<{ slot: AadsRefreshTarget }>
