import { randomUUID } from 'node:crypto'
import { Notification, shell, type BrowserWindow } from 'electron'
import type { AppNotification } from '@shared/types'
import { getValue, setValue } from './storage'

const MAX_KEPT = 200

let getWin: () => BrowserWindow | null = () => null

export function initNotifications(win: () => BrowserWindow | null): void {
  getWin = win
}

/**
 * Records a notification in the in-app center and, unless `silent`, shows a
 * system notification. Clicking the system one opens the app on `view`, or the URL.
 */
export function notify(n: Omit<AppNotification, 'id' | 'createdAt' | 'read'>, opts: { silent?: boolean } = {}): AppNotification {
  const entry: AppNotification = { ...n, id: randomUUID(), createdAt: Date.now(), read: false }
  setValue('notifications', [entry, ...getValue('notifications')].slice(0, MAX_KEPT))
  getWin()?.webContents.send('notifications:new', entry)

  if (!opts.silent && Notification.isSupported()) {
    const sys = new Notification({ title: n.title, body: n.body, silent: false })
    sys.on('click', () => {
      const win = getWin()
      if (n.view && win) {
        win.show()
        win.focus()
        win.webContents.send('nav:go', n.view)
      } else if (n.url) void shell.openExternal(n.url)
    })
    sys.show()
  }
  return entry
}
