/** At most one retry, only when the server explicitly identifies incomplete retrieval. */
export async function requestWavePlan(body: unknown, signal: AbortSignal, request: typeof fetch = fetch) {
  const send = () => request('/api/discovery/wave', { method: 'POST', signal,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  let response = await send()
  if (response.status !== 503 || response.headers.get('Retry-After') !== '1') return response
  await new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return }
    const finish = () => { signal.removeEventListener('abort', abort); resolve() }
    const timer = setTimeout(finish, 1000)
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(signal.reason) }
    signal.addEventListener('abort', abort, { once: true })
  })
  response = await send()
  return response
}
