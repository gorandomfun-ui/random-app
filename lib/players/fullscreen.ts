type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => void
}
export function fullscreenElement(): Element | null {
  return (
    document.fullscreenElement || (document as FullscreenDocument).webkitFullscreenElement || null
  )
}
/** Call directly from the click handler, before any await. */
export async function requestContainerFullscreen(element: HTMLElement): Promise<boolean> {
  const webkit = element as HTMLElement & { webkitRequestFullscreen?: () => void }
  try {
    if (element.requestFullscreen) await element.requestFullscreen()
    else if (webkit.webkitRequestFullscreen) webkit.webkitRequestFullscreen()
    else return false
    return fullscreenElement() === element
  } catch {
    return false
  }
}
export function exitContainerFullscreen(element: HTMLElement): void {
  if (fullscreenElement() !== element) return
  try {
    if (document.exitFullscreen) void document.exitFullscreen().catch(() => undefined)
    else (document as FullscreenDocument).webkitExitFullscreen?.()
  } catch {
    /* The browser may already have left fullscreen. */
  }
}
