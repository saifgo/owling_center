import Store from 'electron-store'
import type { AppSettings, Project, QuickAction } from '../shared/types'

export interface StoreSchema {
  projects: Project[]
  settings: AppSettings
}

const defaultSettings: AppSettings = {
  autostart: false,
  jira: {
    enabled: false,
    baseUrl: '',
    email: '',
    apiToken: ''
  },
  quickActions: []
}

const store = new Store<StoreSchema>({
  name: 'devcenter',
  defaults: {
    projects: [],
    settings: defaultSettings
  }
})

export function getProjects(): Project[] {
  return store.get('projects')
}

export function saveProjects(projects: Project[]): Project[] {
  store.set('projects', projects)
  return projects
}

export function getProject(id: string): Project | undefined {
  return getProjects().find((p) => p.id === id)
}

export function upsertProject(project: Project): Project[] {
  const projects = getProjects()
  const idx = projects.findIndex((p) => p.id === project.id)
  if (idx >= 0) {
    projects[idx] = project
  } else {
    projects.push(project)
  }
  return saveProjects(projects)
}

export function deleteProject(id: string): Project[] {
  return saveProjects(getProjects().filter((p) => p.id !== id))
}

function normalizeQuickActions(actions: QuickAction[] | undefined): QuickAction[] {
  if (!Array.isArray(actions)) return []
  return actions
    .filter((a) => a && a.label?.trim() && a.target?.trim())
    .map((a) => ({
      id: a.id,
      label: a.label.trim(),
      type: a.type === 'program' || a.type === 'command' ? a.type : 'url',
      target: a.target.trim(),
      args: a.args?.trim() || undefined,
      cwd: a.cwd?.trim() || undefined
    }))
}

export function getSettings(): AppSettings {
  const settings = store.get('settings')
  return {
    ...defaultSettings,
    ...settings,
    jira: {
      ...defaultSettings.jira,
      ...(settings.jira ?? {})
    },
    quickActions: normalizeQuickActions(settings.quickActions)
  }
}

export function saveSettings(settings: AppSettings): AppSettings {
  const normalized: AppSettings = {
    autostart: settings.autostart,
    jira: {
      enabled: Boolean(settings.jira?.enabled),
      baseUrl: (settings.jira?.baseUrl ?? '').trim().replace(/\/+$/, ''),
      email: (settings.jira?.email ?? '').trim(),
      apiToken: (settings.jira?.apiToken ?? '').trim()
    },
    quickActions: normalizeQuickActions(settings.quickActions)
  }
  store.set('settings', normalized)
  return normalized
}

export default store
