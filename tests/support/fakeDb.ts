import type { Db, Document, Filter } from 'mongodb'

/**
 * Enough of a database for a cool draw, without Mongo: equality (an array
 * field holds the value), `$in`, `$ne`, `$gte`, `$lt`, a sort on `rand` and
 * a limit. Every collection but `items` is empty.
 */
export function fakeDb(items: Document[]): Db {
  const read = (row: Document, path: string) => path.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], row)
  const holds = (value: unknown, wanted: unknown) => (Array.isArray(value) ? value.includes(wanted) : value === wanted)
  const matches = (row: Document, filter: Filter<Document>) => Object.entries(filter).every(([key, condition]) => {
    const value = read(row, key)
    if (condition && typeof condition === 'object' && !Array.isArray(condition)) {
      const ops = condition as Record<string, unknown>
      if ('$in' in ops) return (ops.$in as unknown[]).some((wanted) => holds(value, wanted))
      if ('$ne' in ops) return value !== ops.$ne
      if ('$gte' in ops && !((value as number) >= (ops.$gte as number))) return false
      if ('$lt' in ops && !((value as number) < (ops.$lt as number))) return false
      return true
    }
    return holds(value, condition)
  })
  const collection = (name: string) => ({
    find: (filter: Filter<Document>, options?: { limit?: number; sort?: Record<string, number> }) => ({
      toArray: async () => {
        if (name !== 'items') return []
        let rows = items.filter((row) => matches(row, filter))
        if (options?.sort?.rand) rows = [...rows].sort((a, b) => (a.rand as number) - (b.rand as number))
        return options?.limit ? rows.slice(0, options.limit) : rows
      },
    }),
  })
  return { collection } as unknown as Db
}

let counter = 0
/** A servable video of one register, its key `youtube:vid<n>`. */
export function fakeVideo(register: string, extra: Document = {}): Document {
  counter += 1
  return {
    _id: `aaaaaaaaaaaaaaaaaaaaaa${String(counter).padStart(2, '0')}`, type: 'video', provider: 'youtube', videoId: `vid${counter}`,
    title: `contenu ${counter}`, rand: counter / 100, v3: { registers: [register], popularity: 'niche', usable: true }, ...extra,
  }
}
