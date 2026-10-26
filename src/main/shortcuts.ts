import { globalShortcut, type BrowserWindow } from 'electron'
import type { AppSettings, RadioCommand, ShortcutAction, ShortcutStatus } from '@shared/types'
import { radioState, speechActive } from './popover'
import * as spotify from './spotify'

type Source = 'radio' | 'spotify'

let getWin: () => BrowserWindow | null = () => null
let showWindow: () => void = () => undefined
let status: ShortcutStatus = { toggleWindow: 'unset', mediaPlayPause: 'unset', mediaNext: 'unset', mediaPrev: 'unset', radioVolumeUp: 'unset', radioVolumeDown: 'unset' }
let lastSource: Source = 'radio'
let paused = false
let current: AppSettings['shortcuts'] | null = null

const radio = (cmd: RadioCommand): void => {
  lastSource = 'radio'
  getWin()?.webContents.send('radio:command', cmd)
}

/**
 * Which player a media key should drive: whatever is playing right now
 * (radio first, it's local), otherwise the one used last.
 */
async function target(): Promise<{ source: Source; spotifyPlaying: boolean }> {
  // The main window routes radio commands to the news reading while it runs.
  if (speechActive() || radioState().playing) return { source: 'radio', spotifyPlaying: false }
  const st = await spotify.status().catch(() => null)
  if (st?.connected) {
    const pb = await spotify.playback()
    if (pb.ok && pb.data?.isPlaying) return { source: 'spotify', spotifyPlaying: true }
    if (lastSource === 'spotify' && pb.ok && pb.data) return { source: 'spotify', spotifyPlaying: false }
  }
  return { source: 'radio', spotifyPlaying: false }
}

const ACTIONS: Record<ShortcutAction, () => void | Promise<void>> = {
  toggleWindow: () => {
    const win = getWin()
    if (win?.isVisible() && win.isFocused() && !win.isMinimized()) win.hide()
    else showWindow()
  },
  mediaPlayPause: async () => {
    const t = await target()
    if (t.source === 'radio') return radio({ type: 'toggle' })
    lastSource = 'spotify'
    await spotify.command({ type: t.spotifyPlaying ? 'pause' : 'play' })
  },
  mediaNext: async () => {
    const t = await target()
    if (t.source === 'radio') return radio({ type: 'next' })
    lastSource = 'spotify'
    await spotify.command({ type: 'next' })
  },
  mediaPrev: async () => {
    const t = await target()
    if (t.source === 'radio') return radio({ type: 'prev' })
    lastSource = 'spotify'
    await spotify.command({ type: 'previous' })
  },
  radioVolumeUp: () => radio({ type: 'volume', value: Math.min(1, +(radioState().volume + 0.1).toFixed(2)) }),
  radioVolumeDown: () => radio({ type: 'volume', value: Math.max(0, +(radioState().volume - 0.1).toFixed(2)) })
}

/** (Re)registers every assigned shortcut and records which ones the OS refused (taken by another app). */
export function applyShortcuts(shortcuts: AppSettings['shortcuts']): ShortcutStatus {
  current = shortcuts
  globalShortcut.unregisterAll()
  const next = {} as ShortcutStatus
  for (const action of Object.keys(ACTIONS) as ShortcutAction[]) {
    const accel = shortcuts[action]
    if (!accel || paused) {
      next[action] = accel ? 'ok' : 'unset'
      continue
    }
    let ok = false
    try {
      ok = globalShortcut.register(accel, () => void Promise.resolve(ACTIONS[action]()).catch(() => undefined))
    } catch {
      ok = false // malformed accelerator
    }
    next[action] = ok ? 'ok' : 'conflict'
  }
  status = next
  return status
}

/** While the settings page records a new combo, global shortcuts would swallow the keypress. */
export function pauseShortcuts(pause: boolean): void {
  paused = pause
  if (pause) globalShortcut.unregisterAll()
  else if (current) applyShortcuts(current)
}

export const shortcutStatus = (): ShortcutStatus => status

export function initShortcuts(win: () => BrowserWindow | null, show: () => void): void {
  getWin = win
  showWindow = show
}
