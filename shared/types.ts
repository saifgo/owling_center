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

export type AppUpdatePhase = 'idle' | 'available' | 'downloading' | 'downloaded' | 'error'

export interface AppUpdateProgress {
  percent: number
  transferred: number
  total: number
  bytesPerSecond: number
}

export interface AppUpdateStatus {
  currentVersion: string
  packaged: boolean
  phase: AppUpdatePhase
  /** Latest remote version when an update was found. */
  version?: string
  progress?: AppUpdateProgress
  error?: string
}

export interface AppUpdateCheck {
  currentVersion: string
  available: boolean
  version?: string
  /** True when the app is running from source, where updates cannot be installed. */
  devOnly?: boolean
  error?: string
}

export interface AppUpdateDownloadResult {
  ok: boolean
  cancelled?: boolean
  error?: string
}

export interface AppUpdateDownloaded {
  version: string
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

export type ClaudeUsageRange = '24h' | '7d' | '30d' | '90d'

export type ClaudeUsageMetric = 'cost' | 'tokens' | 'limits'

export interface ClaudeTokenTotals {
  uncachedInput: number
  cachedInput: number
  cacheCreation: number
  output: number
}

export interface ClaudeUsageBucket {
  key: string
  label: string
  costUsd: number
  totalTokens: number
}

export interface ClaudeModelUsage {
  model: string
  costUsd: number
  unpriced: boolean
  totalTokens: number
  tokens: ClaudeTokenTotals
  sessions: number
}

export interface ClaudeUsageSummary {
  range: ClaudeUsageRange
  sinceLabel: string
  untilLabel: string
  sessions: number
  costUsd: number
  cacheSavingsUsd: number
  tokens: ClaudeTokenTotals
  totalTokens: number
  /** Oldest first. Hourly for the past day, daily otherwise. */
  buckets: ClaudeUsageBucket[]
  models: ClaudeModelUsage[]
  error?: string
}

export type ClaudeLimitKind = 'session' | 'weekly'

export interface ClaudeLimitWindow {
  id: string
  kind: ClaudeLimitKind
  label: string
  /** 0–100, already consumed. */
  usedPercent: number
  windowDurationMins: number
  resetsAt?: string
}

export type ClaudeAuthStatus = 'signed-out' | 'authenticated' | 'api-key' | 'unavailable' | 'missing-cli'

export interface ClaudeLimits {
  status: ClaudeAuthStatus
  email?: string
  plan?: string
  checkedAt: string
  windows: ClaudeLimitWindow[]
  message?: string
}

export type ClaudeModelId = 'opus' | 'sonnet' | 'haiku'

export type ClaudeEffort = 'low' | 'medium' | 'high' | 'xhigh'

export type ClaudeAccessMode = 'supervised' | 'acceptEdits' | 'auto' | 'full'

export type ClaudeMessageKind = 'user' | 'assistant' | 'thinking' | 'tool' | 'approval' | 'status' | 'error'

export type ClaudeApprovalState = 'pending' | 'allowed' | 'denied'

export interface ClaudeThreadMessage {
  id: string
  projectId: string
  seq: number
  kind: ClaudeMessageKind
  text: string
  toolName?: string
  approval?: ClaudeApprovalState
  createdAt: string
}

export interface ClaudeThread {
  projectId: string
  sessionId: string | null
  cwd: string
  running: boolean
  messages: ClaudeThreadMessage[]
}

export interface ClaudePromptRequest {
  projectId: string
  prompt: string
  model: ClaudeModelId
  effort: ClaudeEffort
  access: ClaudeAccessMode
}

export interface ClaudePromptResult {
  ok: boolean
  message?: string
  sessionId?: string
}

export type ClaudeThreadEvent =
  | { type: 'message'; projectId: string; message: ClaudeThreadMessage }
  | { type: 'delta'; projectId: string; id: string; text: string }
  | {
      type: 'patch'
      projectId: string
      id: string
      text?: string
      toolName?: string
      approval?: ClaudeApprovalState
    }
  | { type: 'cleared'; projectId: string }
  | { type: 'done'; projectId: string }
  | { type: 'error'; projectId: string; message: string }
