import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PortStatus } from '../../shared/types'

export function usePortHealth(ports: number[], intervalMs = 4000): {
  statuses: PortStatus[]
  refresh: () => Promise<void>
  forceFree: (port: number) => Promise<string>
} {
  const [statuses, setStatuses] = useState<PortStatus[]>([])
  const key = useMemo(() => [...ports].sort((a, b) => a - b).join(','), [ports])

  const refresh = useCallback(async () => {
    if (ports.length === 0) {
      setStatuses([])
      return
    }
    const result = await window.devcenter.ports.check(ports)
    setStatuses(result)
  }, [ports])

  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => void refresh(), intervalMs)
    return () => window.clearInterval(id)
  }, [refresh, intervalMs, key])

  const forceFree = useCallback(
    async (port: number) => {
      const result = await window.devcenter.ports.forceFree(port)
      await refresh()
      return result.message
    },
    [refresh]
  )

  return { statuses, refresh, forceFree }
}
