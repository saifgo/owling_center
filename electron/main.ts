import { app, shell, BrowserWindow, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import appIconPath from '../resources/logo_transparrent.png?asset'
import splashImagePath from '../resources/splash_screen.png?asset'
import { ProcessRegistry } from './process/registry'
import { registerIpcHandlers, setRegistry } from './ipc/handlers'
import { initDb, closeDb } from './db'
import { getSettings } from './store'
import { registerUpdater } from './updater'

const APP_NAME = 'Owling Center'
const SPLASH_MIN_MS = 1000

let mainWindow: BrowserWindow | null = null
let splashWindow: BrowserWindow | null = null
let registry: ProcessRegistry | null = null

function toFileUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  return normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`
}

function getAppIcon(): Electron.NativeImage {
  return nativeImage.createFromPath(appIconPath)
}

function createSplashWindow(): BrowserWindow {
  const splash = new BrowserWindow({
    width: 520,
    height: 340,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    center: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: true,
    backgroundColor: '#0b1224',
    icon: getAppIcon(),
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const imgSrc = toFileUrl(splashImagePath)
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      background: #0b1224;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: "Segoe UI", sans-serif;
    }
    .wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 18px;
      padding: 24px;
    }
    img {
      max-width: 420px;
      max-height: 220px;
      width: auto;
      height: auto;
      object-fit: contain;
      user-select: none;
      -webkit-user-drag: none;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <img src="${imgSrc}" alt="${APP_NAME}" />
  </div>
</body>
</html>`

  void splash.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  return splash
}

function closeSplash(): void {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close()
  }
  splashWindow = null
}

function createWindow(): void {
  const splashStartedAt = Date.now()
  splashWindow = createSplashWindow()

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: APP_NAME,
    backgroundColor: '#0b1118',
    icon: getAppIcon(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const revealMain = async (): Promise<void> => {
    const elapsed = Date.now() - splashStartedAt
    const waitMs = Math.max(0, SPLASH_MIN_MS - elapsed)
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs))
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.focus()
    }
    closeSplash()
  }

  mainWindow.on('ready-to-show', () => {
    void revealMain()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.owling.center')
  app.setName(APP_NAME)

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  await initDb()

  registry = new ProcessRegistry(() => mainWindow)
  setRegistry(registry)
  registerIpcHandlers()
  registerUpdater()

  const settings = getSettings()
  app.setLoginItemSettings({
    openAtLogin: settings.autostart,
    path: process.execPath
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  closeSplash()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', async () => {
  closeSplash()
  if (registry) {
    await registry.stopAll()
  }
  closeDb()
})
