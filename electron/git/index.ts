import { exec } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'
import { basename, join } from 'path'
import type { GitStatus } from '../../shared/types'

const execAsync = promisify(exec)

async function git(cwd: string, args: string): Promise<string> {
  const { stdout } = await execAsync(`git ${args}`, {
    cwd,
    windowsHide: true,
    timeout: 8000
  })
  return stdout.trim()
}

function labelFor(path: string): string {
  return basename(path.replace(/[\\/]+$/, '')) || path
}

export async function getGitStatus(path: string): Promise<GitStatus> {
  const label = labelFor(path)

  if (!existsSync(path)) {
    return {
      path,
      label,
      branch: '—',
      dirtyCount: 0,
      ahead: 0,
      behind: 0,
      error: 'Path does not exist'
    }
  }

  if (!existsSync(join(path, '.git'))) {
    return {
      path,
      label,
      branch: '—',
      dirtyCount: 0,
      ahead: 0,
      behind: 0,
      error: 'Not a git repository'
    }
  }

  try {
    const branch = await git(path, 'rev-parse --abbrev-ref HEAD')
    const statusPorcelain = await git(path, 'status --porcelain')
    const dirtyCount = statusPorcelain
      ? statusPorcelain.split(/\r?\n/).filter(Boolean).length
      : 0

    let ahead = 0
    let behind = 0
    try {
      const counts = await git(path, 'rev-list --left-right --count @{upstream}...HEAD')
      const [behindStr, aheadStr] = counts.split(/\s+/)
      behind = Number(behindStr) || 0
      ahead = Number(aheadStr) || 0
    } catch {
      // no upstream configured
    }

    return { path, label, branch, dirtyCount, ahead, behind }
  } catch (err) {
    return {
      path,
      label,
      branch: '—',
      dirtyCount: 0,
      ahead: 0,
      behind: 0,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

export async function getGitStatuses(paths: string[]): Promise<GitStatus[]> {
  const unique = [...new Set(paths.filter(Boolean))]
  return Promise.all(unique.map(getGitStatus))
}
