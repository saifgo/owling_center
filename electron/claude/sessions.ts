import { createReadStream } from 'fs'
import { readdir } from 'fs/promises'
import { createInterface } from 'readline'
import { homedir } from 'os'
import path from 'path'
import { cacheSavingsUsd, costUsd, ratesForModel } from '../../shared/claudePricing'
import { bucketKeyFor, describeWindow, emptyTokenTotals, totalProcessed } from '../../shared/claudeUsage'
import type {
  ClaudeModelUsage,
  ClaudeTokenTotals,
  ClaudeUsageBucket,
  ClaudeUsageRange,
  ClaudeUsageSummary
} from '../../shared/types'

interface TokenAcc extends ClaudeTokenTotals {
  cacheWrite5m: number
  cacheWrite1h: number
}

function freshAcc(): TokenAcc {
  return { ...emptyTokenTotals(), cacheWrite5m: 0, cacheWrite1h: 0 }
}

function addTokens(target: TokenAcc, source: TokenAcc): void {
  target.uncachedInput += source.uncachedInput
  target.cachedInput += source.cachedInput
  target.cacheCreation += source.cacheCreation
  target.output += source.output
  target.cacheWrite5m += source.cacheWrite5m
  target.cacheWrite1h += source.cacheWrite1h
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

function readTokens(usage: Record<string, unknown>): TokenAcc {
  const tokens = freshAcc()
  tokens.uncachedInput = asNumber(usage.input_tokens)
  tokens.cachedInput = asNumber(usage.cache_read_input_tokens)
  tokens.output = asNumber(usage.output_tokens)

  const creation = usage.cache_creation
  const five =
    creation && typeof creation === 'object'
      ? asNumber((creation as Record<string, unknown>).ephemeral_5m_input_tokens)
      : 0
  const hour =
    creation && typeof creation === 'object'
      ? asNumber((creation as Record<string, unknown>).ephemeral_1h_input_tokens)
      : 0
  if (five > 0 || hour > 0) {
    tokens.cacheWrite5m = five
    tokens.cacheWrite1h = hour
    tokens.cacheCreation = five + hour
  } else {
    tokens.cacheWrite5m = asNumber(usage.cache_creation_input_tokens)
    tokens.cacheCreation = tokens.cacheWrite5m
  }
  return tokens
}

function timestampMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

interface Hit {
  model: string
  at: number
  tokens: TokenAcc
}

function readHit(record: unknown): Hit | null {
  if (!record || typeof record !== 'object') return null
  const row = record as Record<string, unknown>
  if (row.type !== 'assistant') return null
  const message = row.message
  if (!message || typeof message !== 'object') return null
  const body = message as Record<string, unknown>
  const usage = body.usage
  if (!usage || typeof usage !== 'object') return null
  const tokens = readTokens(usage as Record<string, unknown>)
  if (totalProcessed(tokens) <= 0) return null
  const at = timestampMs(row.timestamp)
  if (at === null) return null
  const model = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : 'unknown'
  return { model, at, tokens }
}

async function listJsonl(dir: string): Promise<string[]> {
  const files: string[] = []
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return files
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listJsonl(full)))
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      files.push(full)
    }
  }
  return files
}

async function scanFile(file: string, boundsSince: number, boundsUntil: number): Promise<Hit[]> {
  const hits: Hit[] = []
  const stream = createReadStream(file, { encoding: 'utf8' })
  const lines = createInterface({ input: stream, crlfDelay: Infinity })
  try {
    for await (const line of lines) {
      if (!line.includes('"usage"') || !line.includes('"assistant"')) continue
      let parsed: unknown
      try {
        parsed = JSON.parse(line)
      } catch {
        continue
      }
      const hit = readHit(parsed)
      if (!hit || hit.at < boundsSince || hit.at >= boundsUntil) continue
      hits.push(hit)
    }
  } finally {
    lines.close()
    stream.destroy()
  }
  return hits
}

export async function summarizeClaudeSessions(range: ClaudeUsageRange): Promise<ClaudeUsageSummary> {
  const bounds = describeWindow(range)
  const totals = freshAcc()
  let costTotal = 0
  let savingsTotal = 0
  const sessions = new Set<string>()
  const models = new Map<string, { tokens: TokenAcc; costUsd: number; unpriced: boolean; files: Set<string> }>()
  const bucketTotals = new Map<string, { costUsd: number; totalTokens: number }>()

  try {
    const root = path.join(homedir(), '.claude', 'projects')
    const files = await listJsonl(root)
    for (const file of files) {
      const hits = await scanFile(file, bounds.sinceMs, bounds.untilMs)
      if (hits.length === 0) continue
      sessions.add(file)
      for (const hit of hits) {
        addTokens(totals, hit.tokens)
        const rates = ratesForModel(hit.model)
        const priced = rates ? costUsd(hit.tokens, rates) : 0
        const savings = rates ? cacheSavingsUsd(hit.tokens.cachedInput, rates) : 0
        costTotal += priced
        savingsTotal += savings

        const model = models.get(hit.model) ?? {
          tokens: freshAcc(),
          costUsd: 0,
          unpriced: rates === null,
          files: new Set<string>()
        }
        addTokens(model.tokens, hit.tokens)
        model.costUsd += priced
        model.files.add(file)
        models.set(hit.model, model)

        const key = bucketKeyFor(hit.at, bounds)
        if (!key) continue
        const bucket = bucketTotals.get(key) ?? { costUsd: 0, totalTokens: 0 }
        bucket.costUsd += priced
        bucket.totalTokens += totalProcessed(hit.tokens)
        bucketTotals.set(key, bucket)
      }
    }
  } catch (error) {
    return emptySummary(range, bounds, error instanceof Error ? error.message : 'Could not read Claude sessions.')
  }

  const buckets: ClaudeUsageBucket[] = bounds.buckets.map((bucket) => {
    const found = bucketTotals.get(bucket.key)
    return {
      key: bucket.key,
      label: bucket.label,
      costUsd: found?.costUsd ?? 0,
      totalTokens: found?.totalTokens ?? 0
    }
  })

  const modelRows: ClaudeModelUsage[] = [...models.entries()]
    .map(([model, row]) => ({
      model,
      costUsd: row.costUsd,
      unpriced: row.unpriced,
      totalTokens: totalProcessed(row.tokens),
      tokens: {
        uncachedInput: row.tokens.uncachedInput,
        cachedInput: row.tokens.cachedInput,
        cacheCreation: row.tokens.cacheCreation,
        output: row.tokens.output
      },
      sessions: row.files.size
    }))
    .sort((a, b) => b.costUsd - a.costUsd || b.totalTokens - a.totalTokens)

  return {
    range,
    sinceLabel: bounds.sinceLabel,
    untilLabel: bounds.untilLabel,
    sessions: sessions.size,
    costUsd: costTotal,
    cacheSavingsUsd: savingsTotal,
    tokens: {
      uncachedInput: totals.uncachedInput,
      cachedInput: totals.cachedInput,
      cacheCreation: totals.cacheCreation,
      output: totals.output
    },
    totalTokens: totalProcessed(totals),
    buckets,
    models: modelRows
  }
}

function emptySummary(
  range: ClaudeUsageRange,
  bounds: ReturnType<typeof describeWindow>,
  error?: string
): ClaudeUsageSummary {
  return {
    range,
    sinceLabel: bounds.sinceLabel,
    untilLabel: bounds.untilLabel,
    sessions: 0,
    costUsd: 0,
    cacheSavingsUsd: 0,
    tokens: emptyTokenTotals(),
    totalTokens: 0,
    buckets: bounds.buckets.map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      costUsd: 0,
      totalTokens: 0
    })),
    models: [],
    ...(error ? { error } : {})
  }
}
