import { useSyncExternalStore } from 'react'
import type { SystemSnapshot } from '@shared/types'

export const HISTORY_SECONDS = 60

interface FeedState {
  latest: SystemSnapshot | null
  history: SystemSnapshot[]
}

// Lives outside React so the 60s history survives tab switches.
let state: FeedState = { latest: null, history: [] }
const listeners = new Set<() => void>()
let started = false

export function startSystemFeed(): void {
  if (started) return
  started = true
  window.uhub.system.onTick((snap) => {
    state = { latest: snap, history: [...state.history.slice(-(HISTORY_SECONDS - 1)), snap] }
    listeners.forEach((l) => l())
  })
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useSystemFeed(): FeedState {
  return useSyncExternalStore(subscribe, () => state)
}

export type SystemLevel = 'normal' | 'high' | 'critical'

export function systemLevel(s: SystemSnapshot | null): SystemLevel {
  if (!s) return 'normal'
  const ram = (s.mem.used / s.mem.total) * 100
  const temp = s.temp.main ?? 0
  if (s.cpu.total > 92 || ram > 95 || temp > 90) return 'critical'
  if (s.cpu.total > 75 || ram > 85 || temp > 80) return 'high'
  return 'normal'
}

export const LEVEL_META: Record<SystemLevel, { label: string; dot: string; text: string; ring: string }> = {
  normal: { label: 'Normal', dot: 'bg-acid', text: 'text-acid-soft', ring: 'border-acid/30 bg-acid/[0.07]' },
  high: { label: 'Carga Alta', dot: 'bg-warn', text: 'text-amber-300', ring: 'border-warn/30 bg-warn/[0.07]' },
  critical: { label: 'Crítico', dot: 'bg-crit', text: 'text-rose-300', ring: 'border-crit/40 bg-crit/[0.09]' }
}
