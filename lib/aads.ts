'use client'

export const AADS_REFRESH_EVENT = 'aads:refresh-slot'
export type AadsRefreshTarget = 'footer' | 'inline'
export type AadsSlotStatus = 'idle' | 'loading' | 'visible' | 'empty'

type MountOptions = {
  onLoad?: () => void
  onFallback?: () => void
  size?: string
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

  container.replaceChildren()
  const iframe = document.createElement('iframe')
  const size = options?.size ?? 'Adaptive'
  iframe.dataset.aa = unitId
  iframe.src = `https://ad.a-ads.com/${encodeURIComponent(unitId)}?size=${encodeURIComponent(size)}`
  iframe.width = '100%'
  iframe.height = '100%'
  iframe.scrolling = 'no'
  iframe.frameBorder = '0'
  iframe.style.border = '0'
  iframe.style.padding = '0'
  iframe.style.width = '100%'
  iframe.style.height = '100%'
  iframe.style.display = 'block'
  iframe.style.margin = '0 auto'
  iframe.style.overflow = 'hidden'
  iframe.style.background = 'transparent'
  container.appendChild(iframe)

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

  const settle = (status: 'load' | 'error') => {
    if (settled) return
    settled = true
    if (timer !== null) {
      window.clearTimeout(timer)
      timer = null
    }
    if (status === 'load') options?.onLoad?.()
    else options?.onFallback?.()
  }

  iframe.addEventListener('load', () => settle('load'))
  iframe.addEventListener('error', () => settle('error'))

  return () => {
    iframe.remove()
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
