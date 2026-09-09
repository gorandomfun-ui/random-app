'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { LikeItem } from '@/utils/likes'
import { decodeSavedContent, savedLikeContent } from '@/lib/likes/savedContent'

type Content = NonNullable<ReturnType<typeof decodeSavedContent>>
type View = {
  item: Content
  scroll: number
  tab: 'you' | 'we'
  ownedEntry: boolean
}

const HISTORY_KEY = 'randomSavedViewV1'

function verticalScroller(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  const candidates = [
    document.scrollingElement as HTMLElement | null,
    document.body,
    document.documentElement,
  ].filter((element, index, all): element is HTMLElement => (
    Boolean(element) && all.indexOf(element) === index
  ))
  const active = candidates.find((element) => element.scrollTop > 0)
  if (active) return active
  return candidates.reduce<HTMLElement | null>((best, element) => {
    if (!best) return element
    const range = element.scrollHeight - element.clientHeight
    const bestRange = best.scrollHeight - best.clientHeight
    return range > bestRange ? element : best
  }, null)
}

function pageScrollTop(): number {
  const values = [
    window.scrollY,
    document.body.scrollTop,
    document.documentElement.scrollTop,
    verticalScroller()?.scrollTop,
  ]
  return Math.max(0, ...values.filter((value): value is number => Number.isFinite(value)))
}

function scrollPageTo(top: number) {
  const scroller = verticalScroller()
  if (scroller) {
    scroller.scrollTop = top
    return
  }
  window.scrollTo(0, top)
}

export function useSavedLikeView(
  tab: 'you' | 'we',
  setTab: (tab: 'you' | 'we') => void,
) {
  const [view, setView] = useState<View | null>(null)
  const viewRef = useRef<View | null>(null)
  const focusedElementRef = useRef<HTMLElement | null>(null)
  const pendingRestoreRef = useRef<{ scroll: number; focused: HTMLElement | null } | null>(null)

  useEffect(() => {
    const restore = () => {
      const raw = history.state?.[HISTORY_KEY]
      const item = decodeSavedContent(raw?.item)

      if (item) {
        const next: View = {
          item,
          scroll:
            typeof raw.scroll === 'number' && Number.isFinite(raw.scroll)
              ? Math.max(0, raw.scroll)
              : 0,
          tab: raw.tab === 'we' ? 'we' : 'you',
          ownedEntry: raw.ownedEntry === true,
        }
        viewRef.current = next
        setView(next)
        setTab(next.tab)
        scrollPageTo(0)
        return
      }

      const previous = viewRef.current
      viewRef.current = null
      setView(null)
      if (previous) {
        pendingRestoreRef.current = {
          scroll: previous.scroll,
          focused: focusedElementRef.current,
        }
        setTab(previous.tab)
      }
    }

    restore()
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [setTab])

  useEffect(() => {
    if (view) return
    const pending = pendingRestoreRef.current
    if (!pending) return
    pendingRestoreRef.current = null

    const frame = requestAnimationFrame(() => {
      scrollPageTo(pending.scroll)
      pending.focused?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [view])

  const open = useCallback(
    (like: LikeItem) => {
      const item = savedLikeContent(like)
      if (!item) return

      focusedElementRef.current = document.activeElement as HTMLElement | null
      const next: View = {
        item,
        scroll: pageScrollTop(),
        tab,
        ownedEntry: true,
      }
      history.pushState({ ...history.state, [HISTORY_KEY]: next }, '', '#random-content')
      viewRef.current = next
      setView(next)
      scrollPageTo(0)
    },
    [tab],
  )

  const back = useCallback(() => {
    if (viewRef.current?.ownedEntry) {
      history.back()
      return
    }
    history.replaceState({ ...history.state, [HISTORY_KEY]: null }, '', '/likes')
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, [])

  return { view, open, back }
}
