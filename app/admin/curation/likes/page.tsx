import LikesClient from '@/app/likes/LikesClient'
import { CURATION_APP_PATHS } from '@/lib/navigation/appPaths'
import Link from 'next/link'

export default function CurationLikesPage() {
  return <><div className="bg-black p-3 text-center text-sm text-white"><Link href="/admin/curation/status" className="underline">Suivi de ta curation et des recherches</Link></div>
    <LikesClient curationMode navigationPaths={CURATION_APP_PATHS} /></>
}
