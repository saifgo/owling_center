import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { shell } from 'electron'
import type { QuickAction, QuickActionResult } from '../../shared/types'
import { getSettings } from '../store'

function splitArgs(args?: string): string[] {
  if (!args?.trim()) return []
  const matches = args.match(/"[^"]+"|'[^']+'|\S+/g) ?? []
  return matches.map((m) => m.replace(/^["']|["']$/g, ''))
}

function spawnDetached(
  command: string,
  args: string[],
  options: { cwd?: string; shell?: boolean }
): void {
  const child = spawn(command, args, {
    cwd: options.cwd,
    shell: options.shell ?? false,
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  })
  child.on('error', () => undefined)
  child.unref()
}

export async function runQuickAction(actionId: string): Promise<QuickActionResult> {
  const action = getSettings().quickActions.find((a) => a.id === actionId)
  if (!action) {
    return { ok: false, message: 'Quick action not found' }
  }
  return executeQuickAction(action)
}

export async function executeQuickAction(action: QuickAction): Promise<QuickActionResult> {
  try {
    if (action.type === 'url') {
      const url = action.target.trim()
      if (!/^https?:\/\//i.test(url)) {
        return { ok: false, message: 'URL must start with http:// or https://' }
      }
      await shell.openExternal(url)
      return { ok: true, message: `Opened ${action.label}` }
    }

    if (action.type === 'program') {
      const target = action.target.trim()
      const args = splitArgs(action.args)
      if (action.cwd && !existsSync(action.cwd)) {
        return { ok: false, message: `Working directory not found: ${action.cwd}` }
      }

      if (args.length === 0 && existsSync(target)) {
        const openErr = await shell.openPath(target)
        if (openErr) {
          spawnDetached(target, [], { cwd: action.cwd, shell: true })
        }
      } else {
        spawnDetached(target, args, {
          cwd: action.cwd,
          shell: !existsSync(target)
        })
      }
      return { ok: true, message: `Launched ${action.label}` }
    }

    if (action.cwd && !existsSync(action.cwd)) {
      return { ok: false, message: `Working directory not found: ${action.cwd}` }
    }
    spawnDetached(action.target, [], { cwd: action.cwd, shell: true })
    return { ok: true, message: `Ran ${action.label}` }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err)
    }
  }
}
