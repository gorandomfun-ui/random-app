import ComposeClient from './ComposeClient'

/** Steps 2 and 3: where, then what format; the draft is born at the end of step 3. */
export default async function ComposePage(props: { searchParams: Promise<{ items?: string; post?: string }> }) {
  const searchParams = await props.searchParams
  const items = (searchParams.items ?? '').split(',').filter((id) => /^[a-f\d]{24}$/i.test(id))
  const post = /^[a-f\d]{24}$/i.test(searchParams.post ?? '') ? searchParams.post! : null
  return <ComposeClient itemIds={items} postId={post} />
}
