import { app, shell, type BrowserWindow } from 'electron'
import updaterPkg from 'electron-updater'
import type { UpdateStatus } from '@shared/types'

// electron-updater is CommonJS; the named export isn't visible to ESM.
const { autoUpdater } = updaterPkg

const RELEASES_URL = 'https://github.com/lcfarias1501/u-hub/releases/latest'
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000

/**
 * Windows/Linux: download in the background and offer "restart to update".
 * macOS: Squirrel.Mac refuses to install updates into an app without a paid
 * Developer ID signature, so there we only announce the version and link to the release.
 */
const canInstall = process.platform !== 'darwin'

let status: UpdateStatus = { state: 'idle', currentVersion: app.getVersion() }

export function startUpdater(getWin: () => BrowserWindow | null): void {
  const emit = (patch: Partial<UpdateStatus>): void => {
    status = { ...status, ...patch }
    getWin()?.webContents.send('updater:status', status)
  }

  if (!app.isPackaged) return

  autoUpdater.autoDownload = canInstall
  autoUpdater.autoInstallOnAppQuit = canInstall
  autoUpdater.on('update-available', (info) =>
    emit({ state: canInstall ? 'downloading' : 'available', version: info.version, canInstall })
  )
  autoUpdater.on('download-progress', (p) => emit({ state: 'downloading', progress: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (info) => emit({ state: 'ready', version: info.version, canInstall }))
  autoUpdater.on('error', (err) => console.warn('[updater]', err.message))

  const check = (): void => void autoUpdater.checkForUpdates().catch(() => undefined)
  setTimeout(check, 8000)
  setInterval(check, CHECK_EVERY_MS)
}

export const updaterStatus = (): UpdateStatus => status

export function applyUpdate(): void {
  if (status.state === 'ready' && canInstall) autoUpdater.quitAndInstall()
  else void shell.openExternal(RELEASES_URL)
}

export type CheckResult = 'dev' | 'latest' | 'available' | 'error'

/** Manual "check for updates" from Settings. Events above still drive the badge. */
export async function checkNow(): Promise<CheckResult> {
  if (!app.isPackaged) return 'dev'
  try {
    const r = await autoUpdater.checkForUpdates()
    return r?.isUpdateAvailable ? 'available' : 'latest'
  } catch {
    return 'error'
  }
}
