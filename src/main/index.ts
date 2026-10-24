import { join } from 'node:path'
import { BrowserWindow, app, clipboard, dialog, globalShortcut, ipcMain, session, shell } from 'electron'
import type { AppInfo, SpotifyCommand, StoreSchema, VaultEntry } from '@shared/types'
import { exportBackup, inspectBackup, restoreBackup } from './backup'
import { discordStatus, startDiscord, stopDiscord } from './discord'
import { applyShortcuts, initShortcuts, pauseShortcuts, shortcutStatus } from './shortcuts'
import { launchGame, onLibraryChange, revealGame, scan as scanLibrary, snapshot as librarySnapshot, startLibrary, suggestName } from './games'
import { initNotifications } from './notifications'
import { registerPopoverIpc } from './popover'
import * as social from './social'
import { resolveConflict, startSync, syncNow, syncStatus } from './sync'
import { radarSnapshot, refreshRadar, searchSteam, startRadar } from './radar'
import { launch } from './launcher'
import { applySettings, canOpenAtLogin, quitting, showWindow } from './shellIntegration'
import * as spotify from './spotify'
import { getSettings, getValue, isPublicKey, onAnyValueChange, onSettingsChange, readVault, resetStore, setValue, vaultProtection, writeVault } from './storage'
import { readStatic, startMonitor } from './system'
import { applyUpdate, checkNow, startUpdater, updaterStatus } from './updater'

let win: BrowserWindow | null = null
let stopMonitor: (() => void) | null = null

function createWindow(): void {
  const isMac = process.platform === 'darwin'
  win = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    backgroundColor: '#0F0F12',
    title: 'U-Hub',
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    trafficLightPosition: { x: 16, y: 14 },
    titleBarOverlay: isMac ? false : { color: '#0F0F12', symbolColor: '#a1a1aa', height: 40 },
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true
    }
  })

  win.once('ready-to-show', () => {
    const { startMinimized, closeToTray } = getSettings()
    if (!startMinimized) win?.show()
    else if (!closeToTray) {
      // No tray to come back from, so start as a minimized window instead of an invisible one.
      win?.showInactive()
      win?.minimize()
    }
  })
  win.webContents.on('did-finish-load', () => win?.webContents.setZoomFactor(getSettings().zoom))

  // "Close to tray": the close button hides the window; quitting goes through the tray menu or ⌘Q.
  win.on('close', (e) => {
    if (getSettings().closeToTray && !quitting) {
      e.preventDefault()
      win?.hide()
    }
  })

  // Never navigate the app window away; open external links in the OS browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win?.webContents.getURL()) e.preventDefault()
  })

  stopMonitor = startMonitor(
    (snap) => win?.webContents.send('system:tick', snap),
    () => !!win && win.isVisible() && !win.isMinimized()
  )
  win.on('closed', () => {
    stopMonitor?.()
    win = null
  })

  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
}

/**
 * Request side: radio servers like SomaFM reject streams with a foreign Referer
 * (anti-hotlinking), and in dev the page sends `http://localhost:5173/`. A desktop
 * player has no meaningful referrer, so it's dropped for media requests.
 *
 * Response side: most radio streams don't send CORS headers, which Web Audio needs
 * before an AnalyserNode can read samples for the visualizer. Media responses get
 * an ACAO header so `crossOrigin="anonymous"` audio plays and stays analysable.
 */
function configureMediaRequests(): void {
  session.defaultSession.webRequest.onBeforeSendHeaders((details, cb) => {
    if (details.resourceType !== 'media') return cb({})
    const headers = { ...details.requestHeaders }
    for (const k of Object.keys(headers)) if (k.toLowerCase() === 'referer') delete headers[k]
    cb({ requestHeaders: headers })
  })
  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    if (details.resourceType !== 'media') return cb({})
    const headers = { ...details.responseHeaders }
    for (const k of Object.keys(headers)) if (k.toLowerCase() === 'access-control-allow-origin') delete headers[k]
    headers['Access-Control-Allow-Origin'] = ['*']
    cb({ responseHeaders: headers })
  })
}

function registerIpc(): void {
  ipcMain.handle('system:static', () => readStatic())

  ipcMain.handle('store:get', (_e, key: unknown) => {
    if (!isPublicKey(key)) throw new Error(`Unknown store key: ${String(key)}`)
    return getValue(key)
  })
  ipcMain.handle('store:set', (_e, key: unknown, value: unknown) => {
    if (!isPublicKey(key)) throw new Error(`Unknown store key: ${String(key)}`)
    setValue(key, value as StoreSchema[typeof key])
  })

  ipcMain.handle('vault:read', () => ({ entries: readVault(), protection: vaultProtection() }))
  ipcMain.handle('vault:write', (_e, entries: VaultEntry[]) => writeVault(entries))

  // Secrets are wiped from the clipboard after 30s unless the user copied something else meanwhile.
  ipcMain.handle('clipboard:copy', async (_e, text: string, sensitive: boolean) => {
    await clipboard.writeText(text)
    if (!sensitive) return
    setTimeout(async () => {
      if ((await clipboard.readText()) === text) clipboard.clear()
    }, 30_000)
  })

  ipcMain.handle('spotify:status', () => spotify.status())
  ipcMain.handle('spotify:setClientId', (_e, id: string) => spotify.setClientId(String(id)))
  ipcMain.handle('spotify:login', () => spotify.login())
  ipcMain.handle('spotify:logout', () => spotify.logout())
  ipcMain.handle('spotify:playback', () => spotify.playback())
  ipcMain.handle('spotify:devices', () => spotify.devices())
  ipcMain.handle('spotify:playlists', () => spotify.playlists())
  ipcMain.handle('spotify:playHere', () => spotify.playHere())
  ipcMain.handle('spotify:command', (_e, cmd: SpotifyCommand) => spotify.command(cmd))

  ipcMain.handle('updater:status', () => updaterStatus())
  ipcMain.handle('updater:apply', () => applyUpdate())
  ipcMain.handle('updater:check', () => checkNow())

  ipcMain.handle(
    'app:info',
    (): AppInfo => ({
      version: app.getVersion(),
      platform: process.platform,
      isPackaged: app.isPackaged,
      userDataPath: app.getPath('userData'),
      canOpenAtLogin: canOpenAtLogin(),
      localeCountry: app.getLocaleCountryCode() || 'BR'
    })
  )
  ipcMain.handle('app:openDataFolder', () => shell.openPath(app.getPath('userData')))
  ipcMain.handle('app:reset', () => {
    resetStore()
    app.relaunch()
    app.exit(0)
  })

  ipcMain.handle('backup:export', (_e, password: string | null) => exportBackup(win, password || null))
  ipcMain.handle('backup:inspect', () => inspectBackup(win))
  ipcMain.handle('backup:restore', (_e, password: string | null) => {
    restoreBackup(password || null)
    applySettings(getSettings(), () => win)
  })

  registerPopoverIpc(
    () => win,
    (view) => {
      showWindow(win)
      if (view) win?.webContents.send('nav:go', view)
    }
  )

  ipcMain.handle('library:get', () => librarySnapshot())
  ipcMain.handle('library:scan', () => scanLibrary())
  ipcMain.handle('library:launch', (_e, id: string) => launchGame(id))
  ipcMain.handle('library:reveal', (_e, id: string) => revealGame(id))
  ipcMain.handle('library:pickExecutable', async () => {
    const mac = process.platform === 'darwin'
    const opts: Electron.OpenDialogOptions = {
      title: 'Escolha o jogo ou app',
      defaultPath: mac ? '/Applications' : undefined,
      // On macOS .app bundles are packages, so "openFile" lets the user pick them as a single item.
      properties: ['openFile'],
      filters: mac ? [{ name: 'Aplicativos', extensions: ['app'] }] : process.platform === 'win32' ? [{ name: 'Executáveis', extensions: ['exe', 'lnk', 'url'] }] : []
    }
    const { canceled, filePaths } = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    return canceled || !filePaths[0] ? null : { path: filePaths[0], name: suggestName(filePaths[0]) }
  })

  ipcMain.handle('shortcuts:status', () => shortcutStatus())
  ipcMain.handle('shortcuts:pause', (_e, pause: boolean) => pauseShortcuts(!!pause))
  ipcMain.handle('discord:status', () => discordStatus())

  ipcMain.handle('sync:status', () => syncStatus())
  ipcMain.handle('sync:resolve', (_e, keep: 'cloud' | 'local') => resolveConflict(keep === 'local' ? 'local' : 'cloud'))
  ipcMain.handle('sync:now', () => syncNow())
  ipcMain.handle('social:get', () => social.socialState())
  ipcMain.handle('social:signInDiscord', () => social.signInDiscord())
  ipcMain.handle('social:linkDiscord', () => social.linkDiscord())
  ipcMain.handle('social:signUpEmail', (_e, form: Parameters<typeof social.signUpEmail>[0]) => social.signUpEmail(form))
  ipcMain.handle('social:signInEmail', (_e, email: string, password: string) => social.signInEmail(String(email), String(password)))
  ipcMain.handle('social:resetPassword', (_e, email: string) => social.resetPassword(String(email)))
  ipcMain.handle('social:setPassword', (_e, password: string) => social.setPassword(String(password)))
  ipcMain.handle('social:usernameAvailable', (_e, name: string) => social.usernameAvailable(String(name)))
  ipcMain.handle('social:signOut', () => social.signOut())
  ipcMain.handle('social:addFriend', (_e, target: string) => social.addFriend(String(target)))
  ipcMain.handle('social:respond', (_e, id: string, accept: boolean) => social.respondRequest(String(id), !!accept))
  ipcMain.handle('social:cancel', (_e, id: string) => social.cancelRequest(String(id)))
  ipcMain.handle('social:remove', (_e, id: string) => social.removeFriend(String(id)))
  ipcMain.handle('social:updateProfile', (_e, patch: Parameters<typeof social.updateProfile>[0]) => social.updateProfile(patch))

  ipcMain.handle('radar:get', () => radarSnapshot())
  ipcMain.handle('radar:refresh', () => refreshRadar())
  ipcMain.handle('radar:search', (_e, term: string) => searchSteam(String(term)))

  ipcMain.handle('launcher:run', (_e, id: string) => {
    const l = getValue('launchers').find((x) => x.id === id)
    return l ? launch(l) : { ok: false, error: 'Launcher não encontrado' }
  })
}

app.whenReady().then(() => {
  configureMediaRequests()
  registerIpc()
  createWindow()
  startUpdater(() => win)
  // Keep every window's copy of stored values fresh when main (or another window) writes them.
  onAnyValueChange((key) => BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('store:changed', key)))
  initNotifications(() => win)
  startLibrary()
  startRadar(() => win)
  initShortcuts(
    () => win,
    () => showWindow(win)
  )
  let lastShortcuts = JSON.stringify(getSettings().shortcuts)
  applyShortcuts(getSettings().shortcuts)
  onSettingsChange((s) => {
    const next = JSON.stringify(s.shortcuts)
    if (next === lastShortcuts) return
    lastShortcuts = next
    win?.webContents.send('shortcuts:status', applyShortcuts(s.shortcuts))
  })
  startDiscord(() => win)
  startSync(() => win)
  social.startSocial(() => win)
  onLibraryChange((s) => win?.webContents.send('library:update', s))
  applySettings(getSettings(), () => win)
  onSettingsChange((s) => applySettings(s, () => win))
  app.on('activate', () => (win ? showWindow(win) : createWindow()))
})

// Leave no stale status on the user's Discord profile.
app.on('before-quit', () => {
  stopDiscord()
  void social.stopSocial()
})
app.on('will-quit', () => globalShortcut.unregisterAll())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
