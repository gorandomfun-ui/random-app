export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  try {
    const db = await getDb(process.env.MONGODB_DB || process.env.MONGO_DB || 'randomapp')
    const pingResult = db.command ? await db.command({ ping: 1 }) : null
    const okValue = typeof pingResult === 'object' && pingResult !== null && typeof (pingResult as { ok?: unknown }).ok === 'number'
      ? (pingResult as { ok?: number }).ok!
      : 0
    return NextResponse.json({ ping: okValue, hasEnv: Boolean(process.env.MONGO_URI || process.env.MONGODB_URI) })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'db error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
