/**
 * RANDOM RACING's traced pictures (`scripts/games/racing-trace.ts`): files
 * in `public/games/racing/`, read in the browser the first time they are
 * asked for, then kept. Until a picture has arrived, `racingArt` answers
 * null and the screen draws what it can without it. A script or a test, with
 * no browser, hands the pictures over itself (`provideRacingArt`).
 */

import { PixelBuffer } from './pixels'

export type RacingCarKind = 'rosso' | 'burger' | 'giallo'
export const CAR_SIZES = [130, 104, 60] as const
/** The titles, the far views (the coast's, the other worlds'), the palm, the pine, the rock, the saguaro, and each car straight and turning (right; left is the same mirrored) at three sizes. */
export type RacingArtName = 'titleWide' | 'titleTall' | 'playBack' | 'palm' | 'far-mountain' | 'far-desert' | 'far-city' | 'pine' | 'rock' | 'saguaro' | `car-${RacingCarKind}-${(typeof CAR_SIZES)[number]}` | `car-${RacingCarKind}-${(typeof CAR_SIZES)[number]}-turn`

const fileOf = (name: RacingArtName): string =>
  name === 'titleWide' ? 'title-wide' : name === 'titleTall' ? 'title-tall' : name === 'playBack' ? 'play-back' : name

const ready = new Map<RacingArtName, PixelBuffer>()
const asked = new Set<RacingArtName>()
const waiting = new Map<RacingArtName, Array<() => void>>()

/** A picture, or null while it is on its way (asked for on the first call, in a browser). Its clear pixels keep an alpha of 0. */
export function racingArt(name: RacingArtName): PixelBuffer | null {
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
      for (const done of waiting.get(name) ?? []) done()
      waiting.delete(name)
    }
    // a picture that will not come: asked again next time
    image.onerror = () => { asked.delete(name) }
    image.src = `/games/racing/${fileOf(name)}.png`
  }
  return null
}

/** When the pictures named are in (asked for now if they were not), at most `ms` later: for a picture drawn once, as the share card. */
export function racingArtReady(names: RacingArtName[], ms = 4000): Promise<void> {
  const each = names.map((name) => new Promise<void>((resolve) => {
    if (racingArt(name)) { resolve(); return }
    waiting.set(name, [...(waiting.get(name) ?? []), resolve])
  }))
  return Promise.race([Promise.all(each).then(() => undefined), new Promise<void>((resolve) => setTimeout(resolve, ms))])
}

/** A picture handed over without a browser: a script, a test. */
export function provideRacingArt(name: RacingArtName, buffer: PixelBuffer): void {
  ready.set(name, buffer)
}

/** The file of each picture, for a script that hands them over. */
export const racingArtFile = (name: RacingArtName): string => `${fileOf(name)}.png`
