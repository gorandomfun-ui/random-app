/** Redacted provider errors: never retain upstream URLs, keys or free-form response messages. */
export class ProviderQuotaError extends Error {
  constructor(readonly bucket: 'search' | 'other') { super('quota-exhausted'); this.name = 'ProviderQuotaError' }
}
export async function providerError(response: Response, provider: 'youtube' | 'dailymotion', bucket: 'search' | 'other'): Promise<Error> {
  if (provider === 'youtube' && response.status === 403) {
    try {
      const body = await response.json() as { error?: { errors?: { reason?: string }[] } }
      if (body.error?.errors?.some(e => ['quotaExceeded', 'dailyLimitExceeded'].includes(e.reason ?? ''))) return new ProviderQuotaError(bucket)
    } catch { /* An invalid response is an HTTP error, never inferred to be a quota error. */ }
  }
  return new Error(`${provider}-status-${response.status}`)
}
