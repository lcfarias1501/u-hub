import type { RealtimeChannel } from '@supabase/supabase-js'
import type { BrowserWindow } from 'electron'
import type { AppSettings, StoreKey, SyncStatus, WishlistItem } from '@shared/types'
import { onAccountChange, supabaseClient } from './social'
import { getPrivate, getValue, onAnyValueChange, setPrivate, setValue } from './storage'

/**
 * Cloud sync of non-sensitive preferences, one JSON document per user:
 * `{ <key>: { value, updatedAt } }`. Each key resolves independently by
 * last-write-wins, so changing colours on one PC and quests on another never
 * clobber each other. The vault, tokens and notifications are never synced.
 */
const SYNC_KEYS = [
  'settings',
  'perfLayout',
  'quests',
  'launchers',
  'stations',
  'playlists',
  'vaultCategories',
  'wishlist',
  'newsSources',
  'hiddenGames',
  'profile',
  'mailCategories',
  'mailRules',
  'mailTrustedSenders',
  'newsFollow',
  'watchlist',
  'myProviders'
] as const satisfies readonly StoreKey[]
type SyncKey = (typeof SYNC_KEYS)[number]

/** Settings that describe this machine, not the person. */
const DEVICE_SETTINGS = ['openAtLogin', 'startMinimized', 'zoom'] as const

type Doc = Partial<Record<SyncKey, { value: unknown; updatedAt: number }>>

const PUSH_DEBOUNCE_MS = 3000

let status: SyncStatus = { state: 'off', lastSyncedAt: null, error: null }
let getWin: () => BrowserWindow | null = () => null
let uid: string | null = null
let remote: Doc = {}
let applying = false
let pushTimer: NodeJS.Timeout | undefined
let channel: RealtimeChannel | null = null

export const syncStatus = (): SyncStatus => status
function setStatus(patch: Partial<SyncStatus>): void {
  status = { ...status, ...patch }
  getWin()?.webContents.send('sync:update', status)
}

const isSyncKey = (k: string): k is SyncKey => (SYNC_KEYS as readonly string[]).includes(k)

/**
 * Wishlist prices are per machine: each PC fetches them in its own store region,
 * so only the list and the alert targets (with the currency they're in) travel.
 */
const PRICE_FIELDS = ['final', 'initial', 'discount', 'lowest', 'checkedAt'] as const

function outgoing(key: SyncKey): unknown {
  const v = getValue(key)
  if (key === 'wishlist') {
    return (v as WishlistItem[]).map((w) => {
      const copy: Record<string, unknown> = { ...w }
      for (const f of PRICE_FIELDS) delete copy[f]
      return copy
    })
  }
  if (key !== 'settings') return v
  const copy: Record<string, unknown> = { ...(v as AppSettings) }
  for (const k of DEVICE_SETTINGS) delete copy[k]
  return copy
}

function incoming(key: SyncKey, value: unknown): unknown {
  if (key === 'wishlist') {
    const local = new Map(getValue('wishlist').map((w) => [w.appid, w]))
    return (value as WishlistItem[]).map((r): WishlistItem => {
      const l = local.get(r.appid)
      // New here: no prices yet (fetched on the next refresh, in this PC's currency).
      if (!l) return { ...r, final: null, initial: null, discount: 0, lowest: null, checkedAt: null }
      // A target set in another currency means nothing here; keep this PC's own.
      const sameCurrency = !l.currency || !r.currency || l.currency === r.currency
      return { ...r, currency: l.currency ?? r.currency, target: sameCurrency ? r.target : l.target, final: l.final, initial: l.initial, discount: l.discount, lowest: l.lowest, checkedAt: l.checkedAt }
    })
  }
  if (key !== 'settings') return value
  const local = getValue('settings')
  const merged: Record<string, unknown> = { ...(value as object) }
  for (const k of DEVICE_SETTINGS) merged[k] = local[k]
  return merged
}

function apply(key: SyncKey): void {
  const entry = remote[key]
  if (!entry) return
  // Writes we make here must not be mistaken for local edits.
  applying = true
  try {
    setValue(key, incoming(key, entry.value) as never)
  } finally {
    applying = false
  }
  setPrivate('syncMeta', { ...getPrivate('syncMeta'), [key]: entry.updatedAt })
}

async function pull(): Promise<void> {
  const c = supabaseClient()
  if (!c || !uid) return
  const { data, error } = await c.from('user_settings').select('data').eq('user_id', uid).maybeSingle<{ data: Doc }>()
  if (error) throw new Error(error.message.includes('does not exist') ? 'Falta rodar o script 0002 no Supabase.' : error.message)
  remote = data?.data ?? {}
}

async function push(): Promise<void> {
  const c = supabaseClient()
  if (!c || !uid) return
  const meta = getPrivate('syncMeta')
  const doc: Doc = { ...remote }
  let changed = false
  for (const key of SYNC_KEYS) {
    const m = meta[key]
    if (m && (!remote[key] || m > remote[key]!.updatedAt)) {
      doc[key] = { value: outgoing(key), updatedAt: m }
      changed = true
    }
  }
  if (!changed) return setStatus({ state: 'synced', lastSyncedAt: Date.now(), error: null })
  setStatus({ state: 'syncing' })
  const { error } = await c.from('user_settings').upsert({ user_id: uid, data: doc, updated_at: new Date().toISOString() })
  if (error) return setStatus({ state: 'error', error: error.message })
  remote = doc
  setStatus({ state: 'synced', lastSyncedAt: Date.now(), error: null })
}

function schedulePush(): void {
  clearTimeout(pushTimer)
  pushTimer = setTimeout(() => void push().catch((e) => setStatus({ state: 'error', error: (e as Error).message })), PUSH_DEBOUNCE_MS)
}

/** Takes newer remote keys, then pushes keys that are newer here. */
async function reconcile(): Promise<void> {
  const meta = getPrivate('syncMeta')
  for (const key of SYNC_KEYS) {
    const r = remote[key]
    if (r && r.updatedAt > (meta[key] ?? 0)) apply(key)
  }
  await push()
}

function markAllLocal(): void {
  const now = Date.now()
  setPrivate('syncMeta', Object.fromEntries(SYNC_KEYS.map((k) => [k, now])))
}

function listen(): void {
  const c = supabaseClient()
  if (!c || !uid || channel) return
  channel = c
    .channel('uhub-settings-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'user_settings', filter: `user_id=eq.${uid}` }, (payload) => {
      const next = (payload.new as { data?: Doc } | null)?.data
      if (!next) return
      remote = next
      void reconcile()
    })
    .subscribe()
}

async function onSignedIn(id: string): Promise<void> {
  uid = id
  setStatus({ state: 'syncing', error: null })
  try {
    await pull()
    if (getPrivate('syncedUser') !== id) {
      // First time this device meets this account.
      const remoteHas = Object.keys(remote).length > 0
      const localHas = Object.keys(getPrivate('syncMeta')).length > 0 || getValue('onboarded') === true
      if (remoteHas && localHas) return setStatus({ state: 'conflict' }) // the UI asks which side to keep
      if (remoteHas) for (const k of SYNC_KEYS) apply(k)
      else markAllLocal()
      setPrivate('syncedUser', id)
    }
    await reconcile()
    listen()
  } catch (e) {
    setStatus({ state: 'error', error: (e as Error).message })
  }
}

/** First-sync conflict: keep the cloud copy, or overwrite it with this device's data. */
export async function resolveConflict(keep: 'cloud' | 'local'): Promise<void> {
  if (!uid) return
  if (keep === 'cloud') for (const k of SYNC_KEYS) apply(k)
  else markAllLocal()
  setPrivate('syncedUser', uid)
  await reconcile()
  listen()
}

export async function syncNow(): Promise<void> {
  if (!uid || status.state === 'conflict') return
  try {
    await pull()
    await reconcile()
  } catch (e) {
    setStatus({ state: 'error', error: (e as Error).message })
  }
}

export function startSync(win: () => BrowserWindow | null): void {
  getWin = win
  onAnyValueChange((key) => {
    if (applying || !isSyncKey(key)) return
    // Background writes that don't change what would be uploaded (wishlist price checks) aren't edits.
    if (remote[key] && JSON.stringify(outgoing(key)) === JSON.stringify(remote[key]!.value)) return
    setPrivate('syncMeta', { ...getPrivate('syncMeta'), [key]: Date.now() })
    if (uid && status.state !== 'conflict') schedulePush()
  })
  onAccountChange((id) => {
    if (id) void onSignedIn(id)
    else {
      const c = supabaseClient()
      if (channel && c) void c.removeChannel(channel)
      channel = null
      uid = null
      remote = {}
      setStatus({ state: 'off', lastSyncedAt: null, error: null })
    }
  })
}
