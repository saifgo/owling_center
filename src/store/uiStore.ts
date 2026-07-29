import { create } from './createStore'
import type { LogChunk, ProcessInfo, Project } from '../../shared/types'

interface UiState {
  projects: Project[]
  selectedProjectId: string | null
  processes: ProcessInfo[]
  logs: LogChunk[]
  logDrawerOpen: boolean
  settingsOpen: boolean
  editingProject: Project | null
  toast: string | null
  setProjects: (projects: Project[]) => void
  selectProject: (id: string | null) => void
  setProcesses: (processes: ProcessInfo[]) => void
  upsertProcess: (process: ProcessInfo) => void
  removeProcess: (processId: string) => void
  appendLog: (chunk: LogChunk) => void
  clearLogs: (projectId?: string) => void
  setLogDrawerOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
  setEditingProject: (project: Project | null) => void
  setToast: (message: string | null) => void
}

export const useUiStore = create<UiState>((set) => ({
  projects: [],
  selectedProjectId: null,
  processes: [],
  logs: [],
  logDrawerOpen: false,
  settingsOpen: false,
  editingProject: null,
  toast: null,
  setProjects: (projects) => set({ projects }),
  selectProject: (id) => set({ selectedProjectId: id }),
  setProcesses: (processes) => set({ processes }),
  upsertProcess: (process) =>
    set((s) => ({
      processes: [...s.processes.filter((p) => p.id !== process.id), process]
    })),
  removeProcess: (processId) =>
    set((s) => ({ processes: s.processes.filter((p) => p.id !== processId) })),
  appendLog: (chunk) =>
    set((s) => ({
      logs: [...s.logs.slice(-800), chunk],
      logDrawerOpen: true
    })),
  clearLogs: (projectId) =>
    set((s) => ({
      logs: projectId ? s.logs.filter((l) => l.projectId !== projectId) : []
    })),
  setLogDrawerOpen: (open) => set({ logDrawerOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setEditingProject: (project) => set({ editingProject: project }),
  setToast: (message) => set({ toast: message })
}))
