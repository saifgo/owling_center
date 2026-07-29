import type { Project } from './types'

/** Unique folders used for Git + display (multi-repo projects). */
export function getProjectFolders(project: Project): string[] {
  const paths = [...(project.foldersToOpen ?? []), project.rootPath ?? '']
  return [...new Set(paths.map((p) => p.trim()).filter(Boolean))]
}

export function folderLabel(path: string): string {
  const normalized = path.replace(/[\\/]+$/, '')
  const parts = normalized.split(/[\\/]/)
  return parts[parts.length - 1] || path
}
