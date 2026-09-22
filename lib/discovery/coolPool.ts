/**
 * The cool pool inside the live random.
 *
 * A cool visual ticket is one content, drawn live from the whole catalogue —
 * a register, a zone around a curation like, or the trend, as the session's
 * bag decides — with the refusals of the registers. Nothing follows it: a
 * visitor who wants more of the same has the Wave button. The format
 * sequence stays in charge of what type comes next.
 *
 * No server state: the session's bag says what each cool ticket asks for,
 * and its recent list says what may not come back.
 */

import type { Db } from 'mongodb'

import { candidateFromRow, type CatalogueRow } from './catalog'
import { hardEligible, type Intent, type PoolResult, type Session } from './pool'
import type { Rng } from './random'
import { drawStart, type StartSource } from '../v3/cool/start'
import { bagSourceAt, nicheAt, type CoolSource, type NicheSource } from '../v3/cool/bag'
import type { Popularity } from '../v3/types'

/** A draw whose few rows are all refused is tried again from another point. */
const ATTEMPTS = 3

export type CoolChoice = {
  /** The content's id. */
  id: string
  /** What the content actually came from. */
  source: StartSource
  /** What the bag asked for, and whether the answer had to come from elsewhere. */
  asked: CoolSource
  /** Which register a niche ticket meant. */
  niche?: NicheSource
  fallback: boolean
  popularity: Popularity
}
export type CoolResult<T> = PoolResult<T> & { cool: CoolChoice }

type Decoder<T> = (row: CatalogueRow) => T | null

/**
 * What a cool visual ticket gets: one content from the source the bag
 * names for this ticket. Null when the pool holds nothing eligible, and the
 * caller falls back to the lanes.
 */
export async function selectCool<T>(
  db: Db, ticket: Intent, state: Session, decode: Decoder<T>, random: Rng, now: number,
): Promise<CoolResult<T> | null> {
  const type = ticket.type === 'image' ? 'image' : 'video'
  // The session's bag says what this ticket is for; the ticket count walks it.
  const asked = bagSourceAt(state.seed, state.coolTickets)
  const niche = asked === 'niche' ? nicheAt(state.seed, state.coolTickets) : undefined
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const drawn = await drawStart(db, { type, source: asked, niche, random, now })
    if (!drawn) continue
    for (const row of drawn.rows as CatalogueRow[]) {
      const payload = decode(row)
      if (payload == null) continue
      const candidate = candidateFromRow(row, payload, now)
      if (!hardEligible(candidate, ticket, state)) continue
      const popularity = ((row.v3 as { popularity?: Popularity } | undefined)?.popularity ?? 'unknown') as Popularity
      return {
        item: candidate, branch: drawn.source.startsWith('like') ? 'editorial' : 'autonomous', fallback: false,
        selection: { requestedLane: ticket.lane, servedLane: 'any', reasons: [] },
        cool: { id: String(row._id), source: drawn.source, asked, ...(niche ? { niche } : {}), fallback: drawn.fallback, popularity },
      }
    }
  }
  return null
}
