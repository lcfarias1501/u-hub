import { ChevronsLeft, Pause, Play, Radio } from 'lucide-react'
import type { ViewId } from '@shared/types'
import { MOD_LABEL } from '@renderer/hooks/useHotkeys'
import { audioEngine, useAudio } from '@renderer/lib/audioEngine'
import { pct } from '@renderer/lib/format'
import { useSystemFeed } from '@renderer/lib/systemFeed'
import type { NavItem } from './nav'

const ITEM_H = 44

interface SidebarProps {
  items: NavItem[]
  active: ViewId
  collapsed: boolean
  onSelect: (id: ViewId) => void
  onToggle: () => void
}

export function Sidebar({ items, active, collapsed, onSelect, onToggle }: SidebarProps) {
  // -1 while Settings is open: the indicator fades out instead of pointing at a module.
  const activeIndex = items.findIndex((n) => n.id === active)

  return (
    <aside
      className={`relative z-20 flex shrink-0 flex-col border-r border-white/[0.06] bg-void/85 transition-[width] duration-300 ease-(--ease-snap) ${
        collapsed ? 'w-[60px]' : 'w-[228px]'
      }`}
    >
      <div className={`flex h-9 items-center ${collapsed ? 'justify-center' : 'px-4'}`}>
        <span className="eyebrow text-zinc-600">{collapsed ? 'NAV' : 'Módulos'}</span>
      </div>

      <nav className="relative px-2">
        {/* Sliding active indicator: one element that moves, instead of one per item. */}
        <div
          className="pointer-events-none absolute inset-x-2 top-0 overflow-hidden rounded-[3px] border border-volt/25 bg-gradient-to-r from-volt/20 via-volt/[0.06] to-transparent transition-transform duration-300 ease-(--ease-snap)"
          style={{ height: ITEM_H - 4, transform: `translateY(${Math.max(0, activeIndex) * ITEM_H + 2}px)`, opacity: activeIndex < 0 ? 0 : 1 }}
        >
          <span className="absolute inset-y-1.5 left-0 w-[2px] bg-volt shadow-[0_0_12px_2px_var(--color-volt)]" />
          <span key={activeIndex} className="absolute inset-x-0 h-full bg-gradient-to-b from-transparent via-white/[0.07] to-transparent [animation:scan_0.9s_ease-out_both]" />
        </div>

        {items.map(({ id, label, code, icon: Icon, key }) => {
          const isActive = id === active
          return (
            <button
              key={id}
              onClick={() => onSelect(id)}
              style={{ height: ITEM_H }}
              className={`group relative flex w-full items-center gap-3 rounded-[3px] transition-colors duration-150 ${
                collapsed ? 'justify-center' : 'px-3'
              } ${isActive ? 'text-white' : 'text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-200'}`}
            >
              <Icon
                className={`size-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110 ${isActive ? 'text-volt-soft drop-shadow-[0_0_6px_var(--color-volt)]' : ''}`}
                strokeWidth={1.75}
              />
              {!collapsed && (
                <>
                  <span className="truncate text-[13px] font-medium">{label}</span>
                  <span className="ml-auto flex items-center gap-1">
                    <span className="font-mono text-[9px] text-zinc-600 transition-opacity group-hover:opacity-0">{code}</span>
                    {key && (
                      <span className="absolute right-3 flex gap-0.5 opacity-0 transition-all duration-200 group-hover:opacity-100">
                        <kbd className="kbd">{MOD_LABEL}</kbd>
                        <kbd className="kbd">{key}</kbd>
                      </span>
                    )}
                  </span>
                </>
              )}

              {collapsed && (
                <span className="pointer-events-none absolute left-full z-50 ml-3 flex -translate-x-1 items-center gap-2 rounded-[3px] border border-white/10 bg-raised/95 px-2.5 py-1.5 whitespace-nowrap opacity-0 shadow-xl backdrop-blur transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100">
                  <span className="text-[12px] text-zinc-200">{label}</span>
                  {key && (
                    <>
                      <kbd className="kbd">{MOD_LABEL}</kbd>
                      <kbd className="kbd -ml-1.5">{key}</kbd>
                    </>
                  )}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-2 p-2">
        {!collapsed && <NowPlaying />}
        {!collapsed && <SystemPulse />}
        <button
          onClick={onToggle}
          className={`group flex h-9 items-center gap-2 rounded-[3px] text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-zinc-200 ${
            collapsed ? 'justify-center' : 'px-3'
          }`}
          title={`Recolher barra (${MOD_LABEL}+B)`}
        >
          <ChevronsLeft className={`size-4 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} />
          {!collapsed && (
            <>
              <span className="text-[12px]">Recolher</span>
              <span className="ml-auto flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <kbd className="kbd">{MOD_LABEL}</kbd>
                <kbd className="kbd">B</kbd>
              </span>
            </>
          )}
        </button>
      </div>
    </aside>
  )
}

function NowPlaying() {
  const { station, playing, loading } = useAudio()
  if (!station) return null
  return (
    <div className="flex items-center gap-2 rounded-[3px] border border-white/[0.06] bg-white/[0.02] p-2">
      <Radio className={`size-3.5 shrink-0 ${playing ? 'text-acid animate-pulse-dot' : 'text-zinc-600'}`} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] text-zinc-200">{station.name}</div>
        <div className="truncate font-mono text-[9px] text-zinc-500">{loading ? 'BUFFERING…' : playing ? 'ON AIR' : 'PAUSADO'}</div>
      </div>
      <button className="icon-btn size-6" onClick={() => audioEngine.toggle()} aria-label="Play/Pause">
        {playing ? <Pause className="size-3" /> : <Play className="size-3" />}
      </button>
    </div>
  )
}

function SystemPulse() {
  const { latest } = useSystemFeed()
  const cpu = latest?.cpu.total ?? 0
  const ram = latest ? (latest.mem.used / latest.mem.total) * 100 : 0
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[3px] border border-white/[0.06] bg-white/[0.04] font-mono text-[10px]">
      {[
        ['CPU', cpu, 'bg-volt'],
        ['RAM', ram, 'bg-acid']
      ].map(([label, v, color]) => (
        <div key={label as string} className="bg-void/80 px-2 py-1.5">
          <div className="flex justify-between text-zinc-500">
            <span>{label}</span>
            <span className="text-zinc-200 tabular-nums">{pct(v as number)}</span>
          </div>
          <div className="mt-1 h-[2px] bg-white/[0.06]">
            {/* scaleX instead of width: compositor-only, no layout or repaint on every tick. */}
            <div className={`h-full origin-left ${color} transition-transform duration-300`} style={{ transform: `scaleX(${(v as number) / 100})` }} />
          </div>
        </div>
      ))}
    </div>
  )
}
