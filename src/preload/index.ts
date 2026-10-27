import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppInfo,
  BackupSummary,
  LaunchResult,
  LibrarySnapshot,
  AppNotification,
  RadarSnapshot,
  NewsSnapshot,
  DiscoverQuery,
  Episode,
  Genre,
  MediaType,
  MoviesHome,
  MoviesStatus,
  TitleDetails,
  TitlePage,
  WatchProvider,
  ArticleContent,
  FeedDiscovery,
  SteamSearchResult,
  DiscordStatus,
  ShortcutStatus,
  Accent,
  FriendRequestResult,
  SocialState,
  SyncStatus,
  MailAccount,
  MailAccountStatus,
  MailDraft,
  MailFolder,
  MailMessage,
  MailSummary,
  ModuleId,
  RadioCommand,
  RadioState,
  SpotifyCommand,
  SpotifyDevice,
  SpotifyPlayback,
  SpotifyPlaylistItem,
  SpotifyResult,
  SpotifyStatus,
  UpdateStatus,
  StoreKey,
  StoreSchema,
  SystemSnapshot,
  SystemStatic,
  VaultEntry
} from '@shared/types'

const api = {
  platform: process.platform,
  system: {
    static: (): Promise<SystemStatic> => ipcRenderer.invoke('system:static'),
    onTick: (cb: (s: SystemSnapshot) => void): (() => void) => {
      const listener = (_: unknown, s: SystemSnapshot): void => cb(s)
      ipcRenderer.on('system:tick', listener)
      return () => ipcRenderer.off('system:tick', listener)
    }
  },
  store: {
    get: <K extends StoreKey>(key: K): Promise<StoreSchema[K]> => ipcRenderer.invoke('store:get', key),
    set: <K extends StoreKey>(key: K, value: StoreSchema[K]): Promise<void> =>
      ipcRenderer.invoke('store:set', key, value),
    onChanged: (cb: (key: StoreKey) => void): (() => void) => {
      const listener = (_: unknown, key: StoreKey): void => cb(key)
      ipcRenderer.on('store:changed', listener)
      return () => ipcRenderer.off('store:changed', listener)
    }
  },
  vault: {
    /** `error` set = the stored vault exists but can't be decrypted here; writes are refused until startOver. */
    read: (): Promise<{ entries: VaultEntry[]; protection: 'keychain' | 'local-key'; error: string | null }> => ipcRenderer.invoke('vault:read'),
    write: (entries: VaultEntry[]): Promise<void> => ipcRenderer.invoke('vault:write', entries),
    startOver: (): Promise<string | null> => ipcRenderer.invoke('vault:startOver')
  },
  clipboard: {
    copy: (text: string, sensitive = false): Promise<void> => ipcRenderer.invoke('clipboard:copy', text, sensitive)
  },
  spotify: {
    status: (): Promise<SpotifyStatus> => ipcRenderer.invoke('spotify:status'),
    setClientId: (id: string): Promise<void> => ipcRenderer.invoke('spotify:setClientId', id),
    login: (): Promise<SpotifyResult> => ipcRenderer.invoke('spotify:login'),
    logout: (): Promise<void> => ipcRenderer.invoke('spotify:logout'),
    playback: (): Promise<SpotifyResult<SpotifyPlayback | null>> => ipcRenderer.invoke('spotify:playback'),
    devices: (): Promise<SpotifyResult<SpotifyDevice[]>> => ipcRenderer.invoke('spotify:devices'),
    playlists: (): Promise<SpotifyResult<SpotifyPlaylistItem[]>> => ipcRenderer.invoke('spotify:playlists'),
    playHere: (): Promise<SpotifyResult<string>> => ipcRenderer.invoke('spotify:playHere'),
    command: (cmd: SpotifyCommand): Promise<SpotifyResult> => ipcRenderer.invoke('spotify:command', cmd)
  },
  updater: {
    status: (): Promise<UpdateStatus> => ipcRenderer.invoke('updater:status'),
    apply: (): Promise<void> => ipcRenderer.invoke('updater:apply'),
    check: (): Promise<'dev' | 'latest' | 'available' | 'error'> => ipcRenderer.invoke('updater:check'),
    onStatus: (cb: (s: UpdateStatus) => void): (() => void) => {
      const listener = (_: unknown, s: UpdateStatus): void => cb(s)
      ipcRenderer.on('updater:status', listener)
      return () => ipcRenderer.off('updater:status', listener)
    }
  },
  app: {
    info: (): Promise<AppInfo> => ipcRenderer.invoke('app:info'),
    openDataFolder: (): Promise<string> => ipcRenderer.invoke('app:openDataFolder'),
    reset: (): Promise<void> => ipcRenderer.invoke('app:reset'),
    /** View a notification asked for while the window was closed (macOS), once. */
    takePendingView: (): Promise<ModuleId | 'settings' | null> => ipcRenderer.invoke('app:takePendingView'),
    /** Navigation requested from outside the page (tray menu). */
    onNavigate: (cb: (view: ModuleId | 'settings') => void): (() => void) => {
      const listener = (_: unknown, v: ModuleId | 'settings'): void => cb(v)
      ipcRenderer.on('nav:go', listener)
      return () => ipcRenderer.off('nav:go', listener)
    }
  },
  /** Radio relay: the main window publishes and executes; the menu bar popover reads and commands. */
  radio: {
    publish: (state: RadioState): void => ipcRenderer.send('radio:publish', state),
    get: (): Promise<RadioState> => ipcRenderer.invoke('radio:get'),
    onState: (cb: (s: RadioState) => void): (() => void) => {
      const listener = (_: unknown, s: RadioState): void => cb(s)
      ipcRenderer.on('radio:state', listener)
      return () => ipcRenderer.off('radio:state', listener)
    },
    command: (cmd: RadioCommand): void => ipcRenderer.send('radio:command', cmd),
    /** News text-to-speech running: global media shortcuts should go to the main window, not Spotify. */
    setSpeaking: (on: boolean): void => ipcRenderer.send('speech:active', on),
    onCommand: (cb: (cmd: RadioCommand) => void): (() => void) => {
      const listener = (_: unknown, c: RadioCommand): void => cb(c)
      ipcRenderer.on('radio:command', listener)
      return () => ipcRenderer.off('radio:command', listener)
    }
  },
  popover: {
    hide: (): void => ipcRenderer.send('popover:hide'),
    showMain: (view?: ModuleId | 'settings'): void => ipcRenderer.send('app:showMain', view),
    quit: (): void => ipcRenderer.send('app:quit'),
    /** Reports the page's content height so the window can fit it. */
    resize: (height: number): void => ipcRenderer.send('popover:resize', height),
    onShown: (cb: () => void): (() => void) => {
      const listener = (): void => cb()
      ipcRenderer.on('popover:shown', listener)
      return () => ipcRenderer.off('popover:shown', listener)
    }
  },
  backup: {
    export: (password: string | null): Promise<{ ok: boolean; path?: string }> => ipcRenderer.invoke('backup:export', password),
    inspect: (): Promise<BackupSummary | null> => ipcRenderer.invoke('backup:inspect'),
    restore: (password: string | null): Promise<void> => ipcRenderer.invoke('backup:restore', password)
  },
  mail: {
    status: (): Promise<MailAccountStatus[]> => ipcRenderer.invoke('mail:status'),
    test: (account: MailAccount, pass: string): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('mail:test', account, pass),
    saveAccount: (account: MailAccount, pass: string | null): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('mail:saveAccount', account, pass),
    removeAccount: (id: string): Promise<void> => ipcRenderer.invoke('mail:removeAccount', id),
    folders: (id: string): Promise<MailFolder[]> => ipcRenderer.invoke('mail:folders', id),
    list: (id: string, folder: string, page: number, query: string): Promise<{ items: MailSummary[]; total: number }> => ipcRenderer.invoke('mail:list', id, folder, page, query),
    category: (categoryId: string): Promise<MailSummary[]> => ipcRenderer.invoke('mail:category', categoryId),
    open: (id: string, folder: string, uid: number): Promise<MailMessage> => ipcRenderer.invoke('mail:open', id, folder, uid),
    flag: (id: string, folder: string, uid: number, flag: 'seen' | 'flagged', value: boolean): Promise<void> => ipcRenderer.invoke('mail:flag', id, folder, uid, flag, value),
    move: (id: string, folder: string, uid: number, to: 'archive' | 'trash'): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('mail:move', id, folder, uid, to),
    send: (draft: MailDraft): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('mail:send', draft),
    pickAttachments: (): Promise<{ files: string[]; skipped: string[] }> => ipcRenderer.invoke('mail:pickAttachments'),
    saveAttachment: (id: string, folder: string, uid: number, index: number): Promise<{ ok: boolean; path?: string }> => ipcRenderer.invoke('mail:saveAttachment', id, folder, uid, index),
    onStatus: (cb: (s: MailAccountStatus[]) => void): (() => void) => {
      const listener = (_: unknown, s: MailAccountStatus[]): void => cb(s)
      ipcRenderer.on('mail:status', listener)
      return () => ipcRenderer.off('mail:status', listener)
    },
    /** Snippets/codes arriving after a list was shown. */
    onPreviews: (cb: (p: { accountId: string; folder: string; uid: number; snippet: string; code: string | null }[]) => void): (() => void) => {
      const listener = (_: unknown, p: { accountId: string; folder: string; uid: number; snippet: string; code: string | null }[]): void => cb(p)
      ipcRenderer.on('mail:previews', listener)
      return () => ipcRenderer.off('mail:previews', listener)
    },
    onNew: (cb: (m: MailSummary[]) => void): (() => void) => {
      const listener = (_: unknown, m: MailSummary[]): void => cb(m)
      ipcRenderer.on('mail:new', listener)
      return () => ipcRenderer.off('mail:new', listener)
    }
  },
  sync: {
    status: (): Promise<SyncStatus> => ipcRenderer.invoke('sync:status'),
    resolve: (keep: 'cloud' | 'local'): Promise<void> => ipcRenderer.invoke('sync:resolve', keep),
    now: (): Promise<void> => ipcRenderer.invoke('sync:now'),
    onUpdate: (cb: (s: SyncStatus) => void): (() => void) => {
      const listener = (_: unknown, s: SyncStatus): void => cb(s)
      ipcRenderer.on('sync:update', listener)
      return () => ipcRenderer.off('sync:update', listener)
    }
  },
  social: {
    get: (): Promise<SocialState> => ipcRenderer.invoke('social:get'),
    signInDiscord: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('social:signInDiscord'),
    linkDiscord: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('social:linkDiscord'),
    signUpEmail: (form: { email: string; password: string; username: string; displayName: string }): Promise<{ ok: boolean; needsConfirmation?: boolean; error?: string }> =>
      ipcRenderer.invoke('social:signUpEmail', form),
    signInEmail: (email: string, password: string): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('social:signInEmail', email, password),
    resetPassword: (email: string): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('social:resetPassword', email),
    setPassword: (password: string): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('social:setPassword', password),
    usernameAvailable: (name: string): Promise<boolean | null> => ipcRenderer.invoke('social:usernameAvailable', name),
    signOut: (): Promise<void> => ipcRenderer.invoke('social:signOut'),
    addFriend: (target: string): Promise<{ result?: FriendRequestResult; error?: string }> => ipcRenderer.invoke('social:addFriend', target),
    respond: (id: string, accept: boolean): Promise<{ error?: string }> => ipcRenderer.invoke('social:respond', id, accept),
    cancel: (id: string): Promise<{ error?: string }> => ipcRenderer.invoke('social:cancel', id),
    remove: (friendId: string): Promise<{ error?: string }> => ipcRenderer.invoke('social:remove', friendId),
    updateProfile: (patch: { username?: string; displayName?: string; avatarIcon?: string; avatarAccent?: Accent }): Promise<{ error?: string }> =>
      ipcRenderer.invoke('social:updateProfile', patch),
    onUpdate: (cb: (s: SocialState) => void): (() => void) => {
      const listener = (_: unknown, s: SocialState): void => cb(s)
      ipcRenderer.on('social:update', listener)
      return () => ipcRenderer.off('social:update', listener)
    }
  },
  shortcuts: {
    status: (): Promise<ShortcutStatus> => ipcRenderer.invoke('shortcuts:status'),
    /** Suspend global shortcuts while the user records a new combination. */
    pause: (pause: boolean): Promise<void> => ipcRenderer.invoke('shortcuts:pause', pause),
    onStatus: (cb: (s: ShortcutStatus) => void): (() => void) => {
      const listener = (_: unknown, s: ShortcutStatus): void => cb(s)
      ipcRenderer.on('shortcuts:status', listener)
      return () => ipcRenderer.off('shortcuts:status', listener)
    }
  },
  discord: {
    status: (): Promise<DiscordStatus> => ipcRenderer.invoke('discord:status'),
    onStatus: (cb: (s: DiscordStatus) => void): (() => void) => {
      const listener = (_: unknown, s: DiscordStatus): void => cb(s)
      ipcRenderer.on('discord:status', listener)
      return () => ipcRenderer.off('discord:status', listener)
    }
  },
  radar: {
    get: (): Promise<RadarSnapshot> => ipcRenderer.invoke('radar:get'),
    refresh: (): Promise<RadarSnapshot> => ipcRenderer.invoke('radar:refresh'),
    search: (term: string): Promise<SteamSearchResult[]> => ipcRenderer.invoke('radar:search', term),
    onUpdate: (cb: (s: RadarSnapshot) => void): (() => void) => {
      const listener = (_: unknown, s: RadarSnapshot): void => cb(s)
      ipcRenderer.on('radar:update', listener)
      return () => ipcRenderer.off('radar:update', listener)
    }
  },
  movies: {
    status: (): Promise<MoviesStatus> => ipcRenderer.invoke('movies:status'),
    home: (): Promise<MoviesHome> => ipcRenderer.invoke('movies:home'),
    genres: (type: MediaType): Promise<Genre[]> => ipcRenderer.invoke('movies:genres', type),
    providers: (): Promise<WatchProvider[]> => ipcRenderer.invoke('movies:providers'),
    discover: (q: DiscoverQuery): Promise<TitlePage> => ipcRenderer.invoke('movies:discover', q),
    search: (query: string, page = 1): Promise<TitlePage> => ipcRenderer.invoke('movies:search', query, page),
    details: (type: MediaType, id: number): Promise<TitleDetails> => ipcRenderer.invoke('movies:details', type, id),
    season: (id: number, n: number): Promise<Episode[]> => ipcRenderer.invoke('movies:season', id, n)
  },
  news: {
    get: (): Promise<NewsSnapshot> => ipcRenderer.invoke('news:get'),
    refresh: (): Promise<NewsSnapshot> => ipcRenderer.invoke('news:refresh'),
    discover: (input: string): Promise<FeedDiscovery> => ipcRenderer.invoke('news:discover', input),
    article: (url: string): Promise<ArticleContent> => ipcRenderer.invoke('news:article', url),
    voiceSettings: (): Promise<void> => ipcRenderer.invoke('news:voiceSettings'),
    onUpdate: (cb: (s: NewsSnapshot) => void): (() => void) => {
      const listener = (_: unknown, s: NewsSnapshot): void => cb(s)
      ipcRenderer.on('news:update', listener)
      return () => ipcRenderer.off('news:update', listener)
    }
  },
  notifications: {
    onNew: (cb: (n: AppNotification) => void): (() => void) => {
      const listener = (_: unknown, n: AppNotification): void => cb(n)
      ipcRenderer.on('notifications:new', listener)
      return () => ipcRenderer.off('notifications:new', listener)
    }
  },
  library: {
    get: (): Promise<LibrarySnapshot> => ipcRenderer.invoke('library:get'),
    scan: (): Promise<LibrarySnapshot> => ipcRenderer.invoke('library:scan'),
    launch: (id: string): Promise<LaunchResult> => ipcRenderer.invoke('library:launch', id),
    reveal: (id: string): Promise<void> => ipcRenderer.invoke('library:reveal', id),
    pickExecutable: (): Promise<{ path: string; name: string } | null> => ipcRenderer.invoke('library:pickExecutable'),
    onUpdate: (cb: (s: LibrarySnapshot) => void): (() => void) => {
      const listener = (_: unknown, s: LibrarySnapshot): void => cb(s)
      ipcRenderer.on('library:update', listener)
      return () => ipcRenderer.off('library:update', listener)
    }
  },
  launcher: {
    run: (id: string): Promise<LaunchResult> => ipcRenderer.invoke('launcher:run', id)
  }
}

export type UHubApi = typeof api

contextBridge.exposeInMainWorld('uhub', api)
