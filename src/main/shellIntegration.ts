import { Menu, Tray, app, nativeImage, type BrowserWindow } from 'electron'
import type { AppSettings, ModuleId } from '@shared/types'
import trayColor from '../../resources/tray.png?asset'
import trayTemplate from '../../resources/trayTemplate.png?asset'
import trayTemplate2x from '../../resources/trayTemplate@2x.png?asset'

const MODULE_LABELS: Record<ModuleId, string> = {
  performance: 'Performance',
  vault: 'Vault & Keys',
  media: 'Media & Audio',
  quests: 'Quest Log'
}

let tray: Tray | null = null
/** Set while quitting so "close to tray" doesn't swallow the window close. */
export let quitting = false
app.on('before-quit', () => {
  quitting = true
})

export const canOpenAtLogin = (): boolean => app.isPackaged && (process.platform === 'darwin' || process.platform === 'win32')

function trayImage(): Electron.NativeImage {
  if (process.platform !== 'darwin') return nativeImage.createFromPath(trayColor)
  // Template images are tinted by macOS for light/dark menu bars.
  const img = nativeImage.createFromPath(trayTemplate)
  img.addRepresentation({ scaleFactor: 2, buffer: nativeImage.createFromPath(trayTemplate2x).toPNG() })
  img.setTemplateImage(true)
  return img
}

export function showWindow(win: BrowserWindow | null): void {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function syncTray(settings: AppSettings, getWin: () => BrowserWindow | null): void {
  if (!settings.closeToTray) {
    tray?.destroy()
    tray = null
    return
  }
  tray ??= new Tray(trayImage())
  tray.setToolTip('U-Hub')
  tray.removeAllListeners('click')
  // On macOS a click opens the menu; on Windows/Linux a click toggles the window.
  if (process.platform !== 'darwin') {
    tray.on('click', () => {
      const win = getWin()
      if (win?.isVisible() && !win.isMinimized()) win.hide()
      else showWindow(win)
    })
  }
  const open = (view?: ModuleId): void => {
    const win = getWin()
    showWindow(win)
    if (view) win?.webContents.send('nav:go', view)
  }
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Abrir U-Hub', click: () => open() },
      { type: 'separator' },
      ...settings.modules.filter((m) => m.visible).map((m) => ({ label: MODULE_LABELS[m.id], click: () => open(m.id) })),
      { type: 'separator' },
      { label: 'Sair', click: () => app.quit() }
    ])
  )
}

/** Applies OS-level side effects of the settings: login item, tray, zoom. Safe to call repeatedly. */
export function applySettings(settings: AppSettings, getWin: () => BrowserWindow | null): void {
  if (canOpenAtLogin()) {
    // "Start minimized" is handled by the window itself, so it also applies to manual launches.
    app.setLoginItemSettings({ openAtLogin: settings.openAtLogin })
  }
  syncTray(settings, getWin)
  getWin()?.webContents.setZoomFactor(settings.zoom)
}
