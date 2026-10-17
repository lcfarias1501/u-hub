import { useEffect, useState } from 'react'
import type { ViewId } from '@shared/types'
import { isMac } from '@renderer/hooks/useHotkeys'
import { LEVEL_META, systemLevel, useSystemFeed } from '@renderer/lib/systemFeed'
import logo from '@renderer/assets/logo.png'
import { Settings } from 'lucide-react'
import { MOD_LABEL } from '@renderer/hooks/useHotkeys'
import { navItemFor } from './nav'
import { NotificationCenter } from './NotificationCenter'
import { UpdateBadge } from './UpdateBadge'

function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return <span className="tabular-nums">{now.toLocaleTimeString('pt-BR', { hour12: false })}</span>
}

export function TopBar({ view, onOpenSettings, onNavigate }: { view: ViewId; onOpenSettings: () => void; onNavigate: (v: ViewId) => void }) {
  const { latest } = useSystemFeed()
  const lvl = systemLevel(latest)
  const level = LEVEL_META[lvl]
  const item = navItemFor(view)

  return (
    <header
      className={`drag relative z-30 flex h-10 shrink-0 items-center gap-4 border-b border-white/[0.06] bg-void/90 pr-4 ${
        isMac ? 'pl-[84px]' : 'pl-4 pr-[150px]'
      }`}
    >
      <div className="flex items-center gap-2">
        <img src={logo} alt="" className="size-5 drop-shadow-[0_0_6px_color-mix(in_srgb,var(--color-volt)_45%,transparent)]" draggable={false} />
        <span className="font-mono text-[12px] font-semibold tracking-[0.25em] text-zinc-100">U-HUB</span>
      </div>

      <div className="flex items-center gap-2 font-mono text-[11px] text-zinc-500">
        <span className="text-zinc-700">//</span>
        <span key={view} className="animate-rise text-zinc-300">
          {item.label.toUpperCase()}
        </span>
        <span className="text-zinc-700">[{item.code}]</span>
      </div>

      <div className="no-drag ml-auto flex items-center gap-3 font-mono text-[11px]">
        <UpdateBadge />
        <span className={`flex items-center gap-1.5 rounded-[3px] border px-2 py-0.5 ${level.ring} ${level.text}`}>
          <span className={`size-1.5 rounded-full ${level.dot} ${lvl === 'normal' ? '' : 'animate-pulse-dot'}`} />
          {level.label.toUpperCase()}
        </span>
        <span className="text-zinc-500">
          <Clock />
        </span>
        <NotificationCenter onNavigate={onNavigate} />
        <button
          onClick={onOpenSettings}
          title={`Configurações (${MOD_LABEL},)`}
          aria-label="Configurações"
          className={`group grid size-7 place-items-center rounded-[3px] border transition-all duration-200 ${
            view === 'settings' ? 'border-volt/50 bg-volt/15 text-volt-200' : 'border-transparent text-zinc-500 hover:border-white/10 hover:text-zinc-100'
          }`}
        >
          <Settings className="size-4 transition-transform duration-500 group-hover:rotate-90" />
        </button>
      </div>
    </header>
  )
}
