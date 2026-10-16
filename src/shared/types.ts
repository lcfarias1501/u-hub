// Contracts shared by main, preload and renderer.

export interface SystemSnapshot {
  t: number
  cpu: { total: number; cores: number[] }
  mem: { total: number; used: number; free: number; swapUsed: number }
  net: { rxSec: number; txSec: number; iface: string }
  battery: { present: boolean; percent: number; charging: boolean; timeRemaining: number | null }
  temp: { main: number | null; max: number | null }
}

export interface SystemStatic {
  cpuBrand: string
  cpuCores: number
  cpuSpeed: number
  os: string
  hostname: string
  arch: string
}

/** Shared colour tokens for user-picked accents (vault categories, launcher tiles). */
export type Accent = 'violet' | 'indigo' | 'blue' | 'sky' | 'emerald' | 'amber' | 'rose' | 'zinc'

/** User-defined vault category. Entries reference it by `id`. */
export interface VaultCategoryDef {
  id: string
  label: string
  /** Key into the renderer's icon registry (lib/icons.ts). */
  icon: string
  accent: Accent
}

/** The fallback category: can be edited but never deleted; entries of deleted categories move here. */
export const FALLBACK_CATEGORY_ID = 'other'

export interface VaultEntry {
  id: string
  category: string
  title: string
  username: string
  secret: string
  host: string
  notes: string
  updatedAt: number
}

export type QuestColumn = 'backlog' | 'active' | 'done'
export type QuestTag = 'build' | 'code' | 'daily' | 'misc'

export interface Quest {
  id: string
  title: string
  tag: QuestTag
  column: QuestColumn
  createdAt: number
}

export type LauncherKind = 'app' | 'path' | 'url'

export interface Launcher {
  id: string
  label: string
  kind: LauncherKind
  /** App name/executable path, a folder/file path, or a URL (http, steam://, discord://…). */
  target: string
  icon: string
  accent: Accent
}

export interface RadioStation {
  id: string
  name: string
  genre: string
  url: string
  custom?: boolean
}

export interface SpotifyPlaylist {
  id: string
  name: string
  uri: string
}

export type ModuleId = 'performance' | 'library' | 'vault' | 'media' | 'quests'
export type ViewId = ModuleId | 'settings'

/** App-wide accent (the "volt" colour). A subset of Accent that reads well as a primary. */
export type ThemeAccent = 'violet' | 'indigo' | 'sky' | 'emerald' | 'amber' | 'rose'

export interface AppSettings {
  /** Sidebar order and visibility. At least one module stays visible. */
  modules: { id: ModuleId; visible: boolean }[]
  // General
  openAtLogin: boolean
  startMinimized: boolean
  startView: ModuleId | 'last'
  closeToTray: boolean
  // Appearance
  accent: ThemeAccent
  reduceMotion: boolean
  sidebarMode: 'remember' | 'expanded' | 'collapsed'
  zoom: number
}

export const DEFAULT_SETTINGS: AppSettings = {
  modules: [
    { id: 'performance', visible: true },
    { id: 'library', visible: true },
    { id: 'vault', visible: true },
    { id: 'media', visible: true },
    { id: 'quests', visible: true }
  ],
  openAtLogin: false,
  startMinimized: false,
  startView: 'last',
  closeToTray: false,
  accent: 'violet',
  reduceMotion: false,
  sidebarMode: 'remember',
  zoom: 1
}

/**
 * Stored settings merged over defaults. Modules added in newer versions are
 * inserted at their default position so existing users see them.
 */
export function normalizeSettings(stored: Partial<AppSettings> | null | undefined): AppSettings {
  const s = { ...DEFAULT_SETTINGS, ...stored }
  const known = new Set(DEFAULT_SETTINGS.modules.map((m) => m.id))
  const modules = (stored?.modules ?? []).filter((m) => known.has(m.id))
  for (const [i, def] of DEFAULT_SETTINGS.modules.entries()) {
    if (!modules.some((m) => m.id === def.id)) modules.splice(Math.min(i, modules.length), 0, { ...def })
  }
  return { ...s, modules }
}

export interface AppInfo {
  version: string
  platform: string
  isPackaged: boolean
  userDataPath: string
  /** setLoginItemSettings only works for packaged apps on macOS/Windows. */
  canOpenAtLogin: boolean
}

export interface BackupSummary {
  path: string
  createdAt: string
  appVersion: string
  hasVault: boolean
  counts: { quests: number; launchers: number; categories: number; stations: number }
}

/** Plain (non-secret) keys persisted through electron-store. The vault lives in its own encrypted blob. */
export interface StoreSchema {
  sidebarCollapsed: boolean
  lastView: ViewId
  perfLayout: string[]
  quests: Quest[]
  launchers: Launcher[]
  vaultCategories: VaultCategoryDef[]
  settings: AppSettings
  manualGames: ManualGame[]
  hiddenGames: string[]
  playtime: PlaytimeLog
  stations: RadioStation[]
  playlists: SpotifyPlaylist[]
  volume: number
}

export type StoreKey = keyof StoreSchema

export interface LaunchResult {
  ok: boolean
  error?: string
}

// ── Spotify Web API ──────────────────────────────────────────────────────────

/** Fixed loopback port for the OAuth callback; must match the Redirect URI in the Spotify dashboard. */
export const SPOTIFY_REDIRECT_URI = 'http://127.0.0.1:43821/callback'

export interface SpotifyStatus {
  clientId: string | null
  /** True when this build ships a default Client ID, so users can connect without creating their own app. */
  hasBuiltInClientId: boolean
  /** True when the user overrode the built-in Client ID with their own. */
  usingCustomClientId: boolean
  connected: boolean
  user: { name: string; product: string; avatar: string | null } | null
}

export interface SpotifyDevice {
  id: string
  name: string
  type: string
  isActive: boolean
  volume: number | null
}

export interface SpotifyPlayback {
  isPlaying: boolean
  progressMs: number
  durationMs: number
  shuffle: boolean
  repeat: 'off' | 'context' | 'track'
  track: { name: string; artists: string; album: string; image: string | null; uri: string } | null
  device: SpotifyDevice | null
  contextUri: string | null
  fetchedAt: number
}

export interface SpotifyPlaylistItem {
  uri: string
  name: string
  image: string | null
  tracks: number
  owner: string
}

export type SpotifyCommand =
  | { type: 'play'; contextUri?: string; deviceId?: string }
  | { type: 'pause' }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'seek'; positionMs: number }
  | { type: 'volume'; percent: number }
  | { type: 'shuffle'; state: boolean }
  | { type: 'repeat'; state: 'off' | 'context' | 'track' }
  | { type: 'transfer'; deviceId: string }

/** `reason` mirrors Spotify's player error reasons (e.g. NO_ACTIVE_DEVICE, PREMIUM_REQUIRED). */
export type SpotifyResult<T = void> = { ok: true; data: T } | { ok: false; error: string; reason?: string }

// ── Updates ──────────────────────────────────────────────────────────────────

export interface UpdateStatus {
  state: 'idle' | 'available' | 'downloading' | 'ready'
  currentVersion: string
  version?: string
  progress?: number
  /** False on macOS, where unsigned apps can't self-update; the UI links to the release instead. */
  canInstall?: boolean
}

// ── Radio relay (main window ⇄ menu bar popover) ─────────────────────────────

/** Snapshot of the radio, published by the main window (which owns the audio element). */
export interface RadioState {
  station: { id: string; name: string; genre: string } | null
  playing: boolean
  loading: boolean
  error: string | null
  volume: number
}

export type RadioCommand = { type: 'toggle' } | { type: 'next' } | { type: 'prev' } | { type: 'stop' } | { type: 'volume'; value: number }

// ── Game library ─────────────────────────────────────────────────────────────

export type GameSource = 'steam' | 'epic' | 'manual'

export interface Game {
  /** Stable id: `steam:<appid>`, `epic:<appName>` or `manual:<uuid>`. */
  id: string
  source: GameSource
  name: string
  /** Folder whose running processes count as "playing" (Steam/Epic install dir, or the .app bundle). */
  installDir: string | null
  /** Cover image URL, if known. */
  cover: string | null
  /** Hero/header image for the "now playing" banner. */
  hero: string | null
  /** Minutes reported by the source itself (Steam keeps its own total). */
  sourceMinutes: number | null
  sourceLastPlayed: number | null
}

/** User-added game, persisted in electron-store. */
export interface ManualGame {
  id: string
  name: string
  /** .app bundle, .exe or any executable; also used to detect it running. */
  path: string
  cover: string | null
}

/** Per-game time tracked by U-Hub (ms). Days are local dates `YYYY-MM-DD`. */
export interface PlaytimeEntry {
  totalMs: number
  lastPlayed: number
  sessions: number
  days: Record<string, number>
}

export type PlaytimeLog = Record<string, PlaytimeEntry>

export interface NowPlayingGame {
  id: string
  name: string
  startedAt: number
}

export interface LibrarySnapshot {
  games: Game[]
  playtime: PlaytimeLog
  nowPlaying: NowPlayingGame[]
  scannedAt: number
  /** Which launchers were found on this machine. */
  sources: Record<Exclude<GameSource, 'manual'>, boolean>
}
