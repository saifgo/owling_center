import { useCallback, useEffect, useState } from 'react'
import type { ClaudeLimits, ClaudeUsageRange, ClaudeUsageSummary } from '../../shared/types'
import { publishClaudeLimits, refreshClaudeLimits } from './useClaudeLimits'

interface ClaudeUsageState {
  range: ClaudeUsageRange
  setRange: (range: ClaudeUsageRange) => void
  summary: ClaudeUsageSummary | null
  limits: ClaudeLimits | null
  loading: boolean
  authBusy: boolean
  refresh: () => Promise<void>
  login: () => Promise<void>
  logout: () => Promise<void>
}

export function useClaudeUsage(active: boolean): ClaudeUsageState {
  const [range, setRange] = useState<ClaudeUsageRange>('7d')
  const [summary, setSummary] = useState<ClaudeUsageSummary | null>(null)
  const [limits, setLimits] = useState<ClaudeLimits | null>(null)
  const [loading, setLoading] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [usage, nextLimits] = await Promise.all([
        window.devcenter.claude.usage(range),
        refreshClaudeLimits()
      ])
      setSummary(usage)
      setLimits(nextLimits)
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => {
    if (!active) return
    void refresh()
  }, [active, refresh])

  const login = useCallback(async () => {
    setAuthBusy(true)
    try {
      const next = await window.devcenter.claude.login()
      publishClaudeLimits(next)
      setLimits(next)
    } finally {
      setAuthBusy(false)
    }
  }, [])

  const logout = useCallback(async () => {
    setAuthBusy(true)
    try {
      const next = await window.devcenter.claude.logout()
      publishClaudeLimits(next)
      setLimits(next)
    } finally {
      setAuthBusy(false)
    }
  }, [])

  return { range, setRange, summary, limits, loading, authBusy, refresh, login, logout }
}
