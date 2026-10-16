import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppInfo,
  BackupSummary,
  LaunchResult,
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
      ipcRenderer.invoke('store:set', key, value)
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
    onNavigate: (cb: (view: ModuleId) => void): (() => void) => {
      const listener = (_: unknown, v: ModuleId): void => cb(v)
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
    showMain: (): void => ipcRenderer.send('app:showMain'),
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
  launcher: {
    run: (id: string): Promise<LaunchResult> => ipcRenderer.invoke('launcher:run', id)
  }
}

export type UHubApi = typeof api

contextBridge.exposeInMainWorld('uhub', api)
