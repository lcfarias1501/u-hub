import { app, safeStorage } from 'electron'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Store from 'electron-store'
import { DEFAULT_SETTINGS, type AppSettings, type Launcher, type RadioStation, type StoreKey, type StoreSchema, type VaultEntry } from '@shared/types'

const DEFAULT_STATIONS: RadioStation[] = [
  { id: 'st-groove', name: 'Groove Salad', genre: 'Ambient / Downtempo', url: 'https://ice1.somafm.com/groovesalad-128-mp3' },
  { id: 'st-fluid', name: 'Fluid', genre: 'Lofi Hip-Hop', url: 'https://ice1.somafm.com/fluid-128-mp3' },
  { id: 'st-vapor', name: 'Vaporwaves', genre: 'Vaporwave', url: 'https://ice1.somafm.com/vaporwaves-128-mp3' },
  { id: 'st-defcon', name: 'DEF CON Radio', genre: 'Hacker / Electronic', url: 'https://ice1.somafm.com/defcon-128-mp3' },
  { id: 'st-nightride', name: 'Nightride FM', genre: 'Synthwave', url: 'https://stream.nightride.fm/nightride.mp3' },
  { id: 'st-chillsynth', name: 'Chillsynth', genre: 'Chill Synthwave', url: 'https://stream.nightride.fm/chillsynth.mp3' },
  { id: 'st-darksynth', name: 'Darksynth', genre: 'Cyberpunk / Darksynth', url: 'https://stream.nightride.fm/darksynth.mp3' }
]

function defaultLaunchers(): Launcher[] {
  if (process.platform === 'darwin') {
    return [
      { id: 'l-code', label: 'VS Code', kind: 'app', target: 'Visual Studio Code', icon: 'code', accent: 'sky' },
      { id: 'l-discord', label: 'Discord', kind: 'app', target: 'Discord', icon: 'message-circle', accent: 'violet' },
      { id: 'l-steam', label: 'Steam', kind: 'app', target: 'Steam', icon: 'gamepad', accent: 'emerald' },
      { id: 'l-terminal', label: 'Terminal', kind: 'app', target: 'Terminal', icon: 'terminal', accent: 'amber' },
      { id: 'l-downloads', label: 'Downloads', kind: 'path', target: '~/Downloads', icon: 'folder', accent: 'rose' }
    ]
  }
  return [
    { id: 'l-code', label: 'VS Code', kind: 'app', target: 'code', icon: 'code', accent: 'sky' },
    { id: 'l-discord', label: 'Discord', kind: 'url', target: 'discord://', icon: 'message-circle', accent: 'violet' },
    { id: 'l-steam', label: 'Steam', kind: 'url', target: 'steam://open/main', icon: 'gamepad', accent: 'emerald' },
    { id: 'l-downloads', label: 'Downloads', kind: 'path', target: '~/Downloads', icon: 'folder', accent: 'rose' }
  ]
}

interface Sealed {
  blob: string
  mode: 'safe' | 'aes'
}

interface PrivateSchema {
  vaultBlob: string | null
  vaultMode: 'safe' | 'aes' | null
  spotifyClientId: string | null
  spotifyAuth: Sealed | null
}

const store = new Store<StoreSchema & PrivateSchema>({
  name: 'u-hub',
  defaults: {
    sidebarCollapsed: false,
    lastView: 'performance',
    perfLayout: ['cpu', 'cores', 'memory', 'network', 'power'],
    quests: [
      { id: 'q-1', title: 'Farmar materiais da build Crit/Haste', tag: 'build', column: 'backlog', createdAt: Date.now() },
      { id: 'q-2', title: '/give @p minecraft:diamond 64', tag: 'code', column: 'active', createdAt: Date.now() },
      { id: 'q-3', title: 'Daily: missões semanais da season', tag: 'daily', column: 'done', createdAt: Date.now() }
    ],
    launchers: defaultLaunchers(),
    // Ids match the categories of the first release, so existing vault entries keep their category.
    vaultCategories: [
      { id: 'steam', label: 'Steam', icon: 'gamepad', accent: 'sky' },
      { id: 'discord', label: 'Discord', icon: 'message-circle', accent: 'indigo' },
      { id: 'minecraft', label: 'Minecraft Server', icon: 'pickaxe', accent: 'emerald' },
      { id: 'battlenet', label: 'Battle.net', icon: 'swords', accent: 'blue' },
      { id: 'other', label: 'Outros', icon: 'key-round', accent: 'zinc' }
    ],
    stations: DEFAULT_STATIONS,
    playlists: [{ id: 'pl-lofi', name: 'lofi beats', uri: 'spotify:playlist:37i9dQZF1DWWQRwui0ExPn' }],
    volume: 0.6,
    settings: DEFAULT_SETTINGS,
    vaultBlob: null,
    vaultMode: null,
    spotifyClientId: null,
    spotifyAuth: null
  }
})

const PUBLIC_KEYS = new Set<StoreKey>([
  'sidebarCollapsed', 'lastView', 'perfLayout', 'quests', 'launchers', 'stations', 'playlists', 'volume', 'vaultCategories', 'settings'
])

/** Keys included in backups (everything user-authored except secrets and Spotify auth). */
export const BACKUP_KEYS = [...PUBLIC_KEYS]

export function isPublicKey(key: unknown): key is StoreKey {
  return typeof key === 'string' && PUBLIC_KEYS.has(key as StoreKey)
}

export function getValue<K extends StoreKey>(key: K): StoreSchema[K] {
  return store.get(key)
}

export function setValue<K extends StoreKey>(key: K, value: StoreSchema[K]): void {
  store.set({ [key]: value } as Partial<StoreSchema>)
  if (key === 'settings') settingsListeners.forEach((l) => l(getSettings()))
}

// ── Settings ─────────────────────────────────────────────────────────────────

const settingsListeners = new Set<(s: AppSettings) => void>()

export function onSettingsChange(l: (s: AppSettings) => void): void {
  settingsListeners.add(l)
}

/** Stored settings merged over defaults, so keys added in newer versions always exist. */
export function getSettings(): AppSettings {
  return { ...DEFAULT_SETTINGS, ...store.get('settings') }
}

/** Wipes every stored value (settings, data, vault, Spotify session). */
export function resetStore(): void {
  store.clear()
}

// ── Vault ────────────────────────────────────────────────────────────────────
// Preferred path: OS keychain-backed safeStorage. Fallback (e.g. Linux without a
// secret service): AES-256-GCM with a random key file in userData — this only
// protects against casual reads of the store, not against someone with disk access.

function fallbackKey(): Buffer {
  const file = join(app.getPath('userData'), 'vault.key')
  if (!existsSync(file)) writeFileSync(file, randomBytes(32), { mode: 0o600 })
  return readFileSync(file)
}

function encrypt(plain: string): Sealed {
  if (safeStorage.isEncryptionAvailable()) {
    return { blob: safeStorage.encryptString(plain).toString('base64'), mode: 'safe' }
  }
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', fallbackKey(), iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return { blob: Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64'), mode: 'aes' }
}

function decrypt(blob: string, mode: 'safe' | 'aes'): string {
  const buf = Buffer.from(blob, 'base64')
  if (mode === 'safe') return safeStorage.decryptString(buf)
  const decipher = createDecipheriv('aes-256-gcm', fallbackKey(), buf.subarray(0, 12))
  decipher.setAuthTag(buf.subarray(12, 28))
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8')
}

export function readVault(): VaultEntry[] {
  const blob = store.get('vaultBlob')
  const mode = store.get('vaultMode')
  if (!blob || !mode) return []
  return JSON.parse(decrypt(blob, mode)) as VaultEntry[]
}

export function writeVault(entries: VaultEntry[]): void {
  const { blob, mode } = encrypt(JSON.stringify(entries))
  store.set({ vaultBlob: blob, vaultMode: mode })
}

export function vaultProtection(): 'keychain' | 'local-key' {
  return safeStorage.isEncryptionAvailable() ? 'keychain' : 'local-key'
}

// ── Spotify ──────────────────────────────────────────────────────────────────
// The Client ID is public by design (PKCE has no secret); tokens are sealed like the vault.

const BUILT_IN_CLIENT_ID = import.meta.env.MAIN_VITE_SPOTIFY_CLIENT_ID?.trim() || null

export const hasBuiltInSpotifyClientId = (): boolean => BUILT_IN_CLIENT_ID != null

/** The user's own Client ID wins; otherwise the one baked into this build (if any). */
export function getSpotifyClientId(): string | null {
  return store.get('spotifyClientId') ?? BUILT_IN_CLIENT_ID
}

export function getCustomSpotifyClientId(): string | null {
  return store.get('spotifyClientId')
}

export function setSpotifyClientId(id: string | null): void {
  store.set('spotifyClientId', id)
}

export function readSpotifyAuth<T>(): T | null {
  const sealed = store.get('spotifyAuth')
  if (!sealed) return null
  try {
    return JSON.parse(decrypt(sealed.blob, sealed.mode)) as T
  } catch {
    return null
  }
}

export function writeSpotifyAuth(auth: unknown): void {
  store.set('spotifyAuth', auth == null ? null : encrypt(JSON.stringify(auth)))
}
