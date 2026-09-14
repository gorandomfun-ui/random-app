import { hash } from './random'
import { foldSubject } from './subjects'

const GENERIC = new Set(('video videos animation animations animated audio music musique clip clips film movie image photo gif gifs ' +
  'compilation live official original short shorts hd hq upload untitled sans titre test new old funny fun looks cool amazing retro vintage').split(' '))
export function plainSource(value: string): string {
  return value.replace(/<br\s*\/?\s*>|<\/p\s*>/gi, '\n').replace(/<[^>]{0,500}>/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ').replace(/&(?:amp|quot|apos|lt|gt|nbsp);/g, ' ')
}
export function genericTitle(value: string): boolean {
  const title = foldSubject(value)
  if (!title || /^(?:img|dsc|mov|vid|video)[ _.-]*\d[\d _.-]*(?:\.[a-z0-9]+)?$/i.test(value.trim())) return true
  return title.split(' ').filter(x => x.length > 1 && !/^\d+$/.test(x)).every(x => GENERIC.has(x))
}
/** A repetition group is NEVER proof that two videos are identical. */
export function metadataIntegrity(title: string, description: string, legacy = false) {
  const plain = plainSource(description).trim(), normalized = foldSubject(plain), sparse = legacy || genericTitle(title)
  const lines = plain.split(/\n+/).filter(x => x.trim().length > 25)
  const fragmented = lines.length >= 3 || (plain.match(/,/g)?.length ?? 0) >= 8 || (plain.match(/#/g)?.length ?? 0) >= 4
  // Legacy titles are untrusted, but a clean, specific source description remains useful.
  const reliable = !(sparse && fragmented)
  return { reliable, sparse,
    ...((sparse || legacy) && normalized.length >= 100 ? {
      cluster: `${hash(normalized)}:${hash([...normalized].reverse().join(''))}`,
    } : {}) }
}
