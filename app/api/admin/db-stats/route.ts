export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { adminUnauthorizedBody, isAdminRequest } from '@/lib/auth/adminAuth'
import { getDatabase } from '@/lib/mongodb'

export async function GET(req: Request) {
  if (!isAdminRequest(req)) {
    return NextResponse.json(adminUnauthorizedBody(), { status: 401 })
  }

  try {
    const db = await getDatabase()
    const names = await db.listCollections().toArray()
    const out: Array<{ name: string; count: number }> = []
    for (const n of names) {
      try {
        const c = await db.collection(n.name).estimatedDocumentCount()
        out.push({ name: n.name, count: c })
      } catch {
        out.push({ name: n.name, count: -1 })
      }
    }
    // tri pour y voir clair
    out.sort((a, b) => a.name.localeCompare(b.name))
    return NextResponse.json({
      db: db.databaseName,
      collections: out,
      hint: 'Vérifie que images/facts/jokes/videos/websites > 0. Si 0 → lance les routes d’ingest correspondantes.',
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
