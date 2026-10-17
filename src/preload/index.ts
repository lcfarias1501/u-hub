import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppInfo,
  BackupSummary,
  LaunchResult,
  LibrarySnapshot,
  AppNotification,
  RadarSnapshot,
  SteamSearchResult,
  DiscordStatus,
  ShortcutStatus,
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
    read: (): Promise<{ entries: VaultEntry[]; protection: 'keychain' | 'local-key' }> =>
      ipcRenderer.invoke('vault:read'),
    write: (entries: VaultEntry[]): Promise<void> => ipcRenderer.invoke('vault:write', entries)
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
