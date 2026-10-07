import CaptureClient from './CaptureClient'

export default function CapturePage({ params }: { params: { id: string } }) {
  return <CaptureClient queueItemId={params.id} />
}
