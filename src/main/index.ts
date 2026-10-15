import { join } from 'node:path'
import { BrowserWindow, app, clipboard, ipcMain, session, shell } from 'electron'
import type { SpotifyCommand, StoreSchema, VaultEntry } from '@shared/types'
import { launch } from './launcher'
import * as spotify from './spotify'
import { getValue, isPublicKey, readVault, setValue, vaultProtection, writeVault } from './storage'
import { readStatic, startMonitor } from './system'
import { applyUpdate, startUpdater, updaterStatus } from './updater'

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

  win.once('ready-to-show', () => win?.show())

  // Never navigate the app window away; open external links in the OS browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win?.webContents.getURL()) e.preventDefault()
  })

  stopMonitor = startMonitor((snap) => win?.webContents.send('system:tick', snap))
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
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
