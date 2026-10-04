import { create } from './createStore'
import type { LogChunk, ProcessInfo, Project } from '../../shared/types'

export type LogDock = 'bottom' | 'right'

const PANEL_KEY = 'owling.logPanel'
const SIDEBAR_KEY = 'owling.sidebarCollapsed'

interface PanelPrefs {
  dock: LogDock
  height: number
  width: number
  open: boolean
}

function loadPanelPrefs(): PanelPrefs {
  const fallback: PanelPrefs = { dock: 'bottom', height: 280, width: 440, open: false }
  try {
    const raw = localStorage.getItem(PANEL_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<PanelPrefs>
    const height = Number(parsed.height)
    const width = Number(parsed.width)
    return {
      dock: parsed.dock === 'right' ? 'right' : 'bottom',
      height: Number.isFinite(height) ? Math.min(900, Math.max(160, height)) : fallback.height,
      width: Number.isFinite(width) ? Math.min(1200, Math.max(300, width)) : fallback.width,
      open: parsed.open === true
    }
  } catch {
    return fallback
  }
}

function savePanelPrefs(prefs: PanelPrefs): void {
  localStorage.setItem(PANEL_KEY, JSON.stringify(prefs))
}

function loadSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === 'true'
  } catch {
    return false
  }
}

function saveSidebarCollapsed(collapsed: boolean): void {
  localStorage.setItem(SIDEBAR_KEY, collapsed ? 'true' : 'false')
}

const panelPrefs = loadPanelPrefs()

interface UiState {
  projects: Project[]
  selectedProjectId: string | null
  processes: ProcessInfo[]
  logs: LogChunk[]
  logDrawerOpen: boolean
  logDock: LogDock
  logDockHeight: number
  logDockWidth: number
  settingsOpen: boolean
  editingProject: Project | null
  toast: string | null
  sidebarCollapsed: boolean
  setProjects: (projects: Project[]) => void
  selectProject: (id: string | null) => void
  setProcesses: (processes: ProcessInfo[]) => void
  upsertProcess: (process: ProcessInfo) => void
  removeProcess: (processId: string) => void
  appendLog: (chunk: LogChunk) => void
  clearLogs: (projectId?: string) => void
  clearProcessLogs: (processId: string) => void
  setLogDrawerOpen: (open: boolean) => void
  setLogDock: (dock: LogDock) => void
  setLogDockHeight: (height: number) => void
  setLogDockWidth: (width: number) => void
  setSettingsOpen: (open: boolean) => void
  setEditingProject: (project: Project | null) => void
  setToast: (message: string | null) => void
  setSidebarCollapsed: (collapsed: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  projects: [],
  selectedProjectId: null,
  processes: [],
  logs: [],
  logDrawerOpen: panelPrefs.open,
  logDock: panelPrefs.dock,
  logDockHeight: panelPrefs.height,
  logDockWidth: panelPrefs.width,
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
    set((s) => {
      if (!s.logDrawerOpen) {
        savePanelPrefs({
          dock: s.logDock,
          height: s.logDockHeight,
          width: s.logDockWidth,
          open: true
        })
      }
      return {
        logs: [...s.logs.slice(-800), chunk],
        logDrawerOpen: true
      }
    }),
  clearLogs: (projectId) =>
    set((s) => ({
      logs: projectId ? s.logs.filter((l) => l.projectId !== projectId) : []
    })),
  clearProcessLogs: (processId) =>
    set((s) => ({
      logs: s.logs.filter((l) => l.processId !== processId)
    })),
  setLogDrawerOpen: (open) =>
    set((s) => {
      savePanelPrefs({
        dock: s.logDock,
        height: s.logDockHeight,
        width: s.logDockWidth,
        open
      })
      return { logDrawerOpen: open }
    }),
  setLogDock: (dock) =>
    set((s) => {
      savePanelPrefs({
        dock,
        height: s.logDockHeight,
        width: s.logDockWidth,
        open: s.logDrawerOpen
      })
      return { logDock: dock, logDrawerOpen: true }
    }),
  setLogDockHeight: (height) =>
    set((s) => {
      const next = Math.min(900, Math.max(160, Math.round(height)))
      savePanelPrefs({
        dock: s.logDock,
        height: next,
        width: s.logDockWidth,
        open: s.logDrawerOpen
      })
      return { logDockHeight: next }
    }),
  setLogDockWidth: (width) =>
    set((s) => {
      const next = Math.min(1200, Math.max(300, Math.round(width)))
      savePanelPrefs({
        dock: s.logDock,
        height: s.logDockHeight,
        width: next,
        open: s.logDrawerOpen
      })
      return { logDockWidth: next }
    }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setEditingProject: (project) => set({ editingProject: project }),
  setToast: (message) => set({ toast: message }),
  sidebarCollapsed: loadSidebarCollapsed(),
  setSidebarCollapsed: (collapsed) => {
    saveSidebarCollapsed(collapsed)
    set({ sidebarCollapsed: collapsed })
  }
}))
