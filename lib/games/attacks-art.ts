/**
 * RANDOM ATTACKS' traced pictures (`scripts/games/attacks-trace.ts`): files
 * in `public/games/attacks/`, read in the browser the first time they are
 * asked for, then kept. Until a picture has arrived, `attacksArt` answers
 * null and the screen draws what it can without it. A script or a test, with
 * no browser, hands the pictures over itself (`provideAttacksArt`).
 */

import { PixelBuffer } from './pixels'

export type AttacksArtName = 'titleWide' | 'titleTall' | 'playWide' | 'playTall' | 'rover'

const FILES: Record<AttacksArtName, string> = {
  titleWide: '/games/attacks/title-wide.png',
  titleTall: '/games/attacks/title-tall.png',
  playWide: '/games/attacks/play-wide.png',
  playTall: '/games/attacks/play-tall.png',
  rover: '/games/attacks/rover.png',
}

const ready = new Map<AttacksArtName, PixelBuffer>()
const asked = new Set<AttacksArtName>()
const waiting = new Map<AttacksArtName, Array<() => void>>()

/** A picture, or null while it is on its way (asked for on the first call, in a browser). */
export function attacksArt(name: AttacksArtName): PixelBuffer | null {
  const art = ready.get(name)
  if (art) return art
  if (typeof window !== 'undefined' && typeof Image !== 'undefined' && !asked.has(name)) {
    asked.add(name)
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(image, 0, 0)
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      const buffer = new PixelBuffer(canvas.width, canvas.height)
      buffer.data.set(data)
      ready.set(name, buffer)
      for (const done of waiting.get(name) ?? []) done()
      waiting.delete(name)
    }
    // a picture that will not come: asked again next time
    image.onerror = () => { asked.delete(name) }
    image.src = FILES[name]
  }
  return null
}

/** When the pictures named are in (asked for now if they were not), at most `ms` later: for a picture drawn once, as the share card. */
export function attacksArtReady(names: AttacksArtName[], ms = 4000): Promise<void> {
  const each = names.map((name) => new Promise<void>((resolve) => {
    if (attacksArt(name)) { resolve(); return }
    waiting.set(name, [...(waiting.get(name) ?? []), resolve])
  }))
  return Promise.race([Promise.all(each).then(() => undefined), new Promise<void>((resolve) => setTimeout(resolve, ms))])
}

/** A picture handed over without a browser: a script, a test. */
export function provideAttacksArt(name: AttacksArtName, buffer: PixelBuffer): void {
  ready.set(name, buffer)
}
