import LikesClient from '@/app/likes/LikesClient'
import { CURATION_APP_PATHS } from '@/lib/navigation/appPaths'

export default function CurationLikesPage() {
  return <LikesClient curationMode navigationPaths={CURATION_APP_PATHS} />
}
