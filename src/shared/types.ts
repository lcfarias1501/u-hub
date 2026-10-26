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

export type ModuleId = 'performance' | 'library' | 'radar' | 'news' | 'friends' | 'mail' | 'vault' | 'media' | 'quests'
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
  /** Store region for prices (Steam/Epic). 'auto' follows the OS region. */
  storeCountry: 'auto' | string
  // Appearance
  accent: ThemeAccent
  reduceMotion: boolean
  sidebarMode: 'remember' | 'expanded' | 'collapsed'
  zoom: number
  // Notifications
  notifications: NotificationSettings
  /** Electron accelerators ('' = unassigned). Global: they work while U-Hub is in the background. */
  shortcuts: Record<ShortcutAction, string>
  discord: DiscordSettings
  social: SocialSettings
  /** Text-to-speech for news: system voice URI (null = best Portuguese voice) and speed. */
  newsVoice: string | null
  newsRate: number
}

export type ShortcutAction = 'toggleWindow' | 'mediaPlayPause' | 'mediaNext' | 'mediaPrev' | 'radioVolumeUp' | 'radioVolumeDown'

export interface DiscordSettings {
  enabled: boolean
  /** Own Discord Application ID; null = the one built into this release. */
  clientId: string | null
  showGames: boolean
  showRadio: boolean
  /** Show "No U-Hub" when nothing is playing (otherwise the status is cleared). */
  showIdle: boolean
  /** "Baixar U-Hub" button on the status. */
  showButton: boolean
}

export type DiscordState = 'off' | 'no-client-id' | 'connecting' | 'not-running' | 'connected'

export interface DiscordStatus {
  state: DiscordState
  user: string | null
  /** What's currently shown, for the settings preview. */
  activity: { type: number; details: string; state?: string } | null
  hasBuiltInClientId: boolean
}

export type ShortcutStatus = Record<ShortcutAction, 'ok' | 'conflict' | 'unset'>

/** Everything is always recorded in the in-app center; these control the OS popups. */
export interface NotificationSettings {
  system: Record<NotificationKind, boolean>
  /** No OS popups while a game from the library is running. */
  quietWhilePlaying: boolean
  sound: boolean
  /** Unread count on the Dock / taskbar icon. */
  badge: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  modules: [
    { id: 'performance', visible: true },
    { id: 'library', visible: true },
    { id: 'radar', visible: true },
    { id: 'news', visible: true },
    { id: 'friends', visible: true },
    { id: 'mail', visible: true },
    { id: 'vault', visible: true },
    { id: 'media', visible: true },
    { id: 'quests', visible: true }
  ],
  openAtLogin: false,
  startMinimized: false,
  startView: 'last',
  closeToTray: false,
  storeCountry: 'auto',
  accent: 'violet',
  reduceMotion: false,
  sidebarMode: 'remember',
  zoom: 1,
  notifications: {
    system: { free: true, price: true, patch: true, game: false, social: true, mail: true, system: true },
    quietWhilePlaying: true,
    sound: true,
    badge: true
  },
  // ⌥⇧ / Alt+Shift combos are rarely taken by other apps.
  shortcuts: {
    toggleWindow: 'Alt+Shift+U',
    mediaPlayPause: 'Alt+Shift+P',
    mediaNext: 'Alt+Shift+Right',
    mediaPrev: 'Alt+Shift+Left',
    radioVolumeUp: '',
    radioVolumeDown: ''
  },
  discord: { enabled: true, clientId: null, showGames: true, showRadio: true, showIdle: false, showButton: true },
  social: { shareGame: true, shareMusic: true, invisible: false },
  newsVoice: null,
  newsRate: 1
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
  // Nested objects merge field by field so new keys get their defaults.
  const notifications = {
    ...DEFAULT_SETTINGS.notifications,
    ...stored?.notifications,
    system: { ...DEFAULT_SETTINGS.notifications.system, ...stored?.notifications?.system }
  }
  const shortcuts = { ...DEFAULT_SETTINGS.shortcuts, ...stored?.shortcuts }
  const discord = { ...DEFAULT_SETTINGS.discord, ...stored?.discord }
  const social = { ...DEFAULT_SETTINGS.social, ...stored?.social }
  return { ...s, modules, notifications, shortcuts, discord, social }
}

export interface AppInfo {
  version: string
  platform: string
  isPackaged: boolean
  userDataPath: string
  /** setLoginItemSettings only works for packaged apps on macOS/Windows. */
  canOpenAtLogin: boolean
  /** OS region (ISO country), used when the store region is 'auto'. */
  localeCountry: string
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
  wishlist: WishlistItem[]
  newsSources: NewsSource[]
  notifications: AppNotification[]
  /** Last app version whose "what's new" the user has seen. */
  lastSeenVersion: string | null
  profile: Profile | null
  /** First-run presentation finished (or skipped). */
  onboarded: boolean
  mailAccounts: MailAccount[]
  mailCategories: MailCategory[]
  mailRules: MailRule[]
  /** Senders whose remote images load automatically. */
  mailTrustedSenders: string[]
  /** News categories the user follows. */
  newsFollow: NewsCategoryId[]
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

/** Local profile: shown in the app now, and the seed for the future online profile. */
export interface Profile {
  name: string
  avatar: { icon: string; accent: Accent }
}

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

// ── Deals & news ("Radar") ───────────────────────────────────────────────────

export interface FreeGame {
  id: string
  title: string
  image: string | null
  url: string
  /** Original price as the store formats it (e.g. "R$ 52,99"). */
  originalPrice: string | null
  startsAt: number
  endsAt: number
  /** Free right now, or announced as the next freebie. */
  status: 'now' | 'upcoming'
}

/** Prices are in the smallest currency unit (cents), as Steam returns them. */
export interface Deal {
  appid: number
  name: string
  image: string
  discount: number
  initial: number
  final: number
  currency: string
  endsAt: number | null
}

export interface WishlistItem {
  appid: number
  name: string
  image: string
  addedAt: number
  /** Alert when the price is at or below this (cents). Null = alert on any discount. */
  target: number | null
  currency: string | null
  final: number | null
  initial: number | null
  discount: number
  lowest: number | null
  checkedAt: number | null
}

export interface SteamSearchResult {
  appid: number
  name: string
  image: string
  final: number | null
  currency: string | null
}

export interface NewsSource {
  id: string
  name: string
  url: string
  enabled: boolean
  category: NewsCategoryId
  /** Added by the user (can be removed); built-in sources can only be disabled. */
  custom?: boolean
}

export type NewsCategoryId = 'games' | 'tech' | 'world' | 'sports' | 'music' | 'movies' | 'science' | 'economy' | 'other'

export const NEWS_CATEGORIES: { id: NewsCategoryId; label: string; icon: string }[] = [
  { id: 'games', label: 'Jogos', icon: 'gamepad' },
  { id: 'tech', label: 'Tecnologia', icon: 'cpu' },
  { id: 'world', label: 'Mundo', icon: 'globe' },
  { id: 'sports', label: 'Esportes', icon: 'trophy' },
  { id: 'music', label: 'Música', icon: 'music' },
  { id: 'movies', label: 'Cinema & Séries', icon: 'tv' },
  { id: 'science', label: 'Ciência', icon: 'rocket' },
  { id: 'economy', label: 'Economia', icon: 'coins' },
  { id: 'other', label: 'Outros', icon: 'star' }
]

export interface NewsSnapshot {
  items: NewsItem[]
  updatedAt: number | null
  refreshing: boolean
  errors: string[]
}

/** A piece of an extracted article. Plain text only: the reader renders it natively, and TTS reads it block by block. */
export type ArticleBlock = { kind: 'p' | 'h' | 'quote' | 'li'; text: string } | { kind: 'img'; src: string; caption: string | null }

/** Reader-mode extraction of an article page. ok=false → show the feed summary + "open on site". */
export interface ArticleContent {
  ok: boolean
  url: string
  title: string
  byline: string | null
  siteName: string | null
  blocks: ArticleBlock[]
  image: string | null
  /** BCP-47-ish language of the page (from <html lang>), to pick a matching voice. */
  lang: string | null
  error?: string
}

export interface FeedDiscovery {
  ok: boolean
  url?: string
  title?: string
  sample?: string[]
  error?: string
}

export interface NewsItem {
  id: string
  title: string
  url: string
  date: number
  summary: string
  image: string | null
  /** Feed name for RSS; game name for Steam news. */
  source: string
  kind: 'rss' | 'steam'
  category: NewsCategoryId
  appid?: number
  patch: boolean
}

export interface RadarSnapshot {
  free: FreeGame[]
  deals: Deal[]
  updatedAt: number | null
  refreshing: boolean
  errors: string[]
}

// ── Notifications ────────────────────────────────────────────────────────────

export type NotificationKind = 'free' | 'price' | 'patch' | 'game' | 'social' | 'mail' | 'system'

export interface AppNotification {
  id: string
  kind: NotificationKind
  title: string
  body: string
  createdAt: number
  read: boolean
  url?: string
  image?: string | null
  /** View to open when clicked inside the app. */
  view?: ViewId
}

// ── Social (Supabase) ────────────────────────────────────────────────────────

export interface SocialProfile {
  id: string
  username: string
  displayName: string
  avatarIcon: string
  avatarAccent: Accent
  discordAvatar: string | null
  friendCode: string
}

export type PresenceStatus = 'online' | 'away' | 'playing'

/** What a user broadcasts on their private presence channel. */
export interface Presence {
  status: PresenceStatus
  game?: { name: string; cover: string | null; since: number }
  music?: { title: string; subtitle: string }
  at: number
}

export interface Friend {
  profile: SocialProfile
  since: string
  /** null = offline (not connected, or invisible). */
  presence: Presence | null
}

export interface FriendRequest {
  id: string
  incoming: boolean
  profile: SocialProfile
  createdAt: string
}

export interface SocialState {
  /** False when this build has no Supabase project configured. */
  configured: boolean
  signedIn: boolean
  loading: boolean
  me: SocialProfile | null
  myPresence: Presence | null
  friends: Friend[]
  requests: FriendRequest[]
  error: string | null
  /** Login methods on the account: 'email', 'discord'. */
  account: { email: string | null; providers: string[] } | null
  /** Waiting for the user to click the confirmation link sent to this address. */
  pendingEmail: string | null
  /** Signed in through a password-reset link: ask for a new password. */
  recovery: boolean
}

export interface SyncStatus {
  state: 'off' | 'syncing' | 'synced' | 'error' | 'conflict'
  lastSyncedAt: number | null
  error: string | null
}

export type FriendRequestResult = 'sent' | 'accepted' | 'already_friends' | 'already_sent' | 'not_found' | 'self'

export interface SocialSettings {
  /** Share the game you're playing with friends. */
  shareGame: boolean
  /** Share the radio station you're listening to. */
  shareMusic: boolean
  /** Appear offline to everyone. */
  invisible: boolean
}

// ── Mail ─────────────────────────────────────────────────────────────────────

export type MailPreset = 'gmail' | 'icloud' | 'yahoo' | 'zoho' | 'outlook' | 'custom'

export interface MailServer {
  host: string
  port: number
  /** true = TLS from the start (993/465); false = STARTTLS (143/587). */
  secure: boolean
}

/** Account config without the password (that one is sealed separately and never synced). */
export interface MailAccount {
  id: string
  name: string
  email: string
  preset: MailPreset
  username: string
  imap: MailServer
  smtp: MailServer
  accent: Accent
  signature: string
  /** OS notification for new mail: everything, only mail matching a notifying category, or none. */
  notify: 'all' | 'categories' | 'none'
}

export interface MailAccountStatus {
  id: string
  state: 'connecting' | 'online' | 'error' | 'offline'
  error: string | null
  unread: number
}

export interface MailFolder {
  path: string
  name: string
  /** IMAP special-use flag: \Inbox, \Sent, \Drafts, \Trash, \Junk, \Archive, \All, \Flagged — or null. */
  specialUse: string | null
  unread: number | null
}

export interface MailAddress {
  name: string
  address: string
}

export interface MailSummary {
  accountId: string
  folder: string
  uid: number
  from: MailAddress
  to: MailAddress[]
  subject: string
  date: number
  seen: boolean
  flagged: boolean
  hasAttachments: boolean
  snippet: string
  /** Verification code detected in the first part of the message. */
  code: string | null
}

export interface MailAttachment {
  index: number
  filename: string
  contentType: string
  size: number
}

export interface MailMessage extends MailSummary {
  cc: MailAddress[]
  replyTo: MailAddress[]
  messageId: string | null
  references: string[]
  html: string | null
  text: string
  attachments: MailAttachment[]
  codes: string[]
  gameKeys: string[]
  /** HTML references remote images (blocked until the user allows them). */
  remoteImages: boolean
}

export interface MailCategory {
  id: string
  name: string
  icon: string
  accent: Accent
  /** New mail matching this category triggers a notification (with account notify = 'categories'). */
  notify: boolean
}

export interface MailRule {
  id: string
  categoryId: string
  field: 'from' | 'to' | 'subject'
  contains: string
}

export interface MailDraft {
  accountId: string
  to: string
  cc: string
  bcc: string
  subject: string
  body: string
  attachments: string[]
  inReplyTo?: string | null
  references?: string[]
}

export const MAIL_PRESETS: Record<MailPreset, { label: string; imap: MailServer; smtp: MailServer; help: string; helpUrl?: string }> = {
  gmail: {
    label: 'Gmail',
    imap: { host: 'imap.gmail.com', port: 993, secure: true },
    smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
    help: 'Use uma senha de app (não a senha normal): Conta Google → Segurança → Verificação em duas etapas → Senhas de app.',
    helpUrl: 'https://myaccount.google.com/apppasswords'
  },
  icloud: {
    label: 'iCloud',
    imap: { host: 'imap.mail.me.com', port: 993, secure: true },
    smtp: { host: 'smtp.mail.me.com', port: 587, secure: false },
    help: 'Use uma senha específica de app: account.apple.com → Iniciar sessão e segurança → Senhas específicas de app.',
    helpUrl: 'https://account.apple.com'
  },
  yahoo: {
    label: 'Yahoo',
    imap: { host: 'imap.mail.yahoo.com', port: 993, secure: true },
    smtp: { host: 'smtp.mail.yahoo.com', port: 465, secure: true },
    help: 'Gere uma senha de app em Segurança da conta → Gerar senha de app.',
    helpUrl: 'https://login.yahoo.com/account/security'
  },
  zoho: {
    label: 'Zoho',
    imap: { host: 'imap.zoho.com', port: 993, secure: true },
    smtp: { host: 'smtp.zoho.com', port: 465, secure: true },
    help: 'Ative o acesso IMAP nas configurações do Zoho Mail. Com 2FA, use uma senha de app.'
  },
  outlook: {
    label: 'Outlook / Hotmail',
    imap: { host: 'outlook.office365.com', port: 993, secure: true },
    smtp: { host: 'smtp.office365.com', port: 587, secure: false },
    help: 'Contas Microsoft pessoais (outlook.com/hotmail) não aceitam mais senha nesse tipo de acesso — só funciona em contas corporativas que liberem IMAP com senha.'
  },
  custom: {
    label: 'Outro (IMAP/SMTP)',
    imap: { host: '', port: 993, secure: true },
    smtp: { host: '', port: 465, secure: true },
    help: 'Pegue os dados de IMAP e SMTP no painel do seu provedor ou hospedagem.'
  }
}

// ── Mail helpers (shared by main and renderer) ───────────────────────────────

const CODE_HINT = /(c[oó]digo|code|pin|otp|token|verifica|confirma|steam guard|login|acesso|access|seguran|security|one[- ]time)/i

/**
 * Verification codes ("Seu código é 482913", Steam Guard "F7K2M"): a 4–8 char
 * token with at least one digit, close to a keyword. Conservative on purpose —
 * a wrong "Copiar código" is worse than none.
 */
export function extractCodes(subject: string, text: string): string[] {
  const out = new Set<string>()
  const hay = `${subject}\n${text}`.slice(0, 6000)
  const re = /\b([A-Z0-9]{4,8})\b/g
  for (const m of hay.matchAll(re)) {
    const tok = m[1]
    if (!/\d/.test(tok) || /^(19|20)\d{2}$/.test(tok)) continue // needs a digit; skip years
    if (/^\d+$/.test(tok) && (tok.length < 4 || tok.length > 8)) continue
    const around = hay.slice(Math.max(0, m.index! - 80), m.index! + tok.length + 20)
    if (CODE_HINT.test(around)) out.add(tok)
    if (out.size >= 3) break
  }
  return [...out]
}

/** Game keys like Steam's XXXXX-XXXXX-XXXXX (also 4×4 and 5×5 groups). */
export function extractGameKeys(text: string): string[] {
  const re = /\b(?:[A-Z0-9]{5}(?:-[A-Z0-9]{5}){2,4}|[A-Z0-9]{4}(?:-[A-Z0-9]{4}){3})\b/g
  return [...new Set([...text.matchAll(re)].map((m) => m[0]).filter((k) => /\d/.test(k) && /[A-Z]/.test(k)))].slice(0, 10)
}

/** Categories a message falls into, by the user's rules (case-insensitive "contains"). */
export function categorize(m: Pick<MailSummary, 'from' | 'to' | 'subject'>, rules: MailRule[]): string[] {
  const hit = new Set<string>()
  for (const r of rules) {
    const needle = r.contains.trim().toLowerCase()
    if (!needle) continue
    const hay =
      r.field === 'from'
        ? `${m.from.name} ${m.from.address}`
        : r.field === 'to'
          ? m.to.map((a) => `${a.name} ${a.address}`).join(' ')
          : m.subject
    if (hay.toLowerCase().includes(needle)) hit.add(r.categoryId)
  }
  return [...hit]
}
