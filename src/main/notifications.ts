import { randomUUID } from 'node:crypto'
import { Notification, app, shell, type BrowserWindow } from 'electron'
import type { AppNotification, ViewId } from '@shared/types'
import { snapshot as librarySnapshot } from './games'
import { getSettings, getValue, onSettingsChange, onValueChange, setValue } from './storage'

const MAX_KEPT = 200

let getWin: () => BrowserWindow | null = () => null
/** Shows the main window (recreating it if it was closed) on a view. */
let openMain: (view?: ViewId) => void = () => undefined

/** Dock (macOS) / taskbar (Linux) badge with the unread count, if enabled. */
function syncBadge(): void {
  const unread = getSettings().notifications.badge ? getValue('notifications').filter((n) => !n.read).length : 0
  app.setBadgeCount(unread)
}

export function initNotifications(win: () => BrowserWindow | null, open: (view?: ViewId) => void): void {
  getWin = win
  openMain = open
  syncBadge()
  // The renderer marks items read / clears them by writing the list.
  onValueChange('notifications', syncBadge)
  onSettingsChange(syncBadge)
}

/**
 * Records a notification in the in-app center and, if the user's settings
 * allow it for this kind, shows a system notification. Clicking that opens the
 * app on `view`, or the URL.
 */
export function notify(n: Omit<AppNotification, 'id' | 'createdAt' | 'read'>): AppNotification {
  const entry: AppNotification = { ...n, id: randomUUID(), createdAt: Date.now(), read: false }
  setValue('notifications', [entry, ...getValue('notifications')].slice(0, MAX_KEPT))
  getWin()?.webContents.send('notifications:new', entry)

  const prefs = getSettings().notifications
  const gaming = prefs.quietWhilePlaying && librarySnapshot().nowPlaying.length > 0
  if (prefs.system[n.kind] && !gaming && Notification.isSupported()) {
    const sys = new Notification({ title: n.title, body: n.body, silent: !prefs.sound })
    sys.on('click', () => {
      markRead(entry.id)
      if (n.view) openMain(n.view)
      else if (n.url) void shell.openExternal(n.url)
    })
    sys.show()
  }
  return entry
}

function markRead(id: string): void {
  setValue(
    'notifications',
    getValue('notifications').map((x) => (x.id === id ? { ...x, read: true } : x))
  )
}
