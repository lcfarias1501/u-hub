import { useEffect, useMemo, useRef, useState } from 'react'
import type { ViewId } from '@shared/types'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { navItems } from './components/nav'
import { useModHotkeys } from './hooks/useHotkeys'
import { usePersistentState } from './hooks/usePersistentState'
import { SettingsProvider, useSettings } from './lib/settings'
import { startRadioBridge } from './lib/radioBridge'
import { startSystemFeed } from './lib/systemFeed'
import { MediaView } from './views/MediaView'
import { PerformanceView } from './views/PerformanceView'
import { QuestView } from './views/QuestView'
import { SettingsView } from './views/SettingsView'
import { VaultView } from './views/VaultView'

startSystemFeed()
startRadioBridge()

export default function App() {
  return (
    <SettingsProvider>
      <Shell />
    </SettingsProvider>
  )
}

function Shell() {
  const { settings, modules, ready: settingsReady } = useSettings()
  const [lastView, setLastView, viewReady] = usePersistentState('lastView', 'performance')
  const [collapsed, setCollapsed, collapsedReady] = usePersistentState('sidebarCollapsed', false)
  const [view, setViewState] = useState<ViewId | null>(null)
  // The media view hosts the Spotify iframe; once opened it stays mounted so playback survives tab switches.
  const [mediaMounted, setMediaMounted] = useState(false)
  const booted = useRef(false)
  const ready = settingsReady && viewReady && collapsedReady

  const setView = (v: ViewId): void => {
    setViewState(v)
    // Settings is a detour, not a place to come back to on next launch.
    if (v !== 'settings') setLastView(v)
  }

  // One-time startup: pick the initial tab and apply the sidebar preference.
  useEffect(() => {
    if (!ready || booted.current) return
    booted.current = true
    const wanted = settings.startView === 'last' ? lastView : settings.startView
    setViewState(wanted !== 'settings' && modules.includes(wanted) ? wanted : modules[0])
    if (settings.sidebarMode !== 'remember') setCollapsed(settings.sidebarMode === 'collapsed')
  }, [ready])

  // If the current module gets hidden in Settings, fall back to the first visible one.
  useEffect(() => {
    if (view && view !== 'settings' && !modules.includes(view)) setViewState(modules[0])
  }, [modules, view])

  useEffect(() => {
    if (view === 'media') setMediaMounted(true)
    if (!modules.includes('media')) setMediaMounted(false) // hiding Media also stops its iframe
  }, [view, modules])

  // Tray menu navigation
  useEffect(() => window.uhub.app.onNavigate((v) => (v === 'settings' || modules.includes(v)) && setView(v)))

  const items = useMemo(() => navItems(modules), [modules])

  useModHotkeys({
    b: () => setCollapsed((c) => !c),
    ',': () => setView('settings'),
    ...Object.fromEntries(items.filter((n) => n.key).map((n) => [n.key!, () => setView(n.id)]))
  })

  if (!view) return <div className="hub-backdrop h-full" />

  return (
    <div className="hub-backdrop flex h-full flex-col">
      <TopBar view={view} onOpenSettings={() => setView(view === 'settings' ? (lastView as ViewId) : 'settings')} />
      <div className="flex min-h-0 flex-1">
        <Sidebar items={items} active={view} collapsed={collapsed} onSelect={setView} onToggle={() => setCollapsed((c) => !c)} />
        <main className="relative min-w-0 flex-1 overflow-y-auto">
          {view === 'performance' && <PerformanceView />}
          {view === 'vault' && <VaultView />}
          {view === 'quests' && <QuestView />}
          {view === 'settings' && <SettingsView />}
          {mediaMounted && (
            <div hidden={view !== 'media'} className="h-full">
              <MediaView />
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
