export interface ProjectCommand {
  id: string
  name: string
  cwd: string
  cmd: string
}

export interface ProjectServices {
  wamp?: boolean
  database?: 'mysql' | null
}

export interface ProjectJiraConfig {
  projectKey: string
  jql?: string
}

export type JiraAssigneeFilter = 'mine' | 'all'

export interface BranchCreateRepoResult {
  path: string
  label: string
  ok: boolean
  branch?: string
  message: string
}

export interface BranchCreateResult {
  ok: boolean
  branchName: string
  results: BranchCreateRepoResult[]
  transition?: JiraTransitionResult
}

export interface JiraTransitionResult {
  ok: boolean
  message: string
  from?: string
  to?: string
}

export interface Project {
  id: string
  name: string
  /** Optional fallback cwd / legacy single path — prefer foldersToOpen */
  rootPath?: string
  ideCommand: string
  services: ProjectServices
  foldersToOpen: string[]
  commands: ProjectCommand[]
  ports: number[]
  jira?: ProjectJiraConfig
}

export interface TodoItem {
  id: string
  projectId: string
  text: string
  completed: boolean
  createdAt: string
}

export interface SessionNote {
  id: string
  projectId: string
  text: string
  createdAt: string
}

export interface JiraSettings {
  enabled: boolean
  baseUrl: string
  email: string
  apiToken: string
}

export interface AppSettings {
  autostart: boolean
  jira: JiraSettings
  quickActions: QuickAction[]
}

export type QuickActionType = 'url' | 'program' | 'command'

export interface QuickAction {
  id: string
  label: string
  type: QuickActionType
  /** URL, program path, or shell command */
  target: string
  /** Optional args for program, or unused for url */
  args?: string
  /** Optional working directory for command/program */
  cwd?: string
}

export interface QuickActionResult {
  ok: boolean
  message: string
}

export interface DevCenterBackup {
  version: 1
  exportedAt: string
  app: 'devcenter'
  projects: Project[]
  settings: AppSettings
  todos?: TodoItem[]
  sessionNotes?: SessionNote[]
}

export interface BackupResult {
  ok: boolean
  message: string
  path?: string
  data?: {
    projects: Project[]
    settings: AppSettings
  }
}

export interface JiraIssue {
  key: string
  summary: string
  status: string
  statusCategory?: string
  issueType: string
  priority?: string
  url: string
  updated?: string
}

export interface JiraTestResult {
  ok: boolean
  message: string
  displayName?: string
}

export interface JiraCreateResult {
  ok: boolean
  key?: string
  url?: string
  error?: string
}

export interface PortStatus {
  port: number
  inUse: boolean
  pid?: number
}

export interface GitStatus {
  path: string
  label: string
  branch: string
  dirtyCount: number
  ahead: number
  behind: number
  error?: string
}

export interface ProcessInfo {
  id: string
  projectId: string
  name: string
  pid: number
  cmd: string
  cwd: string
  startedAt: string
}

export interface LogChunk {
  projectId: string
  processId: string
  processName: string
  stream: 'stdout' | 'stderr' | 'system'
  text: string
  timestamp: string
}

export interface LaunchResult {
  ok: boolean
  warnings: string[]
  error?: string
  processes: ProcessInfo[]
}

export type ProcessEvent =
  | { type: 'started'; process: ProcessInfo }
  | { type: 'exited'; processId: string; projectId: string; code: number | null }
  | { type: 'log'; chunk: LogChunk }
