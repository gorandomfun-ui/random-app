import type { Document, Filter } from 'mongodb'

/** Only content a visitor should be served; the labels settled the rest when they were written. */
export const SERVABLE: Filter<Document> = { isSuppressed: { $ne: true }, obsoleteVideoStatus: { $ne: 'obsolete' } }
