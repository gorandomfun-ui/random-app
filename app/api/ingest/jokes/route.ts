// app/api/ingest/jokes/route.ts

// Empêche toute tentative de rendu statique et de mise en cache
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = 'nodejs' // on force Node.js (si tu utilises Edge ailleurs, pas grave)

// Si tu as une vraie fonction d’ingestion, importe-la ici :
// import { ingestJokes } from '@/lib/ingest/jokes'

import { NextResponse } from 'next/server'

/**
 * GET /api/ingest/jokes?limit=50&lang=fr&dryRun=1
 * - limit (optionnel) : nombre max à ingérer (par défaut 50)
 * - lang  (optionnel) : ex. 'fr', 'en', etc. (par défaut 'en')
 * - dryRun (optionnel): '1' pour tester sans rien écrire
 */
export async function GET(request: Request) {
  try {
    // On lit l’URL ici sans souci : la route est déclarée dynamique.
    const url = new URL(request.url)
    const limitParam = url.searchParams.get('limit')
    const langParam = url.searchParams.get('lang')
    const dryRunParam = url.searchParams.get('dryRun')

    const limit = clampInt(limitParam, 1, 500, 50) // min 1, max 500, défaut 50
    const lang = (langParam || 'en').toLowerCase()
    const dryRun = dryRunParam === '1'

    // --- Appelle ta vraie ingestion ici ---
    // const result = await ingestJokes({ limit, lang, dryRun })

    // Placeholder simple pour éviter de casser ton déploiement si la lib n’est pas branchée :
    const result = await fakeIngestJokes({ limit, lang, dryRun })

    return NextResponse.json(
      {
        ok: true,
        params: { limit, lang, dryRun },
        summary: result?.summary ?? 'ingestion finished'
      },
      { status: 200 }
    )
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: err?.message ?? String(err)
      },
      { status: 500 }
    )
  }
}

/**
 * Optionnel : si tu veux aussi autoriser POST pour déclencher l’ingestion
 * depuis un cron externe ou un appel serveur →copie le GET dans POST.
 */
// export async function POST(request: Request) {
//   return GET(request)
// }

/* -------------------------- Helpers -------------------------- */

function clampInt(v: string | null, min: number, max: number, fallback: number) {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.floor(n)))
}

// Faux “ingest” pour ne pas casser si la vraie fonction n’est pas encore branchée.
// Remplace par ton vrai ingest quand tu veux.
async function fakeIngestJokes({ limit, lang, dryRun }: { limit: number; lang: string; dryRun: boolean }) {
  // Simule un petit temps de traitement
  await new Promise(r => setTimeout(r, 50))
  return {
    summary: dryRun
      ? `Dry run OK — would ingest up to ${limit} jokes [${lang}]`
      : `Ingested ${Math.min(limit, 42)} jokes [${lang}]` // chiffre bidon pour l’exemple
  }
}
