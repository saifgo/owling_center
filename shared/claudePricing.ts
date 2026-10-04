/**
 * Published Claude API list rates, USD per million tokens.
 * Cache writes default to the 5-minute tier when a transcript does not split them.
 * Source: https://platform.claude.com/docs/en/about-claude/pricing
 */

export interface ClaudeModelRates {
  input: number
  output: number
  cacheRead: number
  cacheWrite5m: number
  cacheWrite1h: number
}

const RATES: ReadonlyArray<{ match: RegExp; rates: ClaudeModelRates }> = [
  { match: /fable[-_. ]?5[-_. ]?1/, rates: { input: 10, output: 50, cacheRead: 0.25, cacheWrite5m: 12.5, cacheWrite1h: 20 } },
  { match: /mythos[-_. ]?5[-_. ]?1/, rates: { input: 10, output: 50, cacheRead: 0.25, cacheWrite5m: 12.5, cacheWrite1h: 20 } },
  { match: /fable[-_. ]?5(?![-_. ]?\d)/, rates: { input: 10, output: 50, cacheRead: 1, cacheWrite5m: 12.5, cacheWrite1h: 20 } },
  { match: /mythos[-_. ]?5(?![-_. ]?\d)/, rates: { input: 10, output: 50, cacheRead: 1, cacheWrite5m: 12.5, cacheWrite1h: 20 } },
  { match: /opus[-_. ]?5[-_. ]?5/, rates: { input: 4, output: 20, cacheRead: 0.2, cacheWrite5m: 5, cacheWrite1h: 8 } },
  { match: /opus[-_. ]?5(?![-_. ]?\d)/, rates: { input: 5, output: 25, cacheRead: 0.5, cacheWrite5m: 6.25, cacheWrite1h: 10 } },
  { match: /opus[-_. ]?4[-_. ]?8/, rates: { input: 5, output: 25, cacheRead: 0.5, cacheWrite5m: 6.25, cacheWrite1h: 10 } },
  { match: /opus[-_. ]?4[-_. ]?7/, rates: { input: 5, output: 25, cacheRead: 0.5, cacheWrite5m: 6.25, cacheWrite1h: 10 } },
  { match: /opus[-_. ]?4[-_. ]?6/, rates: { input: 5, output: 25, cacheRead: 0.5, cacheWrite5m: 6.25, cacheWrite1h: 10 } },
  { match: /opus[-_. ]?4[-_. ]?5/, rates: { input: 5, output: 25, cacheRead: 0.5, cacheWrite5m: 6.25, cacheWrite1h: 10 } },
  { match: /opus[-_. ]?4[-_. ]?1/, rates: { input: 15, output: 75, cacheRead: 1.5, cacheWrite5m: 18.75, cacheWrite1h: 30 } },
  { match: /opus[-_. ]?4(?![-_. ]?\d)/, rates: { input: 15, output: 75, cacheRead: 1.5, cacheWrite5m: 18.75, cacheWrite1h: 30 } },
  { match: /sonnet[-_. ]?5[-_. ]?5/, rates: { input: 2, output: 10, cacheRead: 0.2, cacheWrite5m: 2.5, cacheWrite1h: 4 } },
  { match: /sonnet[-_. ]?5(?![-_. ]?\d)/, rates: { input: 2, output: 10, cacheRead: 0.2, cacheWrite5m: 2.5, cacheWrite1h: 4 } },
  { match: /sonnet[-_. ]?4[-_. ]?6/, rates: { input: 3, output: 15, cacheRead: 0.3, cacheWrite5m: 3.75, cacheWrite1h: 6 } },
  { match: /sonnet[-_. ]?4[-_. ]?5/, rates: { input: 3, output: 15, cacheRead: 0.3, cacheWrite5m: 3.75, cacheWrite1h: 6 } },
  { match: /sonnet[-_. ]?4(?![-_. ]?\d)/, rates: { input: 3, output: 15, cacheRead: 0.3, cacheWrite5m: 3.75, cacheWrite1h: 6 } },
  { match: /haiku[-_. ]?4[-_. ]?5/, rates: { input: 1, output: 5, cacheRead: 0.1, cacheWrite5m: 1.25, cacheWrite1h: 2 } },
  { match: /haiku[-_. ]?3[-_. ]?5/, rates: { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite5m: 1, cacheWrite1h: 1.6 } }
]

export function ratesForModel(model: string): ClaudeModelRates | null {
  const normalized = model.toLowerCase()
  for (const entry of RATES) {
    if (entry.match.test(normalized)) return entry.rates
  }
  return null
}

export interface PricedTokens {
  uncachedInput: number
  cachedInput: number
  cacheWrite5m: number
  cacheWrite1h: number
  output: number
}

const MILLION = 1_000_000

export function costUsd(tokens: PricedTokens, rates: ClaudeModelRates): number {
  return (
    (tokens.uncachedInput * rates.input +
      tokens.cachedInput * rates.cacheRead +
      tokens.cacheWrite5m * rates.cacheWrite5m +
      tokens.cacheWrite1h * rates.cacheWrite1h +
      tokens.output * rates.output) /
    MILLION
  )
}

/** What cached input would have cost at the base input rate, minus what it cost. */
export function cacheSavingsUsd(cachedInput: number, rates: ClaudeModelRates): number {
  return (cachedInput * (rates.input - rates.cacheRead)) / MILLION
}
