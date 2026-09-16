/**
 * Turns the token estimate produced by the audit into a euro figure.
 *
 * Rates are Anthropic's published first-party API prices for
 * claude-haiku-4-5, halved for the Batch API. They are constants here on
 * purpose: a cost estimate must never be guessed from memory at runtime.
 */

export const HAIKU_INPUT_USD_PER_MTOK = 1
export const HAIKU_OUTPUT_USD_PER_MTOK = 5
export const BATCH_DISCOUNT = 0.5

export type CostEstimate = {
  inputUsd: number
  outputUsd: number
  totalUsd: number
  totalUsdBatch: number
}

export function estimateCost(inputTokens: number, outputTokens: number): CostEstimate {
  const inputUsd = (inputTokens / 1e6) * HAIKU_INPUT_USD_PER_MTOK
  const outputUsd = (outputTokens / 1e6) * HAIKU_OUTPUT_USD_PER_MTOK
  const totalUsd = inputUsd + outputUsd
  return {
    inputUsd,
    outputUsd,
    totalUsd,
    totalUsdBatch: totalUsd * BATCH_DISCOUNT,
  }
}
