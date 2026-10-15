import { Activity, KeyRound, Music2, ScrollText, type LucideIcon } from 'lucide-react'
import type { ViewId } from '@shared/types'

export interface NavItem {
  id: ViewId
  label: string
  code: string
  icon: LucideIcon
  key: string
}

export const NAV: NavItem[] = [
  { id: 'performance', label: 'Performance', code: 'SYS', icon: Activity, key: '1' },
  { id: 'vault', label: 'Vault & Keys', code: 'VLT', icon: KeyRound, key: '2' },
  { id: 'media', label: 'Media & Audio', code: 'AUD', icon: Music2, key: '3' },
  { id: 'quests', label: 'Quest Log', code: 'QST', icon: ScrollText, key: '4' }
]
