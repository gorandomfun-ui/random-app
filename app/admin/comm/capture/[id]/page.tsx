import CaptureClient from './CaptureClient'

export default async function CapturePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  return <CaptureClient queueItemId={params.id} />
}
