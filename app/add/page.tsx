/* eslint-disable @next/next/no-img-element */
'use client'

import clsx from 'clsx'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

import HeartIcon from '@/components/HeartIcon'
import LogoAnimated from '@/components/LogoAnimated'
import MonoIcon from '@/components/MonoIcon'
import { THEMES } from '@/lib/theme'
import { useI18n } from '@/providers/I18nProvider'

type Lang = 'en' | 'fr' | 'de' | 'jp'
type SubmissionKind = 'image' | 'text' | 'web' | 'video'

const FILE_LIMIT_BYTES = 1_048_576

function BurgerIcon({ color, glitch = false }: { color: string; glitch?: boolean }) {
  return (
    <span className={`inline-flex h-5 w-7 flex-col justify-between burger-icon${glitch ? ' burger-icon--glitch' : ''}`} aria-hidden>
      <span className="burger-line block h-[3px]" style={{ backgroundColor: color, color }} />
      <span className="burger-line block h-[3px]" style={{ backgroundColor: color, color }} />
      <span className="burger-line block h-[3px]" style={{ backgroundColor: color, color }} />
    </span>
  )
}

function isValidUrl(value: string): boolean {
  if (!value) return false
  try {
    const parsed = new URL(value)
    return Boolean(parsed.protocol === 'http:' || parsed.protocol === 'https:')
  } catch {
    return false
  }
}

type LinkPreviewState = {
  loading: boolean
  data: {
    title?: string | null
    description?: string | null
    image?: string | null
    siteName?: string | null
    videoId?: string | null
    provider?: string | null
    canEmbed?: boolean | null
  } | null
  error: string | null
}

type UsageState = {
  allowed: boolean
  remainingBytes: number
  limitBytes: number
  fileLimitBytes: number
}

const TYPE_OPTIONS: Array<{ key: SubmissionKind; icon: string }> = [
  { key: 'image', icon: '/icons/image.svg' },
  { key: 'text', icon: '/icons/quote.svg' },
  { key: 'web', icon: '/icons/web.svg' },
  { key: 'video', icon: '/icons/Video.svg' },
]

export default function AddPage() {
  const { t, locale, locales, setLocale } = useI18n()

  const [themeIdx, setThemeIdx] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [languagesOpen, setLanguagesOpen] = useState(false)
  const [burgerGlitch, setBurgerGlitch] = useState(false)
  const burgerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [selectedType, setSelectedType] = useState<SubmissionKind>('image')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imageFilePreview, setImageFilePreview] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [imageKeywords, setImageKeywords] = useState('')
  const [textKind, setTextKind] = useState<'joke' | 'quote' | 'fact'>('joke')
  const [textValue, setTextValue] = useState('')
  const [quoteAuthor, setQuoteAuthor] = useState('')
  const [webUrl, setWebUrl] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [email, setEmail] = useState('')
  const [preview, setPreview] = useState<LinkPreviewState>({ loading: false, data: null, error: null })
  const [usage, setUsage] = useState<UsageState | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; code?: string; text: string } | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)

  const triggerBurgerGlitch = useCallback(() => {
    setBurgerGlitch(true)
    if (burgerTimeoutRef.current) clearTimeout(burgerTimeoutRef.current)
    burgerTimeoutRef.current = setTimeout(() => setBurgerGlitch(false), 360)
  }, [])

  useEffect(() => () => {
    if (burgerTimeoutRef.current) clearTimeout(burgerTimeoutRef.current)
    if (imageFilePreview) URL.revokeObjectURL(imageFilePreview)
  }, [imageFilePreview])

  useEffect(() => {
    try {
      const base = Number(localStorage.getItem('themeIdx') || 0)
      const finalIdx = isFinite(base) ? Math.abs(Math.floor(base)) % THEMES.length : 0
      setThemeIdx(finalIdx)
    } catch {
      setThemeIdx(0)
    }
  }, [])

  const applyLangOut = useCallback((next: Lang) => {
    try {
      document.documentElement.setAttribute('lang', next)
      const globalWindow = window as Window & { __APP_LANG?: Lang }
      globalWindow.__APP_LANG = next
      const maxAge = 60 * 60 * 24 * 365
      document.cookie = `lang=${next}; path=/; max-age=${maxAge}`
      globalWindow.dispatchEvent(new CustomEvent('i18n:changed', { detail: next }))
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) setLanguagesOpen(false)
  }, [menuOpen])

  const theme = useMemo(() => THEMES[themeIdx], [themeIdx])
  type ThemeStyle = CSSProperties & { ['--theme-cream']?: string }
  const mainStyle = useMemo<ThemeStyle>(() => ({
    background: theme.bg,
    color: theme.cream,
    '--theme-cream': theme.cream,
  }), [theme.bg, theme.cream])

  const langs = (Array.isArray(locales) && locales.length ? locales : ['en', 'fr', 'de', 'jp']) as Lang[]

  const bannerText = t('add.banner', 'Add the content you')
  const tabLabels = {
    image: t('add.tabs.image', 'Image'),
    text: t('add.tabs.text', 'Jokes · Quotes · Facts'),
    web: t('add.tabs.web', 'Web'),
    video: t('add.tabs.video', 'Videos'),
  }

  const textKindLabels = {
    joke: t('add.text.options.joke', 'Joke'),
    quote: t('add.text.options.quote', 'Quote'),
    fact: t('add.text.options.fact', 'Fact'),
  }

  const imageFirstNameLabel = t('add.image.firstName', 'First name')
  const imageLastNameLabel = t('add.image.lastName', 'Last name')
  const quoteAuthorLabel = t('add.text.authorLabel', 'Who said it?')
  const quoteAuthorPlaceholder = t('add.text.authorPlaceholder', 'Author')

  const fetchUsage = useCallback(async () => {
    try {
      const res = await fetch('/api/submissions', { method: 'GET' })
      if (!res.ok) throw new Error('usage')
      const json = (await res.json()) as { allowed: boolean; usage: { remaining: number; limit: number }; fileLimit: number }
      setUsage({
        allowed: json.allowed,
        remainingBytes: json.usage?.remaining ?? 0,
        limitBytes: json.usage?.limit ?? 0,
        fileLimitBytes: json.fileLimit ?? FILE_LIMIT_BYTES,
      })
    } catch {
      setUsage(null)
    }
  }, [])

  useEffect(() => {
    fetchUsage().catch(() => undefined)
  }, [fetchUsage])

  const activeUrl = selectedType === 'web' ? webUrl : selectedType === 'video' ? videoUrl : ''

  useEffect(() => {
    if (selectedType !== 'web' && selectedType !== 'video') {
      setPreview({ loading: false, data: null, error: null })
      return
    }
    if (!isValidUrl(activeUrl)) {
      setPreview({ loading: false, data: null, error: null })
      return
    }
    const controller = new AbortController()
    setPreview((prev) => ({ ...prev, loading: true, error: null }))
    const handle = setTimeout(() => {
      fetch(`/api/submissions/preview?url=${encodeURIComponent(activeUrl)}&type=${selectedType}`, { signal: controller.signal })
        .then(async (res) => {
          if (!res.ok) throw new Error('preview')
          const json = (await res.json()) as { metadata: LinkPreviewState['data'] }
          setPreview({ loading: false, data: json.metadata ?? null, error: null })
        })
        .catch(() => {
          setPreview({ loading: false, data: null, error: 'preview-failed' })
        })
    }, 450)
    return () => {
      controller.abort()
      clearTimeout(handle)
    }
  }, [activeUrl, selectedType])

  const handleFileChange = useCallback((file: File | null) => {
    if (imageFilePreview) {
      URL.revokeObjectURL(imageFilePreview)
      setImageFilePreview(null)
    }
    if (!file) {
      setImageFile(null)
      setFileError(null)
      return
    }
    if (file.size > FILE_LIMIT_BYTES) {
      setFileError('file-too-large')
      setImageFile(null)
      return
    }
    if (!file.type.startsWith('image/')) {
      setFileError('invalid-image')
      setImageFile(null)
      return
    }
    setFileError(null)
    setImageFile(file)
    setImageFilePreview(URL.createObjectURL(file))
  }, [imageFilePreview])

  const onDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (!event.dataTransfer.files?.length) return
    const file = event.dataTransfer.files[0]
    handleFileChange(file)
  }, [handleFileChange])

  const onFileInput = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const [file] = event.target.files ?? []
    handleFileChange(file ?? null)
  }, [handleFileChange])

  const handleSubmit = useCallback(async () => {
    if (submitting) return
    if (!email.trim()) {
      setMessage({ type: 'error', code: 'email-required', text: t('add.email.required', 'Email is required to submit.') })
      return
    }
    if (!usage?.allowed) {
      setMessage({ type: 'error', code: 'storage-full', text: t('add.storageFull', 'Submissions are full for now. Try again later.') })
      return
    }

    const form = new FormData()
    form.set('type', selectedType)
    form.set('email', email.trim())

    if (selectedType === 'image') {
      if (imageUrl.trim()) form.set('imageUrl', imageUrl.trim())
      if (imageFile) form.set('imageFile', imageFile)
      form.set('firstName', firstName.trim())
      form.set('lastName', lastName.trim())
      if (!firstName.trim() || !lastName.trim()) {
        setMessage({ type: 'error', code: 'missing-contributor', text: t('add.errors.missingContributor', 'Please tell us who captured this image.') })
        return
      }
      const keywordList = imageKeywords
        .split(/[,\n]/)
        .map((entry) => entry.trim())
        .filter(Boolean)
      if (keywordList.length < 4 || keywordList.length > 6) {
        setMessage({ type: 'error', code: 'missing-keywords', text: t('add.errors.missingKeywords', 'Please add 4–5 keywords for your image.') })
        return
      }
      form.set('imageKeywords', keywordList.join(','))
      if (!imageFile && !imageUrl.trim()) {
        setMessage({ type: 'error', code: 'missing-image', text: t('add.errors.imageRequired', 'Please upload or link to an image.') })
        return
      }
    } else if (selectedType === 'text') {
      if (!textValue.trim()) {
        setMessage({ type: 'error', code: 'missing-text', text: t('add.errors.textRequired', 'Share something before submitting.') })
        return
      }
      form.set('text', textValue.trim())
      form.set('textKind', textKind)
      if (textKind === 'quote') {
        if (!quoteAuthor.trim()) {
          setMessage({ type: 'error', code: 'missing-author', text: t('add.errors.missingAuthor', 'Please share who said this quote.') })
          return
        }
        form.set('author', quoteAuthor.trim())
      }
      if (quoteAuthor.trim()) form.set('author', quoteAuthor.trim())
    } else {
      const urlToUse = selectedType === 'web' ? webUrl.trim() : videoUrl.trim()
      if (!isValidUrl(urlToUse)) {
        setMessage({ type: 'error', code: 'missing-url', text: t('add.errors.urlRequired', 'Please share a valid URL.') })
        return
      }
      form.set('url', urlToUse)
      if (preview.data) form.set('metadata', JSON.stringify(preview.data))
    }

    setSubmitting(true)
    setMessage(null)

    try {
      const response = await fetch('/api/submissions', { method: 'POST', body: form })
      if (!response.ok) {
        const json = await response.json().catch(() => ({}))
        const code = typeof json?.error === 'string' ? json.error : 'unknown-error'
        setMessage({ type: 'error', code, text: translateError(code, t) })
      } else {
        setMessage({ type: 'success', text: t('add.success', 'Thanks! We will review your submission soon.') })
        setImageFile(null)
        if (imageFilePreview) URL.revokeObjectURL(imageFilePreview)
        setImageFilePreview(null)
        setImageUrl('')
        setFirstName('')
        setLastName('')
        setImageKeywords('')
        setTextValue('')
        setQuoteAuthor('')
        setWebUrl('')
        setVideoUrl('')
        setPreview({ loading: false, data: null, error: null })
        fetchUsage().catch(() => undefined)
      }
    } catch (error) {
      console.error('[submit-add]', error)
      setMessage({ type: 'error', code: 'network', text: t('add.error', 'Unable to submit right now. Please try again.') })
    } finally {
      setSubmitting(false)
    }
  }, [email, fetchUsage, firstName, imageFile, imageFilePreview, imageKeywords, imageUrl, lastName, preview.data, quoteAuthor, selectedType, submitting, t, textKind, textValue, usage?.allowed, videoUrl, webUrl])


  return (
    <main className="min-h-screen pb-12" style={mainStyle}>
      <header className="px-6 pt-4 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Menu"
            onClick={() => {
              triggerBurgerGlitch()
              setMenuOpen(true)
            }}
            className="flex items-center"
          >
            <BurgerIcon color={theme.text} glitch={burgerGlitch} />
          </button>
        </div>

        <LogoAnimated
          trigger={1}
          toSecond={false}
          vhMobile={8}
          vhDesktop={8}
          gapMobile={4}
          gapDesktop={4}
        />

        <div style={{ width: 28, height: 28 }} />
      </header>

      <div className="px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          <div
            className="flex items-center justify-center gap-2 px-4 py-3 text-center text-xl sm:text-2xl"
            style={{
              backgroundColor: '#f1ead5',
              color: '#191916',
              fontFamily: "var(--font-inter-tight), 'Inter Tight', sans-serif",
              fontWeight: 500,
            }}
          >
            <span>{bannerText}</span>
            <HeartIcon color={theme.text} size={26} />
          </div>

          <p className="text-sm font-inter opacity-80">{t('add.pendingNote', 'Every submission is curated by humans. Thanks for your patience!')}</p>

          <div className="grid grid-cols-2 gap-3">
            {TYPE_OPTIONS.map(({ key, icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedType(key)}
                className={clsx(
                  'flex items-center justify-center gap-2 rounded-3xl px-4 py-3 text-base font-semibold transition border border-white/10',
                  selectedType === key ? 'shadow-lg' : 'bg-white/10 text-white/70 hover:bg-white/20',
                )}
                style={{
                  backgroundColor: selectedType === key ? theme.text : undefined,
                  color: selectedType === key ? theme.cream : undefined,
                  fontFamily: "var(--font-inter-tight), 'Inter Tight', sans-serif",
                }}
              >
                <MonoIcon src={icon} color={selectedType === key ? theme.bg : theme.cream} size={20} />
                <span>{tabLabels[key]}</span>
              </button>
            ))}
          </div>

          {selectedType === 'image' && (
            <section className="space-y-4">
              <div
                className="flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-white/30 bg-white/5 p-6 text-center transition hover:border-white/60"
                onDragOver={(event) => event.preventDefault()}
                onDrop={onDrop}
              >
                <MonoIcon src="/icons/plus.svg" color={theme.cream} size={28} />
                <p className="mt-2 font-semibold">{t('add.image.uploadLabel', 'Drop or upload an image')}</p>
                <p className="mt-1 text-xs opacity-70">{t('add.image.limit', 'Max 1 MB. PNG, JPG, GIF accepted.')}</p>
                <input type="file" accept="image/*" className="sr-only" id="image-upload" onChange={onFileInput} />
                <label htmlFor="image-upload" className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20">
                  {t('add.image.select', 'Choose a file')}
                </label>
              </div>

              {imageFilePreview ? (
                <div className="overflow-hidden rounded-3xl border border-white/10">
                  <img src={imageFilePreview} alt={t('add.image.previewAlt', 'Selected image preview')} className="h-auto w-full" />
                  <div className="flex items-center justify-between px-4 py-2 text-xs text-white/70">
                    <span>{imageFile?.name}</span>
                    <button type="button" onClick={() => handleFileChange(null)} className="underline">
                      {t('add.image.remove', 'Remove file')}
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                <label className="text-sm font-semibold" htmlFor="image-url">
                  {t('add.image.urlLabel', 'Or paste an image URL')}
                </label>
                <input
                  id="image-url"
                  type="url"
                  value={imageUrl}
                  onChange={(event) => setImageUrl(event.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-3xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white placeholder-white/40 focus:border-white"
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-sm font-semibold" htmlFor="image-first-name">
                    {imageFirstNameLabel}
                  </label>
                  <input
                    id="image-first-name"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    placeholder={imageFirstNameLabel}
                    className="w-full rounded-3xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white placeholder-white/40 focus:border-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold" htmlFor="image-last-name">
                    {imageLastNameLabel}
                  </label>
                  <input
                    id="image-last-name"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    placeholder={imageLastNameLabel}
                    className="w-full rounded-3xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white placeholder-white/40 focus:border-white"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold" htmlFor="image-keywords">
                  {t('add.image.keywordsLabel', 'Image keywords')}
                </label>
                <textarea
                  id="image-keywords"
                  value={imageKeywords}
                  onChange={(event) => setImageKeywords(event.target.value)}
                  rows={2}
                  placeholder={t('add.image.keywordsHint', 'Add 4–5 keywords separated by commas (portrait, street, night...)')}
                  className="w-full rounded-3xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white placeholder-white/40 focus:border-white"
                />
              </div>

              {fileError === 'file-too-large' && (
                <p className="text-sm text-red-300">{t('add.fileTooLarge', 'The selected image is larger than 1 MB.')}</p>
              )}
              {fileError === 'invalid-image' && (
                <p className="text-sm text-red-300">{t('add.errors.invalidImage', 'Please choose an image file.')}</p>
              )}
            </section>
          )}

          {selectedType === 'text' && (
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                {(['joke', 'quote', 'fact'] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setTextKind(kind)}
                    className={clsx(
                      'rounded-full px-4 py-2 text-sm font-semibold transition',
                      textKind === kind ? 'bg-white text-black' : 'bg-white/10 text-white/70 hover:bg-white/20',
                    )}
                  >
                    {textKindLabels[kind]}
                  </button>
                ))}
              </div>

              <textarea
                value={textValue}
                onChange={(event) => setTextValue(event.target.value)}
                rows={6}
                placeholder={t('add.text.placeholder', 'Write your best joke, quote or fact...')}
                className="w-full rounded-3xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white placeholder-white/40 focus:border-white"
              />

              {textKind === 'quote' ? (
                <div className="space-y-2">
                  <label className="text-sm font-semibold" htmlFor="quote-author">
                    {quoteAuthorLabel}
                  </label>
                  <input
                    id="quote-author"
                    value={quoteAuthor}
                    onChange={(event) => setQuoteAuthor(event.target.value)}
                    placeholder={quoteAuthorPlaceholder}
                    className="w-full rounded-3xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white placeholder-white/40 focus:border-white"
                  />
                </div>
              ) : null}
            </section>
          )}

          {selectedType === 'web' && (
            <section className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold" htmlFor="web-url">
                  {t('add.web.urlLabel', 'Website URL')}
                </label>
                <input
                  id="web-url"
                  type="url"
                  value={webUrl}
                  onChange={(event) => setWebUrl(event.target.value)}
                  placeholder="https://"
                  className="w-full rounded-3xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white placeholder-white/40 focus:border-white"
                />
              </div>
              <PreviewCard preview={preview} t={t} />
            </section>
          )}

          {selectedType === 'video' && (
            <section className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold" htmlFor="video-url">
                  {t('add.video.urlLabel', 'Video URL')}
                </label>
                <input
                  id="video-url"
                  type="url"
                  value={videoUrl}
                  onChange={(event) => setVideoUrl(event.target.value)}
                  placeholder="https://youtube.com/..."
                  className="w-full rounded-3xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white placeholder-white/40 focus:border-white"
                />
                <p className="text-xs opacity-70">{t('add.video.disclaimer', 'We host only links, not video files. Share a platform URL.')}</p>
              </div>
              <PreviewCard preview={preview} t={t} />
              {preview.data && preview.data.canEmbed === false ? (
                <p className="text-xs text-yellow-200">
                  {t('add.video.embedWarning', 'This link may not allow embedding. We will double-check manually.')}
                </p>
              ) : null}
            </section>
          )}

          <section className="space-y-2">
            <label className="text-sm font-semibold" htmlFor="email-input">
              {t('add.email.label', 'Your email (required)')}
            </label>
            <input
              id="email-input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t('add.email.placeholder', 'you@example.com')}
              className="w-full rounded-3xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white placeholder-white/40 focus:border-white"
            />
          </section>

          {message && (
            <div
              className={clsx(
                'rounded-3xl px-4 py-3 text-sm font-inter',
                message.type === 'success' ? 'bg-emerald-500/20 text-emerald-100' : 'bg-rose-500/20 text-rose-100',
              )}
            >
              {message.text}
            </div>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || usage?.allowed === false}
            className={clsx(
              'mt-2 w-full rounded-3xl px-6 py-3 text-lg font-bold uppercase tracking-wide transition',
              usage?.allowed === false ? 'bg-white/10 text-white/40' : '',
            )}
            style={{
              backgroundColor: usage?.allowed === false ? undefined : theme.text,
              color: usage?.allowed === false ? undefined : theme.cream,
              fontFamily: "var(--font-tomorrow), 'Tomorrow', sans-serif",
              fontWeight: 700,
            }}
          >
            {submitting ? t('add.submitting', 'Sending...') : t('add.submit', 'Send content')}
          </button>
        </div>
      </div>

      {menuOpen ? (
        <MenuOverlay
          close={() => setMenuOpen(false)}
          languagesOpen={languagesOpen}
          setLanguagesOpen={setLanguagesOpen}
          langs={langs}
          locale={locale as Lang | null}
          setLocale={setLocale}
          applyLangOut={applyLangOut}
          theme={theme}
          t={t}
        />
      ) : null}

      <style jsx global>{`
        .burger-icon {
          position: relative;
        }
        .burger-icon .burger-line {
          width: 100%;
          border-radius: 9999px;
          transition: transform 140ms ease, opacity 140ms ease;
        }
        .burger-icon--glitch .burger-line {
          animation: burger-glitch 360ms cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
        .burger-icon--glitch .burger-line:nth-child(2) {
          animation-delay: 40ms;
        }
        .burger-icon--glitch .burger-line:nth-child(3) {
          animation-delay: 80ms;
        }
        @keyframes burger-glitch {
          0% {
            transform: translateX(0);
            opacity: 1;
          }
          40% {
            transform: translateX(3px);
            opacity: 0.6;
          }
          80% {
            transform: translateX(-3px);
            opacity: 0.8;
          }
          100% {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </main>
  )
}

type PreviewProps = {
  preview: LinkPreviewState
  t: ReturnType<typeof useI18n>['t']
}

function PreviewCard({ preview, t }: PreviewProps) {
  if (!preview.loading && !preview.data && !preview.error) return null
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
      {preview.loading ? (
        <p className="text-sm opacity-70">{t('add.analyzing', 'Analyzing…')}</p>
      ) : preview.error ? (
        <p className="text-sm text-yellow-200">{t('add.analyzeError', 'Could not analyze this link yet. You can still submit it.')}</p>
      ) : preview.data ? (
        <div className="space-y-2 text-sm">
          {preview.data.image ? (
            <img src={preview.data.image} alt={preview.data.title ?? 'preview'} className="max-h-48 w-full rounded-2xl object-cover" />
          ) : null}
          {preview.data.title ? <p className="font-semibold">{preview.data.title}</p> : null}
          {preview.data.description ? <p className="opacity-70">{preview.data.description}</p> : null}
          {(preview.data.provider || preview.data.siteName) && (
            <p className="text-xs opacity-60">{preview.data.provider || preview.data.siteName}</p>
          )}
        </div>
      ) : null}
    </div>
  )
}

type MenuOverlayProps = {
  close: () => void
  languagesOpen: boolean
  setLanguagesOpen: (value: boolean) => void
  langs: Lang[]
  locale: Lang | null
  setLocale: (value: Lang) => void
  applyLangOut: (lang: Lang) => void
  theme: (typeof THEMES)[number]
  t: ReturnType<typeof useI18n>['t']
}

function MenuOverlay({ close, languagesOpen, setLanguagesOpen, langs, locale, setLocale, applyLangOut, theme, t }: MenuOverlayProps) {
  const languageLabel = t('language.title', 'Language')
  const legalLabel = t('legal.title', 'Legal notice')
  const likesLabel = t('likes.title', 'Likes')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}>
      <div className="absolute inset-0" onClick={close} />
      <div
        className="relative w-[min(360px,92vw)] rounded-3xl px-6 pt-4 pb-6 shadow-2xl"
        style={{
          backgroundColor: theme.text,
          color: theme.cream,
          fontFamily: 'var(--font-inter-tight), sans-serif',
        }}
      >
        <div className="flex items-center justify-end">
          <button type="button" aria-label="Close" onClick={close} className="text-2xl" style={{ color: theme.cream }}>
            ×
          </button>
        </div>

        <nav className="mt-4 flex flex-col text-lg font-semibold uppercase" style={{ gap: '10px' }}>
          <Link href="/" onClick={close} className="flex items-center" style={{ color: theme.cream }}>
            Home
          </Link>
          <Link href="/random" onClick={close} className="flex items-center" style={{ color: theme.cream }}>
            Random
          </Link>
          <Link href="/likes" onClick={close} className="flex items-center gap-2" style={{ color: theme.cream }}>
            <span>{likesLabel}</span>
            <MonoIcon src="/icons/Heart.svg" color={theme.cream} size={18} />
          </Link>

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => setLanguagesOpen(!languagesOpen)}
              className="flex w-full items-center justify-between"
              style={{ color: theme.cream }}
            >
              <span className="uppercase">{languageLabel}</span>
              <span>{(locale || 'en').toUpperCase()}</span>
            </button>
            {languagesOpen ? (
              <ul className="space-y-2 text-base font-semibold">
                {langs.map((lang) => {
                  const active = (locale || 'en') === lang
                  return (
                    <li key={lang}>
                      <button
                        type="button"
                        onClick={() => {
                          setLocale(lang)
                          applyLangOut(lang)
                          setLanguagesOpen(false)
                          close()
                        }}
                        className="w-full rounded-xl px-3 py-2 text-left"
                        style={{
                          backgroundColor: active ? 'rgba(25,25,22,0.25)' : 'rgba(25,25,22,0.12)',
                          color: theme.cream,
                        }}
                      >
                        {lang.toUpperCase()}
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : null}
          </div>

          <Link href="/legal" onClick={close} className="text-lg font-semibold" style={{ color: theme.cream }}>
            {legalLabel}
          </Link>

          <Link href="/add" onClick={close} className="flex items-center gap-2" style={{ color: theme.cream }}>
            <span>{t('add.title', 'Add')}</span>
            <MonoIcon src="/icons/plus.svg" color={theme.cream} size={18} />
          </Link>
        </nav>
      </div>
    </div>
  )
}

function translateError(code: string, t: ReturnType<typeof useI18n>['t']): string {
  switch (code) {
    case 'file-too-large':
      return t('add.fileTooLarge', 'The selected image is larger than 1 MB.')
    case 'invalid-email':
      return t('add.email.required', 'Email is required to submit.')
    case 'missing-image':
      return t('add.errors.imageRequired', 'Please upload or link to an image.')
    case 'missing-contributor':
      return t('add.errors.missingContributor', 'Please tell us who captured this image.')
    case 'missing-text':
      return t('add.errors.textRequired', 'Share something before submitting.')
    case 'missing-author':
      return t('add.errors.missingAuthor', 'Please share who said this quote.')
    case 'missing-url':
      return t('add.errors.urlRequired', 'Please share a valid URL.')
    case 'missing-keywords':
      return t('add.errors.missingKeywords', 'Please add 4–5 keywords for your image.')
    case 'duplicate-url':
      return t('add.errors.duplicate', 'We already have this link in our queue.')
    case 'storage-full':
      return t('add.storageFull', 'Submissions are full for now. Try again later.')
    case 'storage-unavailable':
      return t('add.errors.storageUnavailable', 'Submissions are down right now. Please retry later.')
    case 'email-required':
      return t('add.email.required', 'Email is required to submit.')
    default:
      return t('add.error', 'Unable to submit right now. Please try again.')
  }
}
