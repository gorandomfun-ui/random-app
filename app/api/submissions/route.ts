import { Buffer } from 'node:buffer'

import { NextResponse, type NextRequest } from 'next/server'

import {
  SUBMISSION_FILE_LIMIT,
  SUBMISSION_STORAGE_LIMIT,
  SubmissionError,
  approveSubmission,
  createSubmission,
  getSubmissionUsage,
  listPendingSubmissions,
  rejectSubmission,
  type SubmissionPayload,
} from '@/lib/submissions'

export const runtime = 'nodejs'

function parseMetadata(raw: FormDataEntryValue | null): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== 'string') return undefined
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
  } catch {
    return undefined
  }
  return undefined
}

async function buildPayload(request: NextRequest): Promise<SubmissionPayload> {
  const contentType = request.headers.get('content-type') || ''
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData()
    const type = (form.get('type') || 'image') as SubmissionPayload['type']
    const email = String(form.get('email') || '')

    if (type === 'image') {
      const imageUrlRaw = form.get('imageUrl')
      const imageUrl = typeof imageUrlRaw === 'string' ? imageUrlRaw : undefined
      const fileEntry = form.get('imageFile')
      let imageFile: SubmissionPayload extends { type: 'image'; imageFile?: infer T } ? T : null
      imageFile = null as never
      if (fileEntry instanceof File && fileEntry.size > 0) {
        const size = fileEntry.size
        if (size > SUBMISSION_FILE_LIMIT) {
          throw new SubmissionError('file-too-large')
        }
        const buffer = Buffer.from(await fileEntry.arrayBuffer())
        imageFile = {
          base64: buffer.toString('base64'),
          mimeType: fileEntry.type || 'image/png',
          size,
          fileName: fileEntry.name,
        } as never
      }
      const keywordsRaw = form.get('imageKeywords')
      const keywords = typeof keywordsRaw === 'string'
        ? keywordsRaw
            .split(/[,\n]/)
            .map((entry) => entry.trim())
            .filter(Boolean)
        : []
      const firstNameRaw = form.get('firstName')
      const lastNameRaw = form.get('lastName')
      return {
        type: 'image',
        email,
        imageUrl,
        imageFile,
        firstName: typeof firstNameRaw === 'string' ? firstNameRaw : '',
        lastName: typeof lastNameRaw === 'string' ? lastNameRaw : '',
        keywords,
      }
    }

    if (type === 'text') {
      const text = String(form.get('text') || '')
      const textKind = (form.get('textKind') || 'joke') as 'joke' | 'quote' | 'fact'
      const languageRaw = form.get('language')
      const authorRaw = form.get('author')
      return {
        type: 'text',
        email,
        text,
        textKind,
        language: typeof languageRaw === 'string' ? languageRaw : undefined,
        author: typeof authorRaw === 'string' ? authorRaw : undefined,
      }
    }

    if (type === 'web') {
      const url = String(form.get('url') || '')
      const metadata = parseMetadata(form.get('metadata'))
      return {
        type: 'web',
        email,
        url,
        metadata: metadata as SubmissionPayload extends { type: 'web'; metadata?: infer M } ? M : undefined,
      }
    }

    const url = String(form.get('url') || '')
    const metadata = parseMetadata(form.get('metadata')) as SubmissionPayload extends { type: 'video'; metadata?: infer V } ? V : undefined
    return {
      type: 'video',
      email,
      url,
      metadata,
    }
  }

  const data = (await request.json()) as SubmissionPayload
  if (data.type === 'image' && !Array.isArray(data.keywords)) {
    data.keywords = []
  }
  return data
}

function isAdmin(request: NextRequest): boolean {
  const headerKey = request.headers.get('x-admin-key')
  const envKey = process.env.ADMIN_KEY
  return Boolean(envKey && headerKey && headerKey === envKey)
}

export async function GET(request: NextRequest) {
  if (isAdmin(request)) {
    try {
      const submissions = await listPendingSubmissions()
      const usage = await getSubmissionUsage()
      return NextResponse.json({
        submissions,
        usage,
        allowed: usage.remaining > 0,
        limit: SUBMISSION_STORAGE_LIMIT,
        fileLimit: SUBMISSION_FILE_LIMIT,
      })
    } catch (error) {
      console.error('[submissions-admin]', error)
      return NextResponse.json({ error: 'admin-fetch-failed' }, { status: 500 })
    }
  }

  const usage = await getSubmissionUsage()
  return NextResponse.json({
    usage,
    allowed: usage.remaining > 0,
    limit: SUBMISSION_STORAGE_LIMIT,
    fileLimit: SUBMISSION_FILE_LIMIT,
  })
}

export async function POST(request: NextRequest) {
  try {
    const payload = await buildPayload(request)
    const result = await createSubmission(payload)
    return NextResponse.json({ ok: true, id: result.id })
  } catch (error) {
    if (error instanceof SubmissionError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status })
    }
    console.error('[submission-post]', error)
    return NextResponse.json({ ok: false, error: 'unknown-error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const body = await request.json()
    const id = String(body?.id || '')
    const action = String(body?.action || '')
    if (!id || !action) return NextResponse.json({ error: 'invalid-request' }, { status: 400 })
    if (action === 'approve') {
      const textKind = body?.textKind as 'joke' | 'quote' | 'fact' | undefined
      const result = await approveSubmission(id, { textKind })
      return NextResponse.json({ ok: true, result })
    }
    if (action === 'reject') {
      await rejectSubmission(id)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: 'invalid-action' }, { status: 400 })
  } catch (error) {
    if (error instanceof SubmissionError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[submission-patch]', error)
    return NextResponse.json({ error: 'unknown-error' }, { status: 500 })
  }
}
