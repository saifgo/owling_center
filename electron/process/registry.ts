import { ChildProcess, spawn } from 'child_process'
import { randomUUID } from 'crypto'
import kill from 'tree-kill'
import type { BrowserWindow } from 'electron'
import type { LogChunk, ProcessInfo } from '../../shared/types'

interface TrackedProcess {
  info: ProcessInfo
  child: ChildProcess
}

export class ProcessRegistry {
  private processes = new Map<string, TrackedProcess>()
  private getWindow: () => BrowserWindow | null

  constructor(getWindow: () => BrowserWindow | null) {
    this.getWindow = getWindow
  }

  list(projectId?: string): ProcessInfo[] {
    const all = [...this.processes.values()].map((p) => p.info)
    return projectId ? all.filter((p) => p.projectId === projectId) : all
  }

  private emit(channel: string, payload: unknown): void {
    const win = this.getWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  }

  private emitLog(chunk: LogChunk): void {
    this.emit('process:log', chunk)
    this.emit('process:event', { type: 'log', chunk })
  }

  spawnCommand(
    projectId: string,
    name: string,
    cmd: string,
    cwd: string
  ): ProcessInfo {
    const id = randomUUID()
    const child = spawn(cmd, {
      cwd,
      shell: true,
      env: { ...process.env, FORCE_COLOR: '0' },
      windowsHide: true
    })

    const info: ProcessInfo = {
      id,
      projectId,
      name,
      pid: child.pid ?? -1,
      cmd,
      cwd,
      startedAt: new Date().toISOString()
    }

    this.processes.set(id, { info, child })

    const forward = (stream: 'stdout' | 'stderr') => (data: Buffer): void => {
      this.emitLog({
        projectId,
        processId: id,
        processName: name,
        stream,
        text: data.toString(),
        timestamp: new Date().toISOString()
      })
    }

    child.stdout?.on('data', forward('stdout'))
    child.stderr?.on('data', forward('stderr'))

    child.on('error', (err) => {
      this.emitLog({
        projectId,
        processId: id,
        processName: name,
        stream: 'system',
        text: `Process error: ${err.message}\n`,
        timestamp: new Date().toISOString()
      })
    })

    child.on('exit', (code) => {
      this.processes.delete(id)
      this.emit('process:event', {
        type: 'exited',
        processId: id,
        projectId,
        code
      })
      this.emitLog({
        projectId,
        processId: id,
        processName: name,
        stream: 'system',
        text: `Process exited with code ${code ?? 'null'}\n`,
        timestamp: new Date().toISOString()
      })
    })

    this.emit('process:event', { type: 'started', process: info })
    this.emitLog({
      projectId,
      processId: id,
      processName: name,
      stream: 'system',
      text: `Started: ${cmd} (cwd: ${cwd})\n`,
      timestamp: new Date().toISOString()
    })

    return info
  }

  spawnDetached(cmd: string, args: string[] = [], cwd?: string): void {
    const child = spawn(cmd, args, {
      cwd,
      shell: true,
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    })
    child.unref()
  }

  async stop(processId: string): Promise<boolean> {
    const tracked = this.processes.get(processId)
    if (!tracked) return false
    await this.killPid(tracked.info.pid)
    this.processes.delete(processId)
    return true
  }

  async stopProject(projectId: string): Promise<number> {
    const ids = [...this.processes.values()]
      .filter((p) => p.info.projectId === projectId)
      .map((p) => p.info.id)
    for (const id of ids) {
      await this.stop(id)
    }
    return ids.length
  }

  async stopAll(): Promise<number> {
    const ids = [...this.processes.keys()]
    for (const id of ids) {
      await this.stop(id)
    }
    return ids.length
  }

  private killPid(pid: number): Promise<void> {
    if (!pid || pid < 0) return Promise.resolve()
    return new Promise((resolve) => {
      kill(pid, 'SIGTERM', (err) => {
        if (err) {
          kill(pid, 'SIGKILL', () => resolve())
        } else {
          resolve()
        }
      })
    })
  }
}
