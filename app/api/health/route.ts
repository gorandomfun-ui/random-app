export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  try {
    const db = await getDb(process.env.MONGODB_DB || process.env.MONGO_DB || 'randomapp')
    const ping = await db.command?.({ ping: 1 })
    return NextResponse.json({ ping: ping?.ok ?? 0, hasEnv: !!(process.env.MONGO_URI || process.env.MONGODB_URI) })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'db error' }, { status: 500 })
  }
}
