import { useEffect, useState } from 'react'
import { FolderOpen, Plus, Trash2, X } from 'lucide-react'
import { UpdateSection } from './UpdateSection'
import { randomUUID } from './id'
import type {
  AppSettings,
  JiraSettings,
  Project,
  ProjectCommand,
  QuickAction,
  QuickActionType
} from '../../shared/types'

type SettingsTab = 'project' | 'app' | 'actions'

interface SettingsModalProps {
  open: boolean
  project: Project | null
  settings: AppSettings
  initialTab?: SettingsTab
  backupBusy?: boolean
  onClose: () => void
  onSaveProject: (project: Project) => Promise<void>
  onDeleteProject?: (id: string) => Promise<void>
  onSaveSettings: (settings: AppSettings) => Promise<void>
  onExportBackup?: () => Promise<void>
  onImportBackup?: () => Promise<void>
}

function emptyProject(): Project {
  return {
    id: randomUUID(),
    name: '',
    rootPath: '',
    ideCommand: 'code',
    services: { wamp: false, database: null },
    foldersToOpen: [],
    commands: [],
    ports: [],
    jira: { projectKey: '', jql: '' }
  }
}

function emptyCommand(): ProjectCommand {
  return { id: randomUUID(), name: '', cwd: '', cmd: '' }
}

function emptyJira(): JiraSettings {
  return { enabled: false, baseUrl: '', email: '', apiToken: '' }
}

function emptyQuickAction(): QuickAction {
  return { id: randomUUID(), label: '', type: 'url', target: '' }
}

function typeHint(type: QuickActionType): string {
  if (type === 'url') return 'https://example.com'
  if (type === 'program') return 'C:\\Program Files\\App\\app.exe'
  return 'npm run build'
}

export function SettingsModal({
  open,
  project,
  settings,
  initialTab = 'project',
  backupBusy = false,
  onClose,
  onSaveProject,
  onDeleteProject,
  onSaveSettings,
  onExportBackup,
  onImportBackup
}: SettingsModalProps): React.JSX.Element | null {
  const [draft, setDraft] = useState<Project>(emptyProject())
  const [autostart, setAutostart] = useState(settings.autostart)
  const [jira, setJira] = useState<JiraSettings>(settings.jira ?? emptyJira())
  const [quickActions, setQuickActions] = useState<QuickAction[]>(settings.quickActions ?? [])
  const [jiraTestMsg, setJiraTestMsg] = useState<string | null>(null)
  const [jiraTesting, setJiraTesting] = useState(false)
  const [portsText, setPortsText] = useState('')
  const [folderDraft, setFolderDraft] = useState('')
  const [tab, setTab] = useState<SettingsTab>('project')
  const isEdit = Boolean(project)

  useEffect(() => {
    if (!open) return
    const p = project
      ? {
          ...project,
          jira: {
            projectKey: project.jira?.projectKey ?? '',
            jql: project.jira?.jql ?? ''
          }
        }
      : emptyProject()
    setDraft(p)
    setPortsText(p.ports.join(', '))
    setAutostart(settings.autostart)
    setJira(settings.jira ?? emptyJira())
    setQuickActions(settings.quickActions ?? [])
    setJiraTestMsg(null)
    setTab(initialTab ?? 'project')
  }, [open, project, settings, initialTab])

  if (!open) return null

  const pickDir = async (apply: (path: string) => void): Promise<void> => {
    const path = await window.devcenter.dialog.selectDirectory()
    if (path) apply(path)
  }

  const pickFile = async (apply: (path: string) => void): Promise<void> => {
    const path = await window.devcenter.dialog.selectFile()
    if (path) apply(path)
  }

  const title =
    tab === 'app'
      ? 'App settings'
      : tab === 'actions'
        ? 'Quick actions'
        : isEdit
          ? 'Edit project'
          : 'Add project'

  const subtitle =
    tab === 'app'
      ? 'Startup, Jira credentials, and preferences'
      : tab === 'actions'
        ? 'Buttons to open URLs, programs, or run commands'
        : 'Paths, IDE, services, commands, ports & Jira'

  const saveProject = async (): Promise<void> => {
    const ports = portsText
      .split(/[,\s]+/)
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0)

    const projectKey = draft.jira?.projectKey?.trim() ?? ''
    const jql = draft.jira?.jql?.trim() ?? ''

    const cleaned: Project = {
      ...draft,
      name: draft.name.trim(),
      rootPath: draft.rootPath?.trim() || undefined,
      ideCommand: draft.ideCommand.trim() || 'code',
      ports,
      foldersToOpen: draft.foldersToOpen.filter(Boolean),
      commands: draft.commands.filter((c) => c.cmd.trim()),
      jira: projectKey ? { projectKey, jql: jql || undefined } : undefined
    }

    if (!cleaned.name) return
    if (cleaned.foldersToOpen.length === 0 && !cleaned.rootPath && cleaned.commands.length === 0) {
      return
    }
    await onSaveProject(cleaned)
    onClose()
  }

  const testJira = async (): Promise<void> => {
    setJiraTesting(true)
    setJiraTestMsg(null)
    try {
      if (!window.devcenter?.jira?.test) {
        setJiraTestMsg('Jira API unavailable — restart the app (preload needs a full reload)')
        return
      }
      const result = await window.devcenter.jira.test(jira)
      setJiraTestMsg(result.message)
    } catch (err) {
      setJiraTestMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setJiraTesting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-white/10 bg-surface-900 shadow-panel">
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-semibold">{title}</h2>
            <p className="text-xs text-white/40">{subtitle}</p>
          </div>
          <button type="button" className="btn btn-ghost px-2" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-2 border-b border-white/8 px-5 py-2">
          <button
            type="button"
            className={`rounded-md px-3 py-1 text-sm ${tab === 'project' ? 'bg-accent/15 text-accent' : 'text-white/50'}`}
            onClick={() => setTab('project')}
          >
            Project
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1 text-sm ${tab === 'app' ? 'bg-accent/15 text-accent' : 'text-white/50'}`}
            onClick={() => setTab('app')}
          >
            App settings
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1 text-sm ${tab === 'actions' ? 'bg-accent/15 text-accent' : 'text-white/50'}`}
            onClick={() => setTab('actions')}
          >
            Quick actions
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {tab === 'actions' ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-white/40">
                  Add buttons for URLs, programs, or shell commands. They appear under the dashboard
                  header.
                </p>
                <button
                  type="button"
                  className="btn btn-ghost shrink-0 text-xs"
                  onClick={() => setQuickActions((prev) => [...prev, emptyQuickAction()])}
                >
                  <Plus size={13} />
                  Add
                </button>
              </div>
              {quickActions.length === 0 && (
                <p className="rounded-lg border border-dashed border-white/15 px-3 py-6 text-center text-xs text-white/35">
                  No quick actions yet — click Add to create one
                </p>
              )}
              <div className="space-y-3">
                {quickActions.map((action, i) => (
                  <div
                    key={action.id}
                    className="space-y-2 rounded-lg border border-white/8 bg-surface-950/40 p-3"
                  >
                    <div className="flex gap-2">
                      <input
                        className="input"
                        placeholder="Button label"
                        value={action.label}
                        onChange={(e) => {
                          const next = [...quickActions]
                          next[i] = { ...action, label: e.target.value }
                          setQuickActions(next)
                        }}
                      />
                      <select
                        className="input w-36 shrink-0"
                        value={action.type}
                        onChange={(e) => {
                          const next = [...quickActions]
                          next[i] = {
                            ...action,
                            type: e.target.value as QuickActionType
                          }
                          setQuickActions(next)
                        }}
                      >
                        <option value="url">Open URL</option>
                        <option value="program">Open program</option>
                        <option value="command">Run command</option>
                      </select>
                      <button
                        type="button"
                        className="btn btn-ghost px-2"
                        onClick={() =>
                          setQuickActions((prev) => prev.filter((_, idx) => idx !== i))
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <input
                        className="input font-mono text-xs"
                        placeholder={typeHint(action.type)}
                        value={action.target}
                        onChange={(e) => {
                          const next = [...quickActions]
                          next[i] = { ...action, target: e.target.value }
                          setQuickActions(next)
                        }}
                      />
                      {action.type === 'program' && (
                        <button
                          type="button"
                          className="btn btn-ghost shrink-0"
                          onClick={() =>
                            void pickFile((path) => {
                              const next = [...quickActions]
                              next[i] = { ...action, target: path }
                              setQuickActions(next)
                            })
                          }
                        >
                          <FolderOpen size={15} />
                        </button>
                      )}
                    </div>
                    {action.type === 'program' && (
                      <input
                        className="input font-mono text-xs"
                        placeholder="Optional args"
                        value={action.args ?? ''}
                        onChange={(e) => {
                          const next = [...quickActions]
                          next[i] = { ...action, args: e.target.value }
                          setQuickActions(next)
                        }}
                      />
                    )}
                    {(action.type === 'command' || action.type === 'program') && (
                      <div className="flex gap-2">
                        <input
                          className="input font-mono text-xs"
                          placeholder="Optional working directory"
                          value={action.cwd ?? ''}
                          onChange={(e) => {
                            const next = [...quickActions]
                            next[i] = { ...action, cwd: e.target.value }
                            setQuickActions(next)
                          }}
                        />
                        <button
                          type="button"
                          className="btn btn-ghost shrink-0"
                          onClick={() =>
                            void pickDir((path) => {
                              const next = [...quickActions]
                              next[i] = { ...action, cwd: path }
                              setQuickActions(next)
                            })
                          }
                        >
                          <FolderOpen size={15} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : tab === 'app' ? (
            <>
              <UpdateSection />

              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={autostart}
                  onChange={(e) => setAutostart(e.target.checked)}
                />
                Launch Owling Center when Windows starts
              </label>

              <div className="space-y-3 rounded-lg border border-white/8 bg-surface-950/40 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Jira Cloud</p>
                    <p className="text-xs text-white/40">
                      API token from id.atlassian.com — kept in local app settings
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={jira.enabled}
                      onChange={(e) => setJira({ ...jira, enabled: e.target.checked })}
                    />
                    Enabled
                  </label>
                </div>

                <div>
                  <label className="label">Site URL</label>
                  <input
                    className="input"
                    value={jira.baseUrl}
                    onChange={(e) => setJira({ ...jira, baseUrl: e.target.value })}
                    placeholder="https://your-org.atlassian.net"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label">Email</label>
                    <input
                      className="input"
                      type="email"
                      value={jira.email}
                      onChange={(e) => setJira({ ...jira, email: e.target.value })}
                      placeholder="you@company.com"
                    />
                  </div>
                  <div>
                    <label className="label">API token</label>
                    <input
                      className="input"
                      type="password"
                      value={jira.apiToken}
                      onChange={(e) => setJira({ ...jira, apiToken: e.target.value })}
                      placeholder="••••••••"
                      autoComplete="off"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="btn btn-ghost text-xs"
                    disabled={jiraTesting}
                    onClick={() => void testJira()}
                  >
                    {jiraTesting ? 'Testing…' : 'Test connection'}
                  </button>
                  {jiraTestMsg && (
                    <span className="text-xs text-white/55">{jiraTestMsg}</span>
                  )}
                </div>
              </div>

              <div className="space-y-3 rounded-lg border border-white/8 bg-surface-950/40 p-4">
                <div>
                  <p className="text-sm font-medium">Backup & restore</p>
                  <p className="mt-0.5 text-xs text-white/40">
                    Export projects, settings, quick actions, and todos to a JSON file — or import
                    a previous Owling Center backup (replaces current data).
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-ghost text-xs"
                    disabled={backupBusy}
                    onClick={() => void onExportBackup?.()}
                  >
                    {backupBusy ? 'Working…' : 'Export backup'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost text-xs"
                    disabled={backupBusy}
                    onClick={() => {
                      if (
                        !window.confirm(
                          'Import will replace your current projects and settings in Owling Center. Continue?'
                        )
                      ) {
                        return
                      }
                      void onImportBackup?.()
                    }}
                  >
                    Import backup
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">Name</label>
                  <input
                    className="input"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="Arbio Naturel"
                  />
                </div>
                <div>
                  <label className="label">IDE command</label>
                  <input
                    className="input"
                    value={draft.ideCommand}
                    onChange={(e) => setDraft({ ...draft, ideCommand: e.target.value })}
                    placeholder="code"
                  />
                </div>
              </div>

              <div>
                <label className="label">Root path (optional)</label>
                <div className="flex gap-2">
                  <input
                    className="input"
                    value={draft.rootPath ?? ''}
                    onChange={(e) => setDraft({ ...draft, rootPath: e.target.value })}
                    placeholder="Optional fallback cwd — prefer folders below"
                  />
                  <button
                    type="button"
                    className="btn btn-ghost shrink-0"
                    onClick={() =>
                      void pickDir((path) => setDraft({ ...draft, rootPath: path }))
                    }
                  >
                    <FolderOpen size={15} />
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">Jira project key</label>
                  <input
                    className="input"
                    value={draft.jira?.projectKey ?? ''}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        jira: { ...draft.jira, projectKey: e.target.value.toUpperCase() }
                      })
                    }
                    placeholder="ARB"
                  />
                </div>
                <div>
                  <label className="label">Custom JQL (optional)</label>
                  <input
                    className="input"
                    value={draft.jira?.jql ?? ''}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        jira: {
                          projectKey: draft.jira?.projectKey ?? '',
                          jql: e.target.value
                        }
                      })
                    }
                    placeholder="assignee = currentUser() AND …"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-4 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(draft.services.wamp)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        services: { ...draft.services, wamp: e.target.checked }
                      })
                    }
                  />
                  Start WAMP/XAMPP
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={draft.services.database === 'mysql'}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        services: {
                          ...draft.services,
                          database: e.target.checked ? 'mysql' : null
                        }
                      })
                    }
                  />
                  Start MySQL
                </label>
              </div>

              <div>
                <label className="label">Ports to monitor (comma-separated)</label>
                <input
                  className="input"
                  value={portsText}
                  onChange={(e) => setPortsText(e.target.value)}
                  placeholder="3000, 8000, 3306"
                />
              </div>

              <div>
                <label className="label">Project folders (IDE + Git)</label>
                <p className="mb-2 text-[11px] text-white/35">
                  Add every repo/folder for this project. Each git repo gets its own status on the card.
                </p>
                <div className="mb-2 flex gap-2">
                  <input
                    className="input"
                    value={folderDraft}
                    onChange={(e) => setFolderDraft(e.target.value)}
                    placeholder="C:/projects/backend"
                  />
                  <button
                    type="button"
                    className="btn btn-ghost shrink-0"
                    onClick={() => void pickDir((path) => setFolderDraft(path))}
                  >
                    <FolderOpen size={15} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost shrink-0"
                    onClick={() => {
                      if (!folderDraft.trim()) return
                      setDraft({
                        ...draft,
                        foldersToOpen: [...draft.foldersToOpen, folderDraft.trim()]
                      })
                      setFolderDraft('')
                    }}
                  >
                    <Plus size={15} />
                  </button>
                </div>
                <ul className="space-y-1">
                  {draft.foldersToOpen.map((f, i) => (
                    <li
                      key={`${f}-${i}`}
                      className="flex items-center justify-between rounded-md bg-white/5 px-2 py-1 text-xs"
                    >
                      <span className="truncate">{f}</span>
                      <button
                        type="button"
                        className="text-white/40 hover:text-danger"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            foldersToOpen: draft.foldersToOpen.filter((_, idx) => idx !== i)
                          })
                        }
                      >
                        <Trash2 size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="label mb-0">Background commands</label>
                  <button
                    type="button"
                    className="btn btn-ghost text-xs"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        commands: [...draft.commands, emptyCommand()]
                      })
                    }
                  >
                    <Plus size={13} />
                    Add
                  </button>
                </div>
                <div className="space-y-3">
                  {draft.commands.map((cmd, i) => (
                    <div
                      key={cmd.id}
                      className="space-y-2 rounded-lg border border-white/8 bg-surface-950/40 p-3"
                    >
                      <div className="flex gap-2">
                        <input
                          className="input"
                          placeholder="Name"
                          value={cmd.name}
                          onChange={(e) => {
                            const commands = [...draft.commands]
                            commands[i] = { ...cmd, name: e.target.value }
                            setDraft({ ...draft, commands })
                          }}
                        />
                        <button
                          type="button"
                          className="btn btn-ghost px-2"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              commands: draft.commands.filter((_, idx) => idx !== i)
                            })
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <input
                          className="input"
                          placeholder="Working directory"
                          value={cmd.cwd}
                          onChange={(e) => {
                            const commands = [...draft.commands]
                            commands[i] = { ...cmd, cwd: e.target.value }
                            setDraft({ ...draft, commands })
                          }}
                        />
                        <button
                          type="button"
                          className="btn btn-ghost shrink-0"
                          onClick={() =>
                            void pickDir((path) => {
                              const commands = [...draft.commands]
                              commands[i] = { ...cmd, cwd: path }
                              setDraft({ ...draft, commands })
                            })
                          }
                        >
                          <FolderOpen size={15} />
                        </button>
                      </div>
                      <input
                        className="input font-mono"
                        placeholder="npm run dev"
                        value={cmd.cmd}
                        onChange={(e) => {
                          const commands = [...draft.commands]
                          commands[i] = { ...cmd, cmd: e.target.value }
                          setDraft({ ...draft, commands })
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/8 px-5 py-4">
          {isEdit && onDeleteProject ? (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                void onDeleteProject(draft.id).then(onClose)
              }}
            >
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            {tab === 'app' || tab === 'actions' ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  void onSaveSettings({ autostart, jira, quickActions }).then(onClose)
                }}
              >
                Save settings
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => void saveProject()}>
                Save project
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
