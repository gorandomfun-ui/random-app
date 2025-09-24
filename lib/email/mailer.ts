import nodemailer from 'nodemailer'

export type MailPayload = {
  subject: string
  html: string
  text?: string
  to?: string
  from?: string
}

type TransportConfig = {
  transport: nodemailer.Transporter
  from: string
  to: string
}

function resolveBoolean(value: string | undefined, fallback = false) {
  if (value === undefined) return fallback
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

function buildTransport(): TransportConfig {
  const smtpUrl = process.env.SMTP_URL
  const to = (process.env.REPORT_EMAIL_TO || 'gorandomfun@gmail.com').trim()
  const from = (process.env.REPORT_EMAIL_FROM || process.env.SMTP_USER || '').trim()

  if (!to) throw new Error('Missing REPORT_EMAIL_TO or Gmail destination')
  if (!from) throw new Error('Missing REPORT_EMAIL_FROM (or SMTP_USER) for sender address')

  if (smtpUrl) {
    return { transport: nodemailer.createTransport(smtpUrl), from, to }
  }

  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT || 465)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  const secure = resolveBoolean(process.env.SMTP_SECURE, port === 465)

  if (!host || !user || !pass) {
    throw new Error('Missing SMTP_HOST / SMTP_USER / SMTP_PASS environment variables')
  }

  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  })

  return { transport, from, to }
}

export async function sendMail(payload: MailPayload) {
  const { transport, from, to } = buildTransport()
  const message = {
    from: payload.from || from,
    to: payload.to || to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text || payload.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
  }

  return transport.sendMail(message)
}
