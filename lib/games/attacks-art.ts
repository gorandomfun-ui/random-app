/**
 * RANDOM ATTACKS' traced pictures (`scripts/games/attacks-trace.ts`): files
 * in `public/games/attacks/`, read in the browser the first time they are
 * asked for, then kept. Until a picture has arrived, `attacksArt` answers
 * null and the screen draws what it can without it. A script or a test, with
 * no browser, hands the pictures over itself (`provideAttacksArt`).
 */

import { PixelBuffer } from './pixels'

export type AttacksArtName = 'titleWide' | 'titleTall' | 'playWide' | 'playTall' | 'rover' | 'cook'

const FILES: Record<AttacksArtName, string> = {
  titleWide: '/games/attacks/title-wide.png',
  titleTall: '/games/attacks/title-tall.png',
  playWide: '/games/attacks/play-wide.png',
  playTall: '/games/attacks/play-tall.png',
  rover: '/games/attacks/rover.png',
  cook: '/games/attacks/cook.png',
}

const ready = new Map<AttacksArtName, PixelBuffer>()
const asked = new Set<AttacksArtName>()

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
    }
    // a picture that will not come: asked again next time
    image.onerror = () => { asked.delete(name) }
    image.src = FILES[name]
  }
  return null
}

/** A picture handed over without a browser: a script, a test. */
export function provideAttacksArt(name: AttacksArtName, buffer: PixelBuffer): void {
  ready.set(name, buffer)
}
