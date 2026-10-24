import { Activity, KeyRound, LibraryBig, Music2, Newspaper, ScrollText, Settings, Users, type LucideIcon } from 'lucide-react'
import type { ModuleId, ViewId } from '@shared/types'

export interface NavItem {
  id: ViewId
  label: string
  code: string
  icon: LucideIcon
  /** Shortcut digit; assigned from the module's position in the sidebar. */
  key?: string
}

export const MODULES: Record<ModuleId, NavItem> = {
  performance: { id: 'performance', label: 'Performance', code: 'SYS', icon: Activity },
  library: { id: 'library', label: 'Biblioteca', code: 'LIB', icon: LibraryBig },
  radar: { id: 'radar', label: 'Ofertas & Notícias', code: 'RDR', icon: Newspaper },
  friends: { id: 'friends', label: 'Amigos', code: 'SQD', icon: Users },
  vault: { id: 'vault', label: 'Vault & Keys', code: 'VLT', icon: KeyRound },
  media: { id: 'media', label: 'Media & Audio', code: 'AUD', icon: Music2 },
  quests: { id: 'quests', label: 'Quest Log', code: 'QST', icon: ScrollText }
}

export const SETTINGS_ITEM: NavItem = { id: 'settings', label: 'Configurações', code: 'CFG', icon: Settings, key: ',' }

/** Visible modules in sidebar order, with ⌘1…⌘9 following that order. */
export const navItems = (modules: ModuleId[]): NavItem[] =>
  modules.map((id, i) => ({ ...MODULES[id], key: i < 9 ? String(i + 1) : undefined }))

export const navItemFor = (view: ViewId): NavItem => (view === 'settings' ? SETTINGS_ITEM : MODULES[view])
