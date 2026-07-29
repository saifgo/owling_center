import { useCallback, useEffect } from 'react'
import { useUiStore } from '../store/uiStore'
import type { LaunchResult } from '../../shared/types'

export function useProcessEngine(): {
  processes: ReturnType<typeof useUiStore.getState>['processes']
  logs: ReturnType<typeof useUiStore.getState>['logs']
  launch: (projectId: string) => Promise<LaunchResult>
  stopProject: (projectId: string) => Promise<void>
  stopAll: () => Promise<void>
  clearLogs: (projectId?: string) => void
} {
  const processes = useUiStore((s) => s.processes)
  const logs = useUiStore((s) => s.logs)
  const setProcesses = useUiStore((s) => s.setProcesses)
  const upsertProcess = useUiStore((s) => s.upsertProcess)
  const removeProcess = useUiStore((s) => s.removeProcess)
  const appendLog = useUiStore((s) => s.appendLog)
  const clearLogs = useUiStore((s) => s.clearLogs)
  const setToast = useUiStore((s) => s.setToast)
  const setLogDrawerOpen = useUiStore((s) => s.setLogDrawerOpen)

  useEffect(() => {
    void window.devcenter.process.list().then(setProcesses)

    const offLog = window.devcenter.process.onLog((chunk) => {
      appendLog(chunk)
    })

    const offEvent = window.devcenter.process.onEvent((event) => {
      if (event.type === 'started') {
        upsertProcess(event.process)
      } else if (event.type === 'exited') {
        removeProcess(event.processId)
      }
    })

    return () => {
      offLog()
      offEvent()
    }
  }, [appendLog, removeProcess, setProcesses, upsertProcess])

  const launch = useCallback(
    async (projectId: string) => {
      setLogDrawerOpen(true)
      const result = await window.devcenter.process.launch(projectId)
      if (!result.ok) {
        setToast(result.error ?? 'Launch failed')
      } else if (result.warnings.length > 0) {
        setToast(result.warnings[0])
      } else {
        setToast('Project launched')
      }
      const list = await window.devcenter.process.list()
      setProcesses(list)
      return result
    },
    [setLogDrawerOpen, setProcesses, setToast]
  )

  const stopProject = useCallback(
    async (projectId: string) => {
      const count = await window.devcenter.process.stopProject(projectId)
      const list = await window.devcenter.process.list()
      setProcesses(list)
      setToast(`Stopped ${count} process${count === 1 ? '' : 'es'}`)
    },
    [setProcesses, setToast]
  )

  const stopAll = useCallback(async () => {
    const count = await window.devcenter.process.stopAll()
    setProcesses([])
    setToast(`Stopped all (${count})`)
  }, [setProcesses, setToast])

  return { processes, logs, launch, stopProject, stopAll, clearLogs }
}
