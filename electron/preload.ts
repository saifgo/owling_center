import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type {
  AppSettings,
  BranchCreateResult,
  GitStatus,
  JiraAssigneeFilter,
  JiraCreateResult,
  JiraIssue,
  JiraSettings,
  JiraTestResult,
  JiraTransitionResult,
  LaunchResult,
  LogChunk,
  PortStatus,
  ProcessEvent,
  ProcessInfo,
  Project,
  QuickActionResult,
  BackupResult,
  SessionNote,
  TodoItem
} from '../shared/types'

const api = {
  projects: {
    list: (): Promise<Project[]> => ipcRenderer.invoke('projects:list'),
    upsert: (project: Project): Promise<Project[]> =>
      ipcRenderer.invoke('projects:upsert', project),
    delete: (id: string): Promise<Project[]> => ipcRenderer.invoke('projects:delete', id),
    get: (id: string): Promise<Project | undefined> => ipcRenderer.invoke('projects:get', id)
  },
  dialog: {
    selectDirectory: (): Promise<string | null> => ipcRenderer.invoke('dialog:selectDirectory'),
    selectFile: (): Promise<string | null> => ipcRenderer.invoke('dialog:selectFile')
  },
  quickActions: {
    run: (actionId: string): Promise<QuickActionResult> =>
      ipcRenderer.invoke('quickActions:run', actionId)
  },
  process: {
    launch: (projectId: string): Promise<LaunchResult> =>
      ipcRenderer.invoke('process:launch', projectId),
    stopProject: (projectId: string): Promise<number> =>
      ipcRenderer.invoke('process:stopProject', projectId),
    stopAll: (): Promise<number> => ipcRenderer.invoke('process:stopAll'),
    stop: (processId: string): Promise<boolean> => ipcRenderer.invoke('process:stop', processId),
    list: (projectId?: string): Promise<ProcessInfo[]> =>
      ipcRenderer.invoke('process:list', projectId),
    onLog: (callback: (chunk: LogChunk) => void): (() => void) => {
      const handler = (_: IpcRendererEvent, chunk: LogChunk): void => callback(chunk)
      ipcRenderer.on('process:log', handler)
      return () => ipcRenderer.removeListener('process:log', handler)
    },
    onEvent: (callback: (event: ProcessEvent) => void): (() => void) => {
      const handler = (_: IpcRendererEvent, event: ProcessEvent): void => callback(event)
      ipcRenderer.on('process:event', handler)
      return () => ipcRenderer.removeListener('process:event', handler)
    }
  },
  ports: {
    check: (ports: number[]): Promise<PortStatus[]> => ipcRenderer.invoke('ports:check', ports),
    forceFree: (port: number): Promise<{ ok: boolean; message: string }> =>
      ipcRenderer.invoke('ports:forceFree', port)
  },
  git: {
    status: (path: string): Promise<GitStatus> => ipcRenderer.invoke('git:status', path),
    statuses: (paths: string[]): Promise<GitStatus[]> => ipcRenderer.invoke('git:statuses', paths)
  },
  todos: {
    list: (projectId?: string): Promise<TodoItem[]> => ipcRenderer.invoke('todos:list', projectId),
    add: (projectId: string, text: string): Promise<TodoItem> =>
      ipcRenderer.invoke('todos:add', projectId, text),
    toggle: (id: string): Promise<TodoItem | null> => ipcRenderer.invoke('todos:toggle', id),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('todos:delete', id)
  },
  notes: {
    list: (projectId: string): Promise<SessionNote[]> => ipcRenderer.invoke('notes:list', projectId),
    add: (projectId: string, text: string): Promise<SessionNote> =>
      ipcRenderer.invoke('notes:add', projectId, text),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('notes:delete', id)
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
    save: (settings: AppSettings): Promise<AppSettings> =>
      ipcRenderer.invoke('settings:save', settings)
  },
  backup: {
    export: (): Promise<BackupResult> => ipcRenderer.invoke('backup:export'),
    import: (): Promise<BackupResult> => ipcRenderer.invoke('backup:import')
  },
  jira: {
    test: (jira?: JiraSettings): Promise<JiraTestResult> => ipcRenderer.invoke('jira:test', jira),
    issues: (projectId: string, filter?: JiraAssigneeFilter): Promise<JiraIssue[]> =>
      ipcRenderer.invoke('jira:issues', projectId, filter ?? 'mine'),
    createFromNote: (
      projectId: string,
      summary: string,
      description?: string
    ): Promise<JiraCreateResult> =>
      ipcRenderer.invoke('jira:createFromNote', projectId, summary, description),
    open: (url: string): Promise<void> => ipcRenderer.invoke('jira:open', url),
    createBranches: (
      projectId: string,
      issueKey: string,
      summary: string
    ): Promise<BranchCreateResult> =>
      ipcRenderer.invoke('jira:createBranches', projectId, issueKey, summary),
    moveToInProgress: (issueKey: string): Promise<JiraTransitionResult> =>
      ipcRenderer.invoke('jira:moveToInProgress', issueKey),
    moveToInReview: (issueKey: string): Promise<JiraTransitionResult> =>
      ipcRenderer.invoke('jira:moveToInReview', issueKey)
  }
}

export type DevCenterAPI = typeof api

contextBridge.exposeInMainWorld('devcenter', api)
