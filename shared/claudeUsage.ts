import type { ClaudeLimitWindow, ClaudeUsageRange } from './types'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const CURRENCY = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

const INTEGER = new Intl.NumberFormat('en-US')

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatUsd(value: number): string {
  return CURRENCY.format(value)
}

export function formatTokens(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1e12) return `${trim(value / 1e12)}T`
  if (abs >= 1e9) return `${trim(value / 1e9)}B`
  if (abs >= 1e6) return `${trim(value / 1e6)}M`
  if (abs >= 1e3) return `${trim(value / 1e3)}K`
  return INTEGER.format(Math.round(value))
}

function trim(value: number): string {
  const abs = Math.abs(value)
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2
  return value.toFixed(digits).replace(/\.0+$/, '')
}

export function formatShare(share: number): string {
  if (!Number.isFinite(share) || share <= 0) return '0%'
  const percent = share * 100
  if (percent < 0.1) return '<0.1%'
  return `${percent.toFixed(1)}%`
}

export function localDayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function formatDayShort(day: string): string {
  const [year, month, dayOfMonth] = day.split('-').map((part) => Number(part))
  if (!year || !month || !dayOfMonth) return day
  return `${MONTHS[month - 1] ?? ''} ${dayOfMonth}`
}

export function formatHourShort(hourStartMs: number): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric' }).format(new Date(hourStartMs))
}

export interface UsageWindowBounds {
  range: ClaudeUsageRange
  resolution: 'hour' | 'day'
  sinceMs: number
  untilMs: number
  sinceLabel: string
  untilLabel: string
  /** Oldest first. */
  buckets: Array<{ key: string; label: string }>
}

export function describeWindow(range: ClaudeUsageRange, now = new Date()): UsageWindowBounds {
  if (range === '24h') {
    const untilMs = Math.floor(now.getTime() / MINUTE) * MINUTE
    const sinceMs = untilMs - 24 * HOUR
    const buckets: UsageWindowBounds['buckets'] = []
    const startHour = Math.floor(sinceMs / HOUR) * HOUR
    for (let cursor = startHour; cursor < untilMs; cursor += HOUR) {
      buckets.push({ key: String(cursor), label: formatHourShort(cursor) })
    }
    return {
      range,
      resolution: 'hour',
      sinceMs,
      untilMs,
      sinceLabel: formatDayShort(localDayKey(new Date(sinceMs))),
      untilLabel: formatDayShort(localDayKey(new Date(untilMs))),
      buckets
    }
  }

  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const start = new Date(end)
  start.setDate(end.getDate() - (days - 1))
  const buckets: UsageWindowBounds['buckets'] = []
  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const key = localDayKey(cursor)
    buckets.push({ key, label: formatDayShort(key) })
  }
  const until = new Date(end)
  until.setDate(end.getDate() + 1)
  return {
    range,
    resolution: 'day',
    sinceMs: start.getTime(),
    untilMs: until.getTime(),
    sinceLabel: formatDayShort(localDayKey(start)),
    untilLabel: formatDayShort(localDayKey(end)),
    buckets
  }
}

export function bucketKeyFor(timestampMs: number, bounds: UsageWindowBounds): string | null {
  if (timestampMs < bounds.sinceMs || timestampMs >= bounds.untilMs) return null
  if (bounds.resolution === 'hour') return String(Math.floor(timestampMs / HOUR) * HOUR)
  return localDayKey(new Date(timestampMs))
}

export function remainingPercent(usedPercent: number): number {
  const used = Math.max(0, Math.min(100, usedPercent))
  return Math.round(100 - used)
}

export type LimitPace = 'ahead' | 'on' | 'under'

export function elapsedShare(window: ClaudeLimitWindow, now = Date.now()): number | null {
  if (!window.resetsAt || window.windowDurationMins <= 0) return null
  const resetsAt = Date.parse(window.resetsAt)
  if (!Number.isFinite(resetsAt)) return null
  const length = window.windowDurationMins * MINUTE
  return Math.max(0, Math.min(1, (length - (resetsAt - now)) / length))
}

/** Ahead when spend is more than 5 points past the clock, under when more than 5 behind. */
export function paceOf(window: ClaudeLimitWindow, now = Date.now()): LimitPace | null {
  const elapsed = elapsedShare(window, now)
  if (elapsed === null) return null
  const gap = window.usedPercent - elapsed * 100
  if (gap > 5) return 'ahead'
  if (gap < -5) return 'under'
  return 'on'
}

export function formatDuration(ms: number): string {
  const remaining = Math.max(0, ms)
  const days = Math.floor(remaining / DAY)
  const hours = Math.floor((remaining % DAY) / HOUR)
  const minutes = Math.floor((remaining % HOUR) / MINUTE)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export function formatResetsIn(window: ClaudeLimitWindow, now = Date.now()): string | null {
  if (!window.resetsAt) return null
  const resetsAt = Date.parse(window.resetsAt)
  if (!Number.isFinite(resetsAt)) return null
  if (resetsAt <= now) return 'now'
  return formatDuration(resetsAt - now)
}

export function emptyTokenTotals(): {
  uncachedInput: number
  cachedInput: number
  cacheCreation: number
  output: number
} {
  return { uncachedInput: 0, cachedInput: 0, cacheCreation: 0, output: 0 }
}

export function totalProcessed(tokens: {
  uncachedInput: number
  cachedInput: number
  cacheCreation: number
  output: number
}): number {
  return tokens.uncachedInput + tokens.cachedInput + tokens.cacheCreation + tokens.output
}
