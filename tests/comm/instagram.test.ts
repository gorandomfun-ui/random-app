import test from 'node:test'
import assert from 'node:assert/strict'

import { igComment, igContainerStatus, igCreateCarousel, igCreateContainer, igPublish, igRefreshToken, IgError, type IgFetch } from '@/lib/comm/instagram'

const config = { token: 'tok-0123456789-0123456789', accountId: '17841400000000000' }

/** A pretend Instagram: records every call, answers what it is told to. */
function fakeApi(answers: Array<{ status?: number; body: unknown }>) {
  const calls: Array<{ url: string; method: string; fields: Record<string, string> }> = []
  const fetchImpl: IgFetch = async (url, init) => {
    const fields: Record<string, string> = {}
    if (init?.body instanceof URLSearchParams) for (const [k, v] of init.body.entries()) fields[k] = v
    calls.push({ url, method: init?.method ?? 'GET', fields })
    const answer = answers.shift() ?? { status: 500, body: { error: { message: 'no answer' } } }
    return new Response(JSON.stringify(answer.body), { status: answer.status ?? 200, headers: { 'content-type': 'application/json' } })
  }
  return { fetchImpl, calls }
}

test('un conteneur d_image pour un post : l_adresse, la légende, jamais le jeton dans l_URL', async () => {
  const api = fakeApi([{ body: { id: 'c1' } }])
  const id = await igCreateContainer(api.fetchImpl, config, { kind: 'image', url: 'https://x.public.blob.vercel-storage.com/comm/a/b.jpg', format: 'post', caption: 'Salut' })
  assert.equal(id, 'c1')
  const call = api.calls[0]
  assert.equal(call.method, 'POST'); assert.ok(call.url.endsWith(`/${config.accountId}/media`)); assert.ok(!call.url.includes(config.token))
  assert.equal(call.fields.image_url, 'https://x.public.blob.vercel-storage.com/comm/a/b.jpg'); assert.equal(call.fields.caption, 'Salut'); assert.equal(call.fields.media_type, undefined); assert.equal(call.fields.access_token, config.token)
})

test('une story est STORIES, un reel est REELS, un enfant de carrousel n_a pas de légende', async () => {
  const api = fakeApi([{ body: { id: 's' } }, { body: { id: 'r' } }, { body: { id: 'k' } }, { body: { id: 'car' } }])
  await igCreateContainer(api.fetchImpl, config, { kind: 'video', url: 'https://x/v.mp4', format: 'story', caption: 'x' })
  assert.equal(api.calls[0].fields.media_type, 'STORIES'); assert.equal(api.calls[0].fields.video_url, 'https://x/v.mp4'); assert.equal(api.calls[0].fields.caption, undefined, 'une story n’a pas de légende')
  await igCreateContainer(api.fetchImpl, config, { kind: 'video', url: 'https://x/v.mp4', format: 'reel', caption: 'Légende' })
  assert.equal(api.calls[1].fields.media_type, 'REELS'); assert.equal(api.calls[1].fields.caption, 'Légende')
  await igCreateContainer(api.fetchImpl, config, { kind: 'image', url: 'https://x/i.jpg', format: 'carousel', caption: 'Légende', child: true })
  assert.equal(api.calls[2].fields.is_carousel_item, 'true'); assert.equal(api.calls[2].fields.caption, undefined)
  const carousel = await igCreateCarousel(api.fetchImpl, config, ['k', 'k2'], 'Légende')
  assert.equal(carousel, 'car'); assert.equal(api.calls[3].fields.media_type, 'CAROUSEL'); assert.equal(api.calls[3].fields.children, 'k,k2')
})

test('le statut, la publication, le commentaire, le renouvellement ; une erreur d_Instagram garde son message', async () => {
  const api = fakeApi([{ body: { status_code: 'IN_PROGRESS', status: 'Processing' } }, { body: { id: 'media9' } }, { body: { id: 'cm' } }, { body: { access_token: 'new-token', expires_in: 5184000 } }, { status: 400, body: { error: { message: 'Media ID is not available', code: 9007, error_user_msg: 'Le média n’est pas prêt' } } }])
  assert.deepEqual(await igContainerStatus(api.fetchImpl, config, 'c1'), { status: 'IN_PROGRESS', detail: 'Processing' })
  assert.equal(await igPublish(api.fetchImpl, config, 'c1'), 'media9'); assert.equal(api.calls[1].fields.creation_id, 'c1')
  assert.equal(await igComment(api.fetchImpl, config, 'media9', 'Source : https://youtu.be/x'), true); assert.equal(api.calls[2].fields.message, 'Source : https://youtu.be/x')
  const refreshed = await igRefreshToken(api.fetchImpl, config.token)
  assert.equal(refreshed.access_token, 'new-token'); assert.ok(api.calls[3].url.includes('grant_type=ig_refresh_token'))
  await assert.rejects(() => igPublish(api.fetchImpl, config, 'c1'), (error: unknown) => error instanceof IgError && error.message === 'Le média n’est pas prêt' && error.code === 9007)
})
