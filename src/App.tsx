import { useEffect, useMemo, useState } from 'react'
import { Plus, Settings } from 'lucide-react'
import { Sidebar } from './components/Sidebar'
import { ProjectCard } from './components/ProjectCard'
import { LogDrawer } from './components/LogDrawer'
import { SettingsModal } from './components/SettingsModal'
import { ClaudeUsagePage } from './components/ClaudeUsagePage'
import { ClaudePage } from './components/ClaudePage'
import { QuickActionsBar } from './components/QuickActionsBar'
import { useProjects } from './hooks/useProjects'
import { useProcessEngine } from './hooks/useProcessEngine'
import { usePortHealth } from './hooks/usePortHealth'
import { useGitStatus } from './hooks/useGitStatus'
import { useTodos } from './hooks/useTodos'
import { useJira } from './hooks/useJira'
import { useUiStore } from './store/uiStore'
import { getProjectFolders } from '../shared/projectPaths'
import type { AppSettings } from '../shared/types'

const defaultSettings: AppSettings = {
  autostart: false,
  jira: { enabled: false, baseUrl: '', email: '', apiToken: '' },
  quickActions: []
}

export default function App(): React.JSX.Element {
  const {
    projects,
    selectedProjectId,
    selectProject,
    upsert,
    remove,
    refresh: refreshProjects
  } = useProjects()

  const { processes, logs, launch, stopProject, stopProcess, stopAll, clearLogs, clearProcessLogs } =
    useProcessEngine()

  const logDrawerOpen = useUiStore((s) => s.logDrawerOpen)
  const setLogDrawerOpen = useUiStore((s) => s.setLogDrawerOpen)
  const logDock = useUiStore((s) => s.logDock)
  const setLogDock = useUiStore((s) => s.setLogDock)
  const logDockHeight = useUiStore((s) => s.logDockHeight)
  const logDockWidth = useUiStore((s) => s.logDockWidth)
  const setLogDockHeight = useUiStore((s) => s.setLogDockHeight)
  const setLogDockWidth = useUiStore((s) => s.setLogDockWidth)
  const settingsOpen = useUiStore((s) => s.settingsOpen)
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen)
  const editingProject = useUiStore((s) => s.editingProject)
  const setEditingProject = useUiStore((s) => s.setEditingProject)
  const toast = useUiStore((s) => s.toast)
  const setToast = useUiStore((s) => s.setToast)
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed)
  const setSidebarCollapsed = useUiStore((s) => s.setSidebarCollapsed)

  const [appSettings, setAppSettings] = useState<AppSettings>(defaultSettings)
  const [settingsTab, setSettingsTab] = useState<'project' | 'app' | 'actions'>('project')
  const [creatingBranches, setCreatingBranches] = useState(false)
  const [transitioning, setTransitioning] = useState(false)
  const [backupBusy, setBackupBusy] = useState(false)
  const [view, setView] = useState<'dashboard' | 'usage' | 'claude'>('dashboard')

  const {
    todos,
    notes,
    addTodo,
    toggleTodo,
    deleteTodo,
    addNote,
    deleteNote
  } = useTodos(selectedProjectId)

  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null
  const {
    issues: jiraIssues,
    loading: jiraLoading,
    error: jiraError,
    assigneeFilter: jiraAssigneeFilter,
    setAssigneeFilter: setJiraAssigneeFilter,
    refresh: refreshJira,
    openIssue,
    createFromNote,
    createBranches,
    moveToInProgress,
    moveToInReview
  } = useJira(
    selectedProjectId,
    Boolean(appSettings.jira?.enabled),
    selectedProject?.jira?.projectKey
  )

  const allPorts = useMemo(
    () => [...new Set(projects.flatMap((p) => p.ports))],
    [projects]
  )
  const { statuses: portStatuses, forceFree } = usePortHealth(allPorts)

  const gitPaths = useMemo(
    () => [...new Set(projects.flatMap((p) => getProjectFolders(p)))],
    [projects]
  )
  const { byPath: gitByPath } = useGitStatus(gitPaths)

  useEffect(() => {
    void window.devcenter.settings.get().then(setAppSettings)
  }, [])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(id)
  }, [toast, setToast])

  const openNew = (): void => {
    setEditingProject(null)
    setSettingsTab('project')
    setSettingsOpen(true)
  }

  const openEdit = (id: string): void => {
    const project = projects.find((p) => p.id === id) ?? null
    setEditingProject(project)
    setSettingsTab('project')
    setSettingsOpen(true)
  }

  const openAppSettings = (): void => {
    setEditingProject(null)
    setSettingsTab('app')
    setSettingsOpen(true)
  }

  const openQuickActions = (): void => {
    setEditingProject(null)
    setSettingsTab('actions')
    setSettingsOpen(true)
  }

  const logDrawer = (
    <LogDrawer
      open={logDrawerOpen}
      dock={logDock}
      size={logDock === 'bottom' ? logDockHeight : logDockWidth}
      onToggle={() => setLogDrawerOpen(!logDrawerOpen)}
      onDock={setLogDock}
      onResize={logDock === 'bottom' ? setLogDockHeight : setLogDockWidth}
      logs={logs}
      processes={processes}
      projects={projects}
      onStopAll={() => void stopAll()}
      onStopProcess={(processId) => void stopProcess(processId)}
      onClear={() => clearLogs()}
      onClearProcess={clearProcessLogs}
    />
  )

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed(!sidebarCollapsed)}
          projects={projects}
          selectedProjectId={selectedProjectId}
          onSelect={(id) => {
            selectProject(id)
            if (view !== 'claude') setView('dashboard')
          }}
          todos={todos}
          notes={notes}
          onAddTodo={addTodo}
          onToggleTodo={toggleTodo}
          onDeleteTodo={deleteTodo}
          onAddNote={addNote}
          onDeleteNote={deleteNote}
          jiraEnabled={Boolean(appSettings.jira?.enabled)}
          jiraIssues={jiraIssues}
          jiraLoading={jiraLoading}
          jiraError={jiraError}
          jiraAssigneeFilter={jiraAssigneeFilter}
          onJiraFilterChange={setJiraAssigneeFilter}
          onRefreshJira={refreshJira}
          onOpenJiraIssue={openIssue}
          creatingBranches={creatingBranches}
          transitioning={transitioning}
          usageActive={view === 'usage'}
          onOpenUsage={() => setView('usage')}
          claudeActive={view === 'claude'}
          onOpenClaude={() => setView('claude')}
          onOpenDashboard={() => setView('dashboard')}
          onCreateBranches={async (issue) => {
            setCreatingBranches(true)
            try {
              const result = await createBranches(issue.key, issue.summary)
              const okCount = result.results.filter((r) => r.ok).length
              const fail = result.results.filter((r) => !r.ok)
              if (result.ok) {
                const branchMsg =
                  fail.length === 0
                    ? `Branch ${result.branchName} ready in ${okCount} repo(s)`
                    : `Branch ${result.branchName}: ${okCount} ok, ${fail.length} failed`
                const statusMsg = result.transition?.ok
                  ? ` · ${result.transition.message}`
                  : result.transition
                    ? ` · status: ${result.transition.message}`
                    : ''
                setToast(`${branchMsg}${statusMsg}`)
              } else {
                setToast(fail[0]?.message ?? 'Could not create branches')
              }
            } finally {
              setCreatingBranches(false)
            }
          }}
          onMoveToInProgress={async (issue) => {
            setTransitioning(true)
            try {
              const result = await moveToInProgress(issue.key)
              setToast(result.message)
            } finally {
              setTransitioning(false)
            }
          }}
          onMoveToInReview={async (issue) => {
            setTransitioning(true)
            try {
              const result = await moveToInReview(issue.key)
              setToast(result.message)
            } finally {
              setTransitioning(false)
            }
          }}
          onCreateJiraFromNote={async (text) => {
            const summary = text.split(/\r?\n/).find((l) => l.trim())?.trim() ?? text
            const result = await createFromNote(summary, text)
            setToast(result.message)
          }}
        />

        {view === 'usage' ? (
          <ClaudeUsagePage active={view === 'usage'} onOpenSettings={openAppSettings} />
        ) : view === 'claude' ? (
          <ClaudePage
            project={selectedProject}
            folder={selectedProject ? getProjectFolders(selectedProject)[0] : undefined}
            branch={
              selectedProject
                ? gitByPath[getProjectFolders(selectedProject)[0] ?? '']?.branch
                : undefined
            }
          />
        ) : (
        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-4 py-4 sm:px-6">
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight">Dashboard</h1>
              <p className="text-sm text-white/45">
                Launch stacks, watch ports & git, keep session tasks close.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={openAppSettings}
                title="App settings"
              >
                <Settings size={15} />
              </button>
              <button type="button" className="btn btn-primary" onClick={openNew}>
                <Plus size={15} />
                Add project
              </button>
            </div>
          </header>

          <QuickActionsBar
            actions={appSettings.quickActions ?? []}
            onManage={openQuickActions}
            onRun={(action) => {
              void window.devcenter.quickActions.run(action.id).then((result) => {
                setToast(result.message)
              })
            }}
          />

          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {projects.length === 0 ? (
              <div className="flex h-full min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-6 text-center">
                <p className="font-display text-xl font-semibold">No projects yet</p>
                <p className="mt-2 max-w-md text-sm text-white/45">
                  Add a project with its folders, ports, and startup commands to build your
                  control center.
                </p>
                <button type="button" className="btn btn-primary mt-5" onClick={openNew}>
                  <Plus size={15} />
                  Add your first project
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))] gap-4">
                {projects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    selected={selectedProjectId === project.id}
                    processes={processes.filter((p) => p.projectId === project.id)}
                    gitStatuses={getProjectFolders(project)
                      .map((path) => gitByPath[path])
                      .filter((g): g is NonNullable<typeof g> => Boolean(g))}
                    ports={portStatuses.filter((s) => project.ports.includes(s.port))}
                    onSelect={() => selectProject(project.id)}
                    onLaunch={() => void launch(project.id)}
                    onStop={() => void stopProject(project.id)}
                    onEdit={() => openEdit(project.id)}
                    onForceFree={(port) => {
                      void forceFree(port).then((msg) => setToast(msg))
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </main>
        )}
        {logDock === 'right' && logDrawer}
      </div>

      {logDock === 'bottom' && logDrawer}

      <SettingsModal
        open={settingsOpen}
        project={editingProject}
        settings={appSettings}
        initialTab={settingsTab}
        backupBusy={backupBusy}
        onClose={() => setSettingsOpen(false)}
        onSaveProject={upsert}
        onDeleteProject={remove}
        onSaveSettings={async (s) => {
          const saved = await window.devcenter.settings.save(s)
          setAppSettings(saved)
          setToast(
            saved.jira.enabled
              ? 'Settings saved · Jira enabled'
              : saved.autostart
                ? 'Autostart enabled'
                : 'Settings saved'
          )
        }}
        onExportBackup={async () => {
          setBackupBusy(true)
          try {
            const result = await window.devcenter.backup.export()
            setToast(result.message)
          } finally {
            setBackupBusy(false)
          }
        }}
        onImportBackup={async () => {
          setBackupBusy(true)
          try {
            const result = await window.devcenter.backup.import()
            setToast(result.message)
            if (result.ok && result.data) {
              setAppSettings(result.data.settings)
              await refreshProjects()
            }
          } finally {
            setBackupBusy(false)
          }
        }}
      />

      {toast && (
        <div
          className="pointer-events-none fixed left-1/2 z-50 -translate-x-1/2 rounded-lg border border-white/10 bg-surface-800 px-4 py-2 text-sm shadow-panel"
          style={{
            bottom: logDock === 'bottom' ? (logDrawerOpen ? logDockHeight + 16 : 60) : 24
          }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}
