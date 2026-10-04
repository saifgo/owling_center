import { app, ipcMain, type WebContents } from 'electron'
import electronUpdater, {
  type ProgressInfo,
  type UpdateDownloadedEvent
} from 'electron-updater'
import type {
  AppUpdateCheck,
  AppUpdateDownloadResult,
  AppUpdatePhase,
  AppUpdateProgress,
  AppUpdateStatus
} from '../shared/types'

const { autoUpdater, CancellationToken } = electronUpdater

let registered = false
let phase: AppUpdatePhase = 'idle'
let remoteVersion: string | undefined
let progress: AppUpdateProgress | undefined
let lastError: string | undefined
let downloading = false
let cancelRequested = false
let activeToken: InstanceType<typeof CancellationToken> | null = null
let onProgress: ((info: ProgressInfo) => void) | null = null
let onDownloaded: ((event: UpdateDownloadedEvent) => void) | null = null

function toProgress(info: ProgressInfo): AppUpdateProgress {
  return {
    percent: info.percent,
    transferred: info.transferred,
    total: info.total,
    bytesPerSecond: info.bytesPerSecond
  }
}

function status(): AppUpdateStatus {
  return {
    currentVersion: app.getVersion(),
    packaged: app.isPackaged,
    phase,
    version: remoteVersion,
    progress,
    error: lastError
  }
}

function send(sender: WebContents, channel: string, payload: unknown): void {
  if (sender.isDestroyed()) return
  sender.send(channel, payload)
}

function detachDownloadListeners(): void {
  if (onProgress) autoUpdater.off('download-progress', onProgress)
  if (onDownloaded) autoUpdater.off('update-downloaded', onDownloaded)
  onProgress = null
  onDownloaded = null
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export function registerUpdater(): void {
  if (registered) return
  registered = true

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowDowngrade = false
  autoUpdater.allowPrerelease = false

  autoUpdater.on('error', () => {
    // IPC handlers report the message. A listener is required so this event does not crash the process.
  })

  ipcMain.handle('updater:status', (): AppUpdateStatus => status())

  ipcMain.handle('updater:check', async (): Promise<AppUpdateCheck> => {
    const currentVersion = app.getVersion()
    lastError = undefined

    if (!app.isPackaged) {
      phase = 'idle'
      remoteVersion = undefined
      progress = undefined
      return { currentVersion, available: false, devOnly: true }
    }

    try {
      const result = await autoUpdater.checkForUpdates()
      if (!result) {
        phase = 'error'
        lastError = 'The updater is disabled'
        return { currentVersion, available: false, error: lastError }
      }

      remoteVersion = result.updateInfo.version
      progress = undefined
      if (result.isUpdateAvailable) {
        phase = 'available'
        return { currentVersion, available: true, version: remoteVersion }
      }

      phase = 'idle'
      return { currentVersion, available: false, version: remoteVersion }
    } catch (error) {
      phase = 'error'
      lastError = errorMessage(error, 'Could not check for updates')
      return { currentVersion, available: false, error: lastError }
    }
  })

  ipcMain.handle(
    'updater:download',
    async (event): Promise<AppUpdateDownloadResult> => {
      if (!app.isPackaged) {
        return { ok: false, error: 'Updates can be downloaded from the installed app' }
      }
      if (downloading) return { ok: true }
      if (phase !== 'available' && phase !== 'error') {
        return { ok: false, error: 'Check for updates before downloading' }
      }

      downloading = true
      cancelRequested = false
      phase = 'downloading'
      lastError = undefined
      progress = { percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 }
      activeToken = new CancellationToken()
      const token = activeToken
      const sender = event.sender

      onProgress = (info: ProgressInfo): void => {
        progress = toProgress(info)
        send(sender, 'updater:progress', progress)
      }
      onDownloaded = (info: UpdateDownloadedEvent): void => {
        downloading = false
        phase = 'downloaded'
        remoteVersion = info.version
        progress = progress
          ? { ...progress, percent: 100 }
          : { percent: 100, transferred: 0, total: 0, bytesPerSecond: 0 }
        detachDownloadListeners()
        send(sender, 'updater:downloaded', { version: info.version })
      }

      autoUpdater.on('download-progress', onProgress)
      autoUpdater.once('update-downloaded', onDownloaded)

      try {
        await autoUpdater.downloadUpdate(token)
        return { ok: true }
      } catch (error) {
        downloading = false
        detachDownloadListeners()
        if (cancelRequested || token.cancelled) {
          cancelRequested = false
          phase = remoteVersion ? 'available' : 'idle'
          progress = undefined
          return { ok: false, cancelled: true }
        }
        phase = 'error'
        lastError = errorMessage(error, 'Download failed')
        send(sender, 'updater:error', { message: lastError })
        return { ok: false, error: lastError }
      }
    }
  )

  ipcMain.handle('updater:cancel', (): void => {
    if (!downloading || !activeToken) return
    cancelRequested = true
    activeToken.cancel()
  })

  ipcMain.handle('updater:install', (): void => {
    autoUpdater.quitAndInstall(false, true)
  })
}
