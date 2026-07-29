import { ipcMain, app, dialog, BrowserWindow } from 'electron'
import type { Project, AppSettings, JiraSettings, JiraAssigneeFilter } from '../../shared/types'
import { getProjects, upsertProject, deleteProject, getProject, getSettings, saveSettings } from '../store'
import { ProcessRegistry } from '../process/registry'
import { launchProject } from '../process/launcher'
import { checkPorts, forceFreePort } from '../ports'
import { getGitStatus, getGitStatuses } from '../git'
import { createTicketBranches } from '../git/branches'
import { runQuickAction } from '../quickActions'
import { exportBackup, importBackup } from '../backup'
import {
  listTodos,
  addTodo,
  toggleTodo,
  deleteTodo,
  listSessionNotes,
  addSessionNote,
  deleteSessionNote
} from '../db'
import {
  testJiraConnection,
  searchProjectIssues,
  createIssueFromNote,
  openIssueInBrowser,
  transitionToInProgress,
  transitionToInReview
} from '../jira/client'

let registry: ProcessRegistry | null = null

export function setRegistry(r: ProcessRegistry): void {
  registry = r
}

function requireRegistry(): ProcessRegistry {
  if (!registry) throw new Error('Process registry not initialized')
  return registry
}

export function registerIpcHandlers(): void {
  ipcMain.handle('projects:list', () => getProjects())

  ipcMain.handle('projects:upsert', (_e, project: Project) => upsertProject(project))

  ipcMain.handle('projects:delete', (_e, id: string) => deleteProject(id))

  ipcMain.handle('projects:get', (_e, id: string) => getProject(id))

  ipcMain.handle('dialog:selectDirectory', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const result = win
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('dialog:selectFile', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const result = win
      ? await dialog.showOpenDialog(win, {
          properties: ['openFile'],
          filters: [
            { name: 'Executables', extensions: ['exe', 'bat', 'cmd', 'ps1', 'lnk'] },
            { name: 'All files', extensions: ['*'] }
          ]
        })
      : await dialog.showOpenDialog({
          properties: ['openFile'],
          filters: [
            { name: 'Executables', extensions: ['exe', 'bat', 'cmd', 'ps1', 'lnk'] },
            { name: 'All files', extensions: ['*'] }
          ]
        })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('quickActions:run', async (_e, actionId: string) => runQuickAction(actionId))

  ipcMain.handle('process:launch', async (_e, projectId: string) => {
    const project = getProject(projectId)
    if (!project) {
      return { ok: false, warnings: [], error: 'Project not found', processes: [] }
    }
    return launchProject(project, requireRegistry())
  })

  ipcMain.handle('process:stopProject', async (_e, projectId: string) => {
    return requireRegistry().stopProject(projectId)
  })

  ipcMain.handle('process:stopAll', async () => {
    return requireRegistry().stopAll()
  })

  ipcMain.handle('process:stop', async (_e, processId: string) => {
    return requireRegistry().stop(processId)
  })

  ipcMain.handle('process:list', (_e, projectId?: string) => {
    return requireRegistry().list(projectId)
  })

  ipcMain.handle('ports:check', async (_e, ports: number[]) => checkPorts(ports))

  ipcMain.handle('ports:forceFree', async (_e, port: number) => forceFreePort(port))

  ipcMain.handle('git:status', async (_e, path: string) => getGitStatus(path))

  ipcMain.handle('git:statuses', async (_e, paths: string[]) => getGitStatuses(paths))

  ipcMain.handle('todos:list', (_e, projectId?: string) => listTodos(projectId))

  ipcMain.handle('todos:add', (_e, projectId: string, text: string) => addTodo(projectId, text))

  ipcMain.handle('todos:toggle', (_e, id: string) => toggleTodo(id))

  ipcMain.handle('todos:delete', (_e, id: string) => deleteTodo(id))

  ipcMain.handle('notes:list', (_e, projectId: string) => listSessionNotes(projectId))

  ipcMain.handle('notes:add', (_e, projectId: string, text: string) =>
    addSessionNote(projectId, text)
  )

  ipcMain.handle('notes:delete', (_e, id: string) => deleteSessionNote(id))

  ipcMain.handle('settings:get', () => getSettings())

  ipcMain.handle('settings:save', (_e, settings: AppSettings) => {
    const saved = saveSettings(settings)
    app.setLoginItemSettings({
      openAtLogin: saved.autostart,
      path: process.execPath
    })
    return saved
  })

  ipcMain.handle('backup:export', async () => exportBackup())

  ipcMain.handle('backup:import', async () => importBackup())

  ipcMain.handle('jira:test', async (_e, jira?: JiraSettings) => {
    if (jira) {
      return testJiraConnection({ ...getSettings(), jira })
    }
    return testJiraConnection()
  })

  ipcMain.handle(
    'jira:issues',
    async (_e, projectId: string, filter: JiraAssigneeFilter = 'mine') => {
      const project = getProject(projectId)
      if (!project) throw new Error('Project not found')
      return searchProjectIssues(project, filter)
    }
  )

  ipcMain.handle(
    'jira:createFromNote',
    async (_e, projectId: string, summary: string, description?: string) => {
      const project = getProject(projectId)
      if (!project) return { ok: false, error: 'Project not found' }
      return createIssueFromNote(project, summary, description)
    }
  )

  ipcMain.handle('jira:open', async (_e, url: string) => {
    await openIssueInBrowser(url)
  })

  ipcMain.handle(
    'jira:createBranches',
    async (_e, projectId: string, issueKey: string, summary: string) => {
      const project = getProject(projectId)
      if (!project) {
        return { ok: false, branchName: '', results: [] }
      }
      const branchResult = await createTicketBranches(project, issueKey, summary, 'dev')
      let transition
      if (branchResult.ok) {
        transition = await transitionToInProgress(issueKey)
      }
      return { ...branchResult, transition }
    }
  )

  ipcMain.handle('jira:moveToInProgress', async (_e, issueKey: string) => {
    return transitionToInProgress(issueKey)
  })

  ipcMain.handle('jira:moveToInReview', async (_e, issueKey: string) => {
    return transitionToInReview(issueKey)
  })
}
