import { exec } from 'child_process'
import { promisify } from 'util'
import type { PortStatus } from '../../shared/types'

const execAsync = promisify(exec)

export async function checkPort(port: number): Promise<PortStatus> {
  if (process.platform === 'win32') {
    try {
      const { stdout } = await execAsync(`netstat -ano | findstr :${port}`, {
        windowsHide: true
      })
      const lines = stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.includes('LISTENING'))
      if (lines.length === 0) {
        return { port, inUse: false }
      }
      const parts = lines[0].split(/\s+/)
      const pid = Number(parts[parts.length - 1])
      return { port, inUse: true, pid: Number.isFinite(pid) ? pid : undefined }
    } catch {
      return { port, inUse: false }
    }
  }

  try {
    const { stdout } = await execAsync(`lsof -i :${port} -sTCP:LISTEN -t`)
    const pid = Number(stdout.trim().split(/\n/)[0])
    return {
      port,
      inUse: Boolean(pid),
      pid: Number.isFinite(pid) ? pid : undefined
    }
  } catch {
    return { port, inUse: false }
  }
}

export async function checkPorts(ports: number[]): Promise<PortStatus[]> {
  return Promise.all(ports.map(checkPort))
}

export async function forceFreePort(port: number): Promise<{ ok: boolean; message: string }> {
  const status = await checkPort(port)
  if (!status.inUse) {
    return { ok: true, message: `Port ${port} is already free` }
  }
  if (!status.pid) {
    return { ok: false, message: `Port ${port} is in use but PID could not be resolved` }
  }

  try {
    if (process.platform === 'win32') {
      await execAsync(`taskkill /PID ${status.pid} /F /T`, { windowsHide: true })
    } else {
      await execAsync(`kill -9 ${status.pid}`)
    }
    return { ok: true, message: `Freed port ${port} (killed PID ${status.pid})` }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, message: `Failed to free port ${port}: ${message}` }
  }
}
