import { cookies } from 'next/headers'
import { CURATOR_COOKIE, curatorConfigured, validCuratorToken } from '@/lib/discovery/curatorAuth'
import CuratorLogin from '@/app/admin/curation/Login'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Random — Comm', robots: { index: false, follow: false } }

/** The same door as the curation: the curator's cookie, or the login form. */
export default function CommLayout({ children }: { children: React.ReactNode }) {
  if (!validCuratorToken(cookies().get(CURATOR_COOKIE)?.value)) {
    return <CuratorLogin configured={curatorConfigured()} />
  }
  return children
}
