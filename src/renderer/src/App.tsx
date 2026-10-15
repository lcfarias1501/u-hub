import { useEffect, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { NAV } from './components/nav'
import { useModHotkeys } from './hooks/useHotkeys'
import { usePersistentState } from './hooks/usePersistentState'
import { startSystemFeed } from './lib/systemFeed'
import { MediaView } from './views/MediaView'
import { PerformanceView } from './views/PerformanceView'
import { QuestView } from './views/QuestView'
import { VaultView } from './views/VaultView'

startSystemFeed()

export default function App() {
  const [view, setView, ready] = usePersistentState('lastView', 'performance')
  const [collapsed, setCollapsed] = usePersistentState('sidebarCollapsed', false)
  // The media view hosts the Spotify iframe; once opened it stays mounted so playback survives tab switches.
  const [mediaMounted, setMediaMounted] = useState(false)

  useEffect(() => {
    if (view === 'media') setMediaMounted(true)
  }, [view])

  useModHotkeys({
    b: () => setCollapsed((c) => !c),
    ...Object.fromEntries(NAV.map((n) => [n.key, () => setView(n.id)]))
  })

  return (
    <div className="hub-backdrop flex h-full flex-col">
      <TopBar view={view} />
      <div className="flex min-h-0 flex-1">
        <Sidebar active={view} collapsed={collapsed} onSelect={setView} onToggle={() => setCollapsed((c) => !c)} />
        <main className="relative min-w-0 flex-1 overflow-y-auto">
          {ready && (
            <>
              {view === 'performance' && <PerformanceView />}
              {view === 'vault' && <VaultView />}
              {view === 'quests' && <QuestView />}
              {mediaMounted && (
                <div hidden={view !== 'media'} className="h-full">
                  <MediaView />
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}
