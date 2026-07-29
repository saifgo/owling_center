import { useCallback, useEffect, useMemo, useState } from 'react'
import type { GitStatus } from '../../shared/types'

export function useGitStatus(paths: string[], intervalMs = 8000): {
  byPath: Record<string, GitStatus>
  refresh: () => Promise<void>
} {
  const [byPath, setByPath] = useState<Record<string, GitStatus>>({})
  const key = useMemo(() => [...new Set(paths.filter(Boolean))].sort().join('|'), [paths])

  const refresh = useCallback(async () => {
    const unique = [...new Set(paths.filter(Boolean))]
    if (unique.length === 0) {
      setByPath({})
      return
    }
    const statuses = await window.devcenter.git.statuses(unique)
    const map: Record<string, GitStatus> = {}
    for (const s of statuses) map[s.path] = s
    setByPath(map)
  }, [paths])

  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => void refresh(), intervalMs)
    return () => window.clearInterval(id)
  }, [refresh, intervalMs, key])

  return { byPath, refresh }
}
