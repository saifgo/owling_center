import { existsSync } from 'fs'
import type { LaunchResult, Project } from '../../shared/types'
import { getProjectFolders } from '../../shared/projectPaths'
import { checkPorts } from '../ports'
import { ensureServices } from '../services'
import type { ProcessRegistry } from '../process/registry'

export async function launchProject(
  project: Project,
  registry: ProcessRegistry
): Promise<LaunchResult> {
  const warnings: string[] = []
  const folders = getProjectFolders(project)

  if (folders.length === 0 && project.commands.length === 0) {
    return {
      ok: false,
      warnings,
      error: 'Add at least one project folder or background command before launching',
      processes: []
    }
  }

  for (const folder of folders) {
    if (!existsSync(folder)) {
      warnings.push(`Folder missing: ${folder}`)
    }
  }

  if (project.ports.length > 0) {
    const ports = await checkPorts(project.ports)
    const busy = ports.filter((p) => p.inUse)
    for (const p of busy) {
      warnings.push(`Port ${p.port} in use${p.pid ? ` (PID ${p.pid})` : ''}`)
    }
  }

  const serviceResult = await ensureServices(project.services)
  warnings.push(...serviceResult.warnings)
  for (const msg of serviceResult.messages) {
    warnings.push(`Service: ${msg}`)
  }

  const ide = project.ideCommand?.trim() || 'code'
  const ideFolders = project.foldersToOpen.length > 0 ? project.foldersToOpen : folders
  for (const folder of ideFolders) {
    if (!existsSync(folder)) {
      warnings.push(`Folder not found, skipped IDE open: ${folder}`)
      continue
    }
    try {
      registry.spawnDetached(ide, [folder])
    } catch (err) {
      warnings.push(
        `Failed to open IDE for ${folder}: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  const fallbackCwd = folders[0] || project.rootPath || process.cwd()
  const processes: LaunchResult['processes'] = []
  for (const command of project.commands) {
    const cwd = command.cwd || fallbackCwd
    if (!existsSync(cwd)) {
      warnings.push(`Command cwd missing (${command.name}): ${cwd}`)
      continue
    }
    try {
      const info = registry.spawnCommand(project.id, command.name, command.cmd, cwd)
      processes.push(info)
    } catch (err) {
      warnings.push(
        `Failed to start ${command.name}: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  return {
    ok: true,
    warnings,
    processes
  }
}
