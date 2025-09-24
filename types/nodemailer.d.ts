declare module 'nodemailer' {
  export interface SendMailOptions {
    from?: string
    to?: string
    subject?: string
    text?: string
    html?: string
    cc?: string
    bcc?: string
    replyTo?: string
  }

  export interface SentMessageInfo {
    accepted: Array<string | number>
    rejected: Array<string | number>
    envelope?: Record<string, unknown>
    messageId?: string
    response?: string
    [key: string]: unknown
  }

  export interface TransportOptions {
    host?: string
    port?: number
    secure?: boolean
    auth?: {
      user?: string
      pass?: string
    }
    [key: string]: unknown
  }

  export interface Transporter {
    sendMail(mail: SendMailOptions): Promise<SentMessageInfo>
  }

  export function createTransport(options: TransportOptions | string): Transporter

  export interface NodemailerModule {
    createTransport(options: TransportOptions | string): Transporter
  }

  const nodemailer: NodemailerModule
  export default nodemailer
}
