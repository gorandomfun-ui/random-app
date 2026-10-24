/**
 * RANDOM FIGHTER's traced pictures (`scripts/games/fighter-trace.ts`, the
 * titles) and cut-out fighters (`scripts/games/fighter-sprites.ts`): files in
 * `public/games/fighter/`, read in the browser the first time they are asked
 * for, then kept. Until a picture has arrived, `fighterArt` answers null and
 * the screen draws what it can without it. A script or a test, with no
 * browser, hands the pictures over itself (`provideFighterArt`).
 */

import type { FighterSprite } from './fighter-art-data'
import { PixelBuffer } from './pixels'

/** The titles, the play's two places (wide and tall), the cut-out fighters. */
export type FighterArtName = 'titleWide' | 'titleTall' | `play-${'dusk' | 'night'}-${'wide' | 'tall'}` | FighterSprite

const fileOf = (name: FighterArtName): string => (name === 'titleWide' ? 'title-wide' : name === 'titleTall' ? 'title-tall' : name)

const ready = new Map<FighterArtName, PixelBuffer>()
const asked = new Set<FighterArtName>()

/** A picture, or null while it is on its way (asked for on the first call, in a browser). Its clear pixels keep an alpha of 0. */
export function fighterArt(name: FighterArtName): PixelBuffer | null {
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
      const buffer = new PixelBuffer(canvas.width, canvas.height)
      buffer.data.set(ctx.getImageData(0, 0, canvas.width, canvas.height).data)
      ready.set(name, buffer)
    }
    // a picture that will not come: asked again next time
    image.onerror = () => { asked.delete(name) }
    image.src = `/games/fighter/${fileOf(name)}.png`
  }
  return null
}

/** A picture handed over without a browser: a script, a test. */
export function provideFighterArt(name: FighterArtName, buffer: PixelBuffer): void {
  ready.set(name, buffer)
}

/** The file of each picture, for a script that hands them over. */
export const fighterArtFile = (name: FighterArtName): string => `${fileOf(name)}.png`
