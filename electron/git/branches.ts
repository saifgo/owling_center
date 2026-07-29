import { exec } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'
import { basename, join } from 'path'
import type { BranchCreateResult, BranchCreateRepoResult, Project } from '../../shared/types'
import { getProjectFolders } from '../../shared/projectPaths'

const execAsync = promisify(exec)

async function git(cwd: string, args: string): Promise<string> {
  const { stdout, stderr } = await execAsync(`git ${args}`, {
    cwd,
    windowsHide: true,
    timeout: 60_000
  })
  return `${stdout}${stderr}`.trim()
}

export function branchNameFromIssue(key: string, summary: string): string {
  const slug = summary
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  const base = slug ? `${key}-${slug}` : key
  return base.replace(/\/+/g, '-')
}

async function createBranchInRepo(
  path: string,
  branchName: string,
  baseBranch = 'dev'
): Promise<BranchCreateRepoResult> {
  const label = basename(path.replace(/[\\/]+$/, '')) || path

  if (!existsSync(path)) {
    return { path, label, ok: false, message: 'Path does not exist' }
  }
  if (!existsSync(join(path, '.git'))) {
    return { path, label, ok: false, message: 'Not a git repository' }
  }

  try {
    // Prefer remote base if available, otherwise local base branch
    try {
      await git(path, `fetch origin ${baseBranch}`)
    } catch {
      // offline / no remote — continue with local
    }

    let baseRef = baseBranch
    try {
      await git(path, `rev-parse --verify origin/${baseBranch}`)
      baseRef = `origin/${baseBranch}`
    } catch {
      try {
        await git(path, `rev-parse --verify ${baseBranch}`)
      } catch {
        return {
          path,
          label,
          ok: false,
          message: `Base branch "${baseBranch}" not found (local or origin)`
        }
      }
    }

    // If branch already exists, check it out
    try {
      await git(path, `rev-parse --verify ${branchName}`)
      await git(path, `checkout ${branchName}`)
      return {
        path,
        label,
        ok: true,
        branch: branchName,
        message: `Checked out existing branch ${branchName}`
      }
    } catch {
      // create new
    }

    await git(path, `checkout -b ${branchName} ${baseRef}`)
    return {
      path,
      label,
      ok: true,
      branch: branchName,
      message: `Created ${branchName} from ${baseRef}`
    }
  } catch (err) {
    return {
      path,
      label,
      ok: false,
      message: err instanceof Error ? err.message : String(err)
    }
  }
}

export async function createTicketBranches(
  project: Project,
  issueKey: string,
  summary: string,
  baseBranch = 'dev'
): Promise<BranchCreateResult> {
  const branchName = branchNameFromIssue(issueKey, summary)
  const folders = getProjectFolders(project)
  const results: BranchCreateRepoResult[] = []

  for (const folder of folders) {
    results.push(await createBranchInRepo(folder, branchName, baseBranch))
  }

  return {
    ok: results.some((r) => r.ok),
    branchName,
    results
  }
}
