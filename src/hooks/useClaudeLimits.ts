import { useEffect, useState } from 'react'
import type { ClaudeLimits } from '../../shared/types'

const POLL_MS = 2 * 60_000
const TICK_MS = 30_000

let cached: ClaudeLimits | null = null
let inflight: Promise<ClaudeLimits | null> | null = null
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

export function publishClaudeLimits(next: ClaudeLimits | null): void {
  cached = next
  emit()
}

export function refreshClaudeLimits(): Promise<ClaudeLimits | null> {
  if (inflight) return inflight
  const request = window.devcenter.claude
    .limits()
    .then((next) => {
      publishClaudeLimits(next)
      return next
    })
    .catch(() => cached)
    .finally(() => {
      if (inflight === request) inflight = null
    })
  inflight = request
  return request
}

export function useClaudeLimits(): { limits: ClaudeLimits | null; now: number } {
  const [limits, setLimits] = useState<ClaudeLimits | null>(cached)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const sync = (): void => setLimits(cached)
    listeners.add(sync)
    void refreshClaudeLimits()
    const poll = window.setInterval(() => void refreshClaudeLimits(), POLL_MS)
    const tick = window.setInterval(() => setNow(Date.now()), TICK_MS)
    return () => {
      listeners.delete(sync)
      window.clearInterval(poll)
      window.clearInterval(tick)
    }
  }, [])

  return { limits, now }
}
