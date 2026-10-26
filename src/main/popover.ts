import { join } from 'node:path'
import { BrowserWindow, app, ipcMain, screen, shell, type Rectangle } from 'electron'
import type { ModuleId, RadioCommand, RadioState, ViewId } from '@shared/types'

const WIDTH = 340
const GAP = 6
const MIN_HEIGHT = 120
const MAX_HEIGHT = 640

let popover: BrowserWindow | null = null
let hiddenAt = 0
let anchor: Rectangle | null = null
/** The page reports its content height; the window follows it. */
let height = 420
let radio: RadioState = { station: null, playing: false, loading: false, error: null, volume: 0.6 }

function create(): BrowserWindow {
  const isMac = process.platform === 'darwin'
  const win = new BrowserWindow({
    width: WIDTH,
    height,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    // Native blurred material behind the page, like system popovers.
    ...(isMac ? { vibrancy: 'popover' as const, visualEffectState: 'active' as const, type: 'panel' as const } : {}),
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true
    }
  })
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.on('blur', () => hide())
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e) => e.preventDefault())

  // Same renderer bundle; the hash selects the popover root.
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#popover`)
  else void win.loadFile(join(import.meta.dirname, '../renderer/index.html'), { hash: 'popover' })
  win.on('closed', () => {
    popover = null
  })
  return win
}

function position(win: BrowserWindow, anchor: Rectangle): void {
  const HEIGHT = height
  const display = screen.getDisplayMatching(anchor)
  const area = display.workArea
  let x = Math.round(anchor.x + anchor.width / 2 - WIDTH / 2)
  // Menu bar at the top (macOS, most Linux) → open below; taskbar at the bottom (Windows) → open above.
  let y = anchor.y < area.y + area.height / 2 ? anchor.y + anchor.height + GAP : anchor.y - HEIGHT - GAP
  x = Math.min(Math.max(x, area.x + GAP), area.x + area.width - WIDTH - GAP)
  y = Math.min(Math.max(y, area.y + GAP), area.y + area.height - HEIGHT - GAP)
  win.setBounds({ x, y, width: WIDTH, height: HEIGHT }, false)
}

const radioListeners = new Set<(s: RadioState) => void>()
export const onRadioChange = (l: (s: RadioState) => void): void => void radioListeners.add(l)

/** Last radio state published by the main window. */
export const radioState = (): RadioState => radio

let speaking = false
/** News are being read aloud in the main window. */
export const speechActive = (): boolean => speaking

export function hide(): void {
  if (popover?.isVisible()) {
    popover.hide()
    hiddenAt = Date.now()
  }
}

/** Toggles the popover under the tray icon. */
export function toggle(at: Rectangle): void {
  // Clicking the tray icon blurs (and hides) an open popover just before this
  // click arrives; without this guard the click would immediately reopen it.
  if (Date.now() - hiddenAt < 250) return
  if (popover?.isVisible()) return hide()
  anchor = at
  popover ??= create()
  position(popover, at)
  popover.show()
  popover.focus()
  popover.webContents.send('popover:shown')
}

export function destroy(): void {
  popover?.destroy()
  popover = null
}

/**
 * The radio's <audio> lives in the main window. It publishes its state here;
 * the popover reads it and sends commands back through main.
 */
export function registerPopoverIpc(getMain: () => BrowserWindow | null, showMain: (view?: ViewId) => void): void {
  ipcMain.on('radio:publish', (_e, state: RadioState) => {
    radio = state
    popover?.webContents.send('radio:state', state)
    radioListeners.forEach((l) => l(state))
  })
  ipcMain.handle('radio:get', () => radio)
  ipcMain.on('speech:active', (_e, on: boolean) => {
    speaking = !!on
  })
  ipcMain.on('radio:command', (_e, cmd: RadioCommand) => getMain()?.webContents.send('radio:command', cmd))
  ipcMain.on('popover:hide', () => hide())
  ipcMain.on('app:showMain', (_e, view?: ModuleId | 'settings') => {
    hide()
    showMain(view)
  })
  ipcMain.on('app:quit', () => app.quit())
  ipcMain.on('popover:resize', (_e, h: number) => {
    const next = Math.round(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, h)))
    if (next === height) return
    height = next
    if (popover && anchor) position(popover, anchor)
  })
}
