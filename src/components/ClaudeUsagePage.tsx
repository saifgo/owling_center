import { Gauge, LogIn, LogOut, RefreshCw, Settings, TrendingDown, TrendingUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  formatResetsIn,
  formatShare,
  formatTokens,
  formatUsd,
  paceOf,
  remainingPercent,
  totalProcessed
} from '../../shared/claudeUsage'
import type { ClaudeLimitWindow, ClaudeUsageMetric, ClaudeUsageSummary } from '../../shared/types'
import { useClaudeUsage } from '../hooks/useClaudeUsage'

const RANGES = [
  { id: '24h', label: 'Past 24h' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' }
] as const

const METRICS: Array<{ id: ClaudeUsageMetric; label: string }> = [
  { id: 'cost', label: 'Cost' },
  { id: 'tokens', label: 'Tokens' },
  { id: 'limits', label: 'Limits' }
]

const CHART = '#e7b1a2'

interface ClaudeUsagePageProps {
  active: boolean
  onOpenSettings: () => void
}

export function ClaudeUsagePage({ active, onOpenSettings }: ClaudeUsagePageProps): React.JSX.Element {
  const { range, setRange, summary, limits, loading, authBusy, refresh, login, logout } =
    useClaudeUsage(active)
  const [metric, setMetric] = useState<ClaudeUsageMetric>('cost')
  const [breakdown, setBreakdown] = useState<'model' | 'day'>('model')

  const rangeLabel = summary ? `${summary.sinceLabel} to ${summary.untilLabel}` : ''

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-white/8 px-6 py-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Usage</h1>
          <p className="text-sm text-white/45">{rangeLabel || 'Claude Code sessions on this machine'}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            title="Refresh"
            disabled={loading}
            onClick={() => void refresh()}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          <button type="button" className="btn btn-ghost" title="App settings" onClick={onOpenSettings}>
            <Settings size={15} />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            value={metric}
            options={METRICS}
            onChange={setMetric}
          />
          {metric !== 'limits' && (
            <Segmented
              value={range}
              options={RANGES}
              onChange={setRange}
            />
          )}
        </div>

        {metric === 'limits' ? (
          <LimitsPanel limits={limits} authBusy={authBusy} onLogin={() => void login()} onLogout={() => void logout()} />
        ) : summary ? (
          <UsagePanel summary={summary} metric={metric} breakdown={breakdown} onBreakdown={setBreakdown} />
        ) : (
          <p className="mt-8 text-sm text-white/45">{loading ? 'Reading local Claude sessions…' : 'No usage yet.'}</p>
        )}
      </div>
    </main>
  )
}

function Segmented<T extends string>({
  value,
  options,
  onChange
}: {
  value: T
  options: ReadonlyArray<{ id: T; label: string }>
  onChange: (id: T) => void
}): React.JSX.Element {
  return (
    <div className="inline-flex rounded-lg border border-white/10 bg-black/20 p-0.5">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={[
            'rounded-md px-3 py-1.5 text-sm transition',
            value === option.id ? 'bg-white/10 text-white' : 'text-white/55 hover:text-white/80'
          ].join(' ')}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function UsagePanel({
  summary,
  metric,
  breakdown,
  onBreakdown
}: {
  summary: ClaudeUsageSummary
  metric: 'cost' | 'tokens'
  breakdown: 'model' | 'day'
  onBreakdown: (next: 'model' | 'day') => void
}): React.JSX.Element {
  const headline = metric === 'cost' ? formatUsd(summary.costUsd) : formatTokens(summary.totalTokens)
  const subtitle =
    metric === 'cost'
      ? `${summary.sessions} sessions · API estimate`
      : `${summary.sessions} session${summary.sessions === 1 ? '' : 's'}`
  const shareBase = metric === 'cost' ? summary.costUsd : summary.totalTokens
  const providerShare = shareBase > 0 ? 1 : 0

  const models = useMemo(() => {
    const rows = [...summary.models]
    if (metric === 'tokens') {
      rows.sort((a, b) => b.totalTokens - a.totalTokens || b.costUsd - a.costUsd)
    } else {
      rows.sort((a, b) => b.costUsd - a.costUsd || b.totalTokens - a.totalTokens)
    }
    return rows
  }, [summary.models, metric])

  const days = useMemo(() => [...summary.buckets].reverse(), [summary.buckets])

  return (
    <div className="mt-6 max-w-4xl">
      {summary.error && <p className="mb-4 text-sm text-danger">{summary.error}</p>}
      <p className="font-display text-5xl font-semibold tracking-tight">{headline}</p>
      <p className="mt-1 text-sm text-white/45">{subtitle}</p>

      <div className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-surface-900/70 px-4 py-3">
        <div>
          <p className="text-sm font-medium">Claude</p>
          <p className="text-xs text-white/40">{summary.sessions} sessions</p>
        </div>
        <div className="text-right text-sm">
          <p>{formatShare(providerShare)}</p>
          <p className="text-white/45">
            {metric === 'cost' ? formatTokens(summary.totalTokens) : formatUsd(summary.costUsd)}
          </p>
        </div>
      </div>

      <AreaChart
        title={
          summary.range === '24h'
            ? metric === 'cost'
              ? 'Hourly cost'
              : 'Hourly processed tokens'
            : metric === 'cost'
              ? 'Daily cost'
              : 'Daily processed tokens'
        }
        buckets={summary.buckets}
        metric={metric}
      />

      <div className="mt-5 grid gap-3 sm:grid-cols-5">
        <Total label="Processed tokens" value={formatTokens(summary.totalTokens)} />
        <Total label="Cached input" value={formatTokens(summary.tokens.cachedInput)} />
        <Total label="Uncached input" value={formatTokens(summary.tokens.uncachedInput)} />
        <Total label="Output" value={formatTokens(summary.tokens.output)} />
        <Total label="Cache savings" value={formatUsd(summary.cacheSavingsUsd)} />
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p className="label mb-0">Breakdown</p>
        <Segmented
          value={breakdown}
          options={[
            { id: 'model' as const, label: 'Model' },
            { id: 'day' as const, label: 'Day' }
          ]}
          onChange={onBreakdown}
        />
      </div>

      <div className="mt-3 divide-y divide-white/8 rounded-xl border border-white/10 bg-surface-900/50">
        {breakdown === 'model' && models.length === 0 && (
          <p className="px-4 py-3 text-sm text-white/40">No model usage in this window.</p>
        )}
        {breakdown === 'model' &&
          models.map((model) => {
            const amount = metric === 'cost' ? model.costUsd : model.totalTokens
            const share = shareBase > 0 ? amount / shareBase : 0
            return (
              <div key={model.model} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm">{model.model}</p>
                  <p className="text-xs text-white/35">
                    {model.sessions} session{model.sessions === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="shrink-0 text-right text-sm">
                  <p>{model.unpriced ? 'Unpriced' : formatUsd(model.costUsd)}</p>
                  <p className="text-white/45">
                    {formatShare(metric === 'cost' && model.unpriced ? 0 : share)} · {formatTokens(model.totalTokens)}
                  </p>
                </div>
              </div>
            )
          })}
        {breakdown === 'day' &&
          days.map((bucket) => (
            <div key={bucket.key} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
              <p>{bucket.label}</p>
              <p className="text-white/70">
                {metric === 'cost' ? formatUsd(bucket.costUsd) : formatTokens(bucket.totalTokens)}
              </p>
            </div>
          ))}
      </div>
      <p className="mt-3 text-xs text-white/30">
        Cache writes {formatTokens(summary.tokens.cacheCreation)} are included in{' '}
        {formatTokens(totalProcessed(summary.tokens))} processed tokens.
      </p>
    </div>
  )
}

function Total({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-white/40">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  )
}

function AreaChart({
  title,
  buckets,
  metric
}: {
  title: string
  buckets: ClaudeUsageSummary['buckets']
  metric: 'cost' | 'tokens'
}): React.JSX.Element {
  const width = 640
  const height = 180
  const padL = 52
  const padR = 8
  const padT = 16
  const padB = 28
  const innerW = width - padL - padR
  const innerH = height - padT - padB
  const values = buckets.map((bucket) => (metric === 'cost' ? bucket.costUsd : bucket.totalTokens))
  const peak = Math.max(...values, 0)
  const scale = peak > 0 ? peak : 1
  const step = buckets.length > 1 ? innerW / (buckets.length - 1) : innerW
  const points = values.map((value, index) => {
    const x = padL + (buckets.length === 1 ? innerW / 2 : index * step)
    const y = padT + innerH - (value / scale) * innerH
    return { x, y }
  })
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  const area =
    points.length > 0
      ? `${line} L ${points[points.length - 1].x} ${padT + innerH} L ${points[0].x} ${padT + innerH} Z`
      : ''
  const ticks = [peak, peak / 2, 0]
  const labelAt = (index: number): string => buckets[index]?.label ?? ''
  const xLabels =
    buckets.length === 0
      ? []
      : buckets.length === 1
        ? [{ x: padL + innerW / 2, text: labelAt(0) }]
        : buckets.length === 2
          ? [
              { x: padL, text: labelAt(0) },
              { x: padL + innerW, text: labelAt(1) }
            ]
          : [
              { x: padL, text: labelAt(0) },
              { x: padL + innerW / 2, text: labelAt(Math.floor((buckets.length - 1) / 2)) },
              { x: padL + innerW, text: labelAt(buckets.length - 1) }
            ]

  const formatTick = (value: number): string => (metric === 'cost' ? formatUsd(value) : formatTokens(value))

  return (
    <section className="mt-5">
      <p className="text-sm text-white/55">{title}</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-2 w-full" role="img" aria-label={title}>
        {ticks.map((tick, index) => {
          const y = padT + innerH - (index === 2 ? 0 : tick / scale) * innerH
          return (
            <g key={index}>
              <line x1={padL} x2={width - padR} y1={y} y2={y} stroke="rgba(255,255,255,0.08)" />
              <text x={padL - 8} y={y + 4} textAnchor="end" fill="rgba(255,255,255,0.4)" fontSize="11">
                {formatTick(tick)}
              </text>
            </g>
          )
        })}
        {area && <path d={area} fill={CHART} opacity="0.28" />}
        {line && <path d={line} fill="none" stroke={CHART} strokeWidth="2" />}
        {xLabels.map((label) => (
          <text key={label.text + label.x} x={label.x} y={height - 6} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="11">
            {label.text}
          </text>
        ))}
      </svg>
    </section>
  )
}

function LimitsPanel({
  limits,
  authBusy,
  onLogin,
  onLogout
}: {
  limits: ReturnType<typeof useClaudeUsage>['limits']
  authBusy: boolean
  onLogin: () => void
  onLogout: () => void
}): React.JSX.Element {
  const signedIn = limits?.status === 'authenticated' || limits?.status === 'api-key'
  const showWindows = limits?.status === 'authenticated' && (limits.windows?.length ?? 0) > 0

  return (
    <div className="mt-6 max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">Claude</h2>
          <p className="text-sm text-white/45">
            {[limits?.plan, limits?.email].filter(Boolean).join(' · ') || 'Subscription windows'}
          </p>
        </div>
        {limits &&
          (signedIn ? (
            <button type="button" className="btn btn-ghost" disabled={authBusy} onClick={onLogout}>
              <LogOut size={15} />
              Sign out
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={authBusy || limits.status === 'missing-cli'}
              onClick={onLogin}
            >
              <LogIn size={15} />
              {authBusy ? 'Waiting for Claude…' : 'Sign in'}
            </button>
          ))}
      </div>

      {!limits && <p className="mt-6 text-sm text-white/45">Reading limits…</p>}

      {limits && !showWindows && (
        <p className="mt-6 rounded-xl border border-white/10 bg-surface-900/70 px-4 py-4 text-sm text-white/70">
          {limits.message ?? 'Could not read limits.'}
        </p>
      )}

      {showWindows && (
        <div className="mt-5 space-y-3">
          {limits.windows.map((limit) => (
            <LimitCard key={limit.id} window={limit} />
          ))}
        </div>
      )}
    </div>
  )
}

function LimitCard({ window }: { window: ClaudeLimitWindow }): React.JSX.Element {
  const left = remainingPercent(window.usedPercent)
  const reset = formatResetsIn(window)
  const pace = paceOf(window)
  const PaceIcon = pace === 'ahead' ? TrendingUp : pace === 'under' ? TrendingDown : Gauge

  return (
    <article className="rounded-xl border border-white/10 bg-surface-900/70 px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-white/70">{window.label}</p>
        <p className="text-xs text-white/40">{reset ?? ''}</p>
      </div>
      <div className="mt-1 flex items-end gap-2">
        <p className="font-display text-4xl font-semibold tracking-tight">{left}% left</p>
        {pace && (
          <span className="mb-1 inline-flex items-center gap-1 text-xs text-white/40">
            <PaceIcon size={13} />
            {pace === 'ahead' ? 'Ahead' : pace === 'under' ? 'Under pace' : 'On pace'}
          </span>
        )}
      </div>
      <div
        className="mt-4 h-2.5 overflow-hidden rounded-full"
        style={{
          backgroundImage:
            'repeating-linear-gradient(-45deg, rgba(231,177,162,0.18) 0 6px, rgba(231,177,162,0.05) 6px 12px)'
        }}
      >
        <div className="h-full rounded-full" style={{ width: `${left}%`, background: CHART }} />
      </div>
    </article>
  )
}
