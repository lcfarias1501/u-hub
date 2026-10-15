import { contextBridge, ipcRenderer } from 'electron'
import type {
  LaunchResult,
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
    onStatus: (cb: (s: UpdateStatus) => void): (() => void) => {
      const listener = (_: unknown, s: UpdateStatus): void => cb(s)
      ipcRenderer.on('updater:status', listener)
      return () => ipcRenderer.off('updater:status', listener)
    }
  },
  launcher: {
    run: (id: string): Promise<LaunchResult> => ipcRenderer.invoke('launcher:run', id)
  }
}

export type UHubApi = typeof api

contextBridge.exposeInMainWorld('uhub', api)
