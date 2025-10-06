import nodemailer from 'nodemailer'

const SMTP_HOST = process.env.SMTP_HOST
const SMTP_PORT = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined
const SMTP_USER = process.env.SMTP_USER
const SMTP_PASS = process.env.SMTP_PASS
const SMTP_FROM = process.env.SMTP_FROM || process.env.SMTP_USER

function canSend(): boolean {
  return Boolean(SMTP_HOST && SMTP_PORT && SMTP_FROM)
}

async function getTransport() {
  if (!canSend()) return null
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  })
  return transporter
}

export async function sendSubmissionAccepted(email: string, type: string, locale: string | undefined = 'en') {
  const subject = locale === 'fr' ? 'Votre contenu a été accepté' : locale === 'de' ? 'Dein Inhalt wurde angenommen' : locale === 'jp' ? '投稿が承認されました' : 'Your submission was approved'
  const body =
    locale === 'fr'
      ? `Merci ! Votre contenu (${type}) a été accepté et sera bientôt visible dans Random.`
      : locale === 'de'
        ? `Danke! Dein Beitrag (${type}) wurde angenommen und erscheint bald in Random.`
        : locale === 'jp'
          ? `ありがとうございます！あなたの投稿 (${type}) は承認され、まもなく Random に表示されます。`
          : `Thank you! Your ${type} submission has been approved and will appear in Random soon.`

  const transporter = await getTransport()
  if (!transporter) {
    console.info('[submission-email]', { email, subject, body })
    return
  }
  await transporter.sendMail({
    from: SMTP_FROM,
    to: email,
    subject,
    text: body,
  })
}
