import { writeFileSync, readFileSync } from 'fs'
import { dialog, BrowserWindow, app } from 'electron'
import type { AppSettings, BackupResult, DevCenterBackup, Project } from '../../shared/types'
import { getProjects, saveProjects, getSettings, saveSettings } from '../store'
import {
  listTodos,
  listSessionNotes,
  replaceAllTodos,
  replaceAllSessionNotes
} from '../db'

function buildBackup(): DevCenterBackup {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    app: 'devcenter',
    projects: getProjects(),
    settings: getSettings(),
    todos: listTodos(),
    sessionNotes: listSessionNotes()
  }
}

function isBackup(data: unknown): data is DevCenterBackup {
  if (!data || typeof data !== 'object') return false
  const obj = data as Record<string, unknown>
  return (
    (obj.version === 1 || obj.app === 'devcenter') &&
    Array.isArray(obj.projects) &&
    obj.settings !== null &&
    typeof obj.settings === 'object'
  )
}

export async function exportBackup(): Promise<BackupResult> {
  try {
    const win = BrowserWindow.getFocusedWindow()
    const stamp = new Date().toISOString().slice(0, 10)
    const result = win
      ? await dialog.showSaveDialog(win, {
          title: 'Export Owling Center backup',
          defaultPath: `owling-center-backup-${stamp}.json`,
          filters: [{ name: 'JSON', extensions: ['json'] }]
        })
      : await dialog.showSaveDialog({
          title: 'Export Owling Center backup',
          defaultPath: `owling-center-backup-${stamp}.json`,
          filters: [{ name: 'JSON', extensions: ['json'] }]
        })

    if (result.canceled || !result.filePath) {
      return { ok: false, message: 'Export cancelled' }
    }

    const backup = buildBackup()
    writeFileSync(result.filePath, JSON.stringify(backup, null, 2), 'utf-8')
    return {
      ok: true,
      message: `Backup saved (${backup.projects.length} project(s))`,
      path: result.filePath
    }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err)
    }
  }
}

export async function importBackup(): Promise<BackupResult> {
  try {
    const win = BrowserWindow.getFocusedWindow()
    const result = win
      ? await dialog.showOpenDialog(win, {
          title: 'Import Owling Center backup',
          properties: ['openFile'],
          filters: [{ name: 'JSON', extensions: ['json'] }]
        })
      : await dialog.showOpenDialog({
          title: 'Import Owling Center backup',
          properties: ['openFile'],
          filters: [{ name: 'JSON', extensions: ['json'] }]
        })

    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false, message: 'Import cancelled' }
    }

    const raw = readFileSync(result.filePaths[0], 'utf-8')
    const parsed: unknown = JSON.parse(raw)

    if (!isBackup(parsed)) {
      return {
        ok: false,
        message: 'Invalid backup file (expected Owling Center projects + settings)'
      }
    }

    const projects = parsed.projects as Project[]
    const settings = saveSettings(parsed.settings as AppSettings)
    saveProjects(projects)

    if (Array.isArray(parsed.todos)) {
      replaceAllTodos(parsed.todos)
    }
    if (Array.isArray(parsed.sessionNotes)) {
      replaceAllSessionNotes(parsed.sessionNotes)
    }

    app.setLoginItemSettings({
      openAtLogin: settings.autostart,
      path: process.execPath
    })

    return {
      ok: true,
      message: `Imported ${projects.length} project(s) and settings`,
      path: result.filePaths[0],
      data: { projects, settings }
    }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err)
    }
  }
}
