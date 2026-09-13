// Child-process fixture only. Provider responses are mocked; database writes use temporary test MongoDB.
const mode = process.env.RANDOM_TEST_RUNNER_MODE
let calls = 0
const totals = { youtube: 0, dailymotion: 0 }
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input))
  if (!init.signal) throw new Error('Provider request without deadline')
  if (++calls > 100) throw new Error('Unexpected provider request loop')
  if (url.hostname === 'www.googleapis.com') {
    totals.youtube++
    if (mode === 'youtube-rate-limit') return Response.json({}, { status: 429 })
    return Response.json({ items: [{ id: { videoId: 'abcdefghijk' }, snippet: {
      title: 'South Park fan drawing', description: 'Hand drawn artwork', publishedAt: '2026-09-01T00:00:00Z',
    } }] })
  }
  if (url.hostname === 'api.dailymotion.com') {
    totals.dailymotion++
    return Response.json({ has_more: false, list: [{ id: 'x123abc', title: 'Johnny Hallyday fan collection',
      description: 'A collection of concert souvenirs', created_time: 1500000000, private: false, duration: 60,
      'owner.id': 'fan123', 'owner.screenname': 'Collector' }] })
  }
  throw new Error('Test forbids unexpected network requests')
}
process.on('exit', () => console.log(JSON.stringify({ fixtureProviderCalls: totals })))
