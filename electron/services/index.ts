import { exec } from 'child_process'
import { existsSync } from 'fs'
import { promisify } from 'util'
import type { ProjectServices } from '../../shared/types'

const execAsync = promisify(exec)

const WAMP_CANDIDATES = [
  'C:\\wamp64\\wampmanager.exe',
  'C:\\wamp\\wampmanager.exe',
  'D:\\wamp64\\wampmanager.exe',
  'D:\\wamp\\wampmanager.exe'
]

const XAMPP_CANDIDATES = [
  'C:\\xampp\\xampp-control.exe',
  'C:\\xampp\\apache_start.bat',
  'D:\\xampp\\xampp-control.exe',
  'D:\\xampp\\apache_start.bat'
]

async function isProcessRunning(name: string): Promise<boolean> {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execAsync(`tasklist /FI "IMAGENAME eq ${name}"`, {
        windowsHide: true
      })
      return stdout.toLowerCase().includes(name.toLowerCase())
    }
    const { stdout } = await execAsync(`pgrep -x ${name}`)
    return Boolean(stdout.trim())
  } catch {
    return false
  }
}

async function startWindowsService(serviceName: string): Promise<string> {
  try {
    await execAsync(`net start ${serviceName}`, { windowsHide: true })
    return `Started Windows service: ${serviceName}`
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.toLowerCase().includes('already been started')) {
      return `Service already running: ${serviceName}`
    }
    throw new Error(`Failed to start ${serviceName}: ${message}`)
  }
}

function findFirstExisting(paths: string[]): string | undefined {
  return paths.find((p) => existsSync(p))
}

export async function ensureServices(
  services: ProjectServices
): Promise<{ messages: string[]; warnings: string[] }> {
  const messages: string[] = []
  const warnings: string[] = []

  if (services.wamp) {
    const apacheRunning =
      (await isProcessRunning('httpd.exe')) || (await isProcessRunning('httpd'))
    if (apacheRunning) {
      messages.push('Apache already running')
    } else {
      const wamp = findFirstExisting(WAMP_CANDIDATES)
      const xampp = findFirstExisting(XAMPP_CANDIDATES)
      if (wamp) {
        exec(`"${wamp}"`, { windowsHide: true })
        messages.push(`Launched WAMP: ${wamp}`)
      } else if (xampp) {
        exec(`"${xampp}"`, { windowsHide: true })
        messages.push(`Launched XAMPP control: ${xampp}`)
      } else {
        warnings.push('WAMP/XAMPP not found in common paths — start Apache manually')
      }
    }
  }

  if (services.database === 'mysql') {
    const mysqlRunning =
      (await isProcessRunning('mysqld.exe')) || (await isProcessRunning('mysqld'))
    if (mysqlRunning) {
      messages.push('MySQL already running')
    } else if (process.platform === 'win32') {
      try {
        messages.push(await startWindowsService('mysql'))
      } catch {
        try {
          messages.push(await startWindowsService('MySQL80'))
        } catch (err) {
          warnings.push(
            err instanceof Error
              ? err.message
              : 'Could not start MySQL service — start it manually'
          )
        }
      }
    } else {
      warnings.push('MySQL auto-start is only implemented for Windows')
    }
  }

  return { messages, warnings }
}
