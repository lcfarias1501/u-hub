import { useEffect, useMemo, useRef, useState } from 'react'
import type { ViewId } from '@shared/types'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { RecoveryDialog, SyncConflictDialog } from './components/AccountCard'
import { WhatsNew } from './components/WhatsNew'
import { Onboarding } from './views/Onboarding'
import { navItems } from './components/nav'
import { useModHotkeys } from './hooks/useHotkeys'
import { usePersistentState } from './hooks/usePersistentState'
import { SettingsProvider, useSettings } from './lib/settings'
import { changesBetween, type ChangelogEntry } from './lib/changelog'
import { startRadioBridge } from './lib/radioBridge'
import { startSystemFeed } from './lib/systemFeed'
import { FriendsView } from './views/FriendsView'
import { LibraryView } from './views/LibraryView'
import { MediaView } from './views/MediaView'
import { MailView, useMailUnread } from './views/mail/MailView'
import { PerformanceView } from './views/PerformanceView'
import { QuestView } from './views/QuestView'
import { RadarView } from './views/RadarView'
import { NewsView } from './views/NewsView'
import { MoviesView } from './views/movies/MoviesView'
import { NewsPlayer } from './components/NewsPlayer'
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
  const [onboarded, , onboardedReady] = usePersistentState('onboarded', true)
  const [view, setViewState] = useState<ViewId | null>(null)
  // The media view hosts the Spotify iframe; once opened it stays mounted so playback survives tab switches.
  const [mediaMounted, setMediaMounted] = useState(false)
  const booted = useRef(false)
  const [news, setNews] = useState<ChangelogEntry[] | null>(null)

  // "What's new" once after an update. A fresh install just records the version.
  useEffect(() => {
    void Promise.all([window.uhub.app.info(), window.uhub.store.get('lastSeenVersion')]).then(([info, seen]) => {
      if (seen && seen !== info.version) {
        const entries = changesBetween(seen, info.version)
        if (entries.length) setNews(entries)
      }
      if (seen !== info.version) void window.uhub.store.set('lastSeenVersion', info.version)
    })
  }, [])
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
    // Reopened by clicking a notification: go where it points.
    void window.uhub.app.takePendingView().then((v) => v && (v === 'settings' || modules.includes(v)) && setView(v))
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
  const mailUnread = useMailUnread()

  useModHotkeys({
    b: () => setCollapsed((c) => !c),
    ',': () => setView('settings'),
    ...Object.fromEntries(items.filter((n) => n.key).map((n) => [n.key!, () => setView(n.id)]))
  })

  if (!view || !onboardedReady) return <div className="hub-backdrop h-full" />
  // First run: the presentation replaces the whole UI until it's finished or skipped.
  if (!onboarded) return <Onboarding onFinish={(first) => setView(first)} />

  return (
    <div className="hub-backdrop flex h-full flex-col">
      <TopBar view={view} onNavigate={setView} onOpenSettings={() => setView(view === 'settings' ? (lastView as ViewId) : 'settings')} />
      <div className="flex min-h-0 flex-1">
        <Sidebar items={items} badges={{ mail: mailUnread }} active={view} collapsed={collapsed} onSelect={setView} onToggle={() => setCollapsed((c) => !c)} />
        <main className="relative min-w-0 flex-1 overflow-y-auto">
          {view === 'performance' && <PerformanceView />}
          {view === 'library' && <LibraryView />}
          {view === 'radar' && <RadarView />}
          {view === 'news' && <NewsView />}
          {view === 'movies' && <MoviesView />}
          {view === 'friends' && <FriendsView />}
          {view === 'mail' && <MailView />}
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
      <NewsPlayer onOpen={() => setView('news')} />
      {news && <WhatsNew entries={news} title="Novidades desde a última versão" onClose={() => setNews(null)} />}
      <SyncConflictDialog />
      <RecoveryDialog />
    </div>
  )
}
