import { Bell, BellOff, CheckCheck, Gamepad2, Gift, Info, Settings, Tag, Trash2, Wrench, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { AppNotification, NotificationKind, ViewId } from '@shared/types'
import { usePersistentState } from '@renderer/hooks/usePersistentState'

const KIND: Record<NotificationKind, { icon: LucideIcon; tone: string; label: string }> = {
  free: { icon: Gift, tone: 'text-acid-soft bg-acid/10 border-acid/25', label: 'Grátis' },
  price: { icon: Tag, tone: 'text-amber-200 bg-warn/10 border-warn/25', label: 'Preço' },
  patch: { icon: Wrench, tone: 'text-volt-200 bg-volt/10 border-volt/25', label: 'Patch' },
  game: { icon: Gamepad2, tone: 'text-sky-200 bg-sky-500/10 border-sky-400/25', label: 'Sessão' },
  system: { icon: Info, tone: 'text-zinc-300 bg-white/5 border-white/15', label: 'Sistema' }
}

function ago(t: number): string {
  const m = Math.round((Date.now() - t) / 60_000)
  if (m < 1) return 'agora'
  if (m < 60) return `${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h`
  const d = Math.round(h / 24)
  return d < 7 ? `${d} d` : new Date(t).toLocaleDateString('pt-BR')
}

export function NotificationCenter({ onNavigate }: { onNavigate: (view: ViewId) => void }) {
  const [items, setItems] = usePersistentState('notifications', [])
  const [open, setOpen] = useState(false)
  const [onlyUnread, setOnlyUnread] = useState(false)
  const [ring, setRing] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const unread = items.filter((n) => !n.read).length
  const shown = onlyUnread ? items.filter((n) => !n.read) : items

  // A small wiggle when something new arrives while the app is open.
  useEffect(() => window.uhub.notifications.onNew(() => setRing((r) => r + 1)), [])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const activate = (n: AppNotification): void => {
    setItems(items.map((x) => (x.id === n.id ? { ...x, read: true } : x)))
    if (n.view) {
      onNavigate(n.view)
      setOpen(false)
    } else if (n.url) window.open(n.url, '_blank')
  }

  return (
    <div ref={root} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notificações${unread ? ` (${unread} não lidas)` : ''}`}
        title="Notificações"
        className={`relative grid size-7 place-items-center rounded-[3px] border transition-all duration-200 ${
          open ? 'border-volt/50 bg-volt/15 text-volt-200' : 'border-transparent text-zinc-500 hover:border-white/10 hover:text-zinc-100'
        }`}
      >
        <Bell key={ring} className={`size-4 ${ring ? 'animate-[bell_0.6s_ease-in-out]' : ''}`} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-volt px-1 font-mono text-[9px] font-bold text-white shadow-[0_0_8px_var(--color-volt)]">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
        <style>{'@keyframes bell{0%,100%{transform:rotate(0)}20%{transform:rotate(14deg)}40%{transform:rotate(-12deg)}60%{transform:rotate(8deg)}80%{transform:rotate(-4deg)}}'}</style>
      </button>

      {open && (
        <div className="panel animate-rise absolute top-9 right-0 z-50 flex max-h-[70vh] w-[400px] flex-col !bg-raised/95 shadow-2xl">
          <header className="flex h-10 shrink-0 items-center gap-1 border-b border-white/[0.06] px-3">
            <span className="eyebrow text-zinc-300">Notificações</span>
            <div className="ml-3 flex rounded-[3px] border border-white/[0.08] p-0.5">
              {[false, true].map((u) => (
                <button
                  key={String(u)}
                  onClick={() => setOnlyUnread(u)}
                  className={`rounded-[2px] px-2 py-0.5 font-mono text-[10px] ${onlyUnread === u ? 'bg-volt/25 text-volt-100' : 'text-zinc-500 hover:text-zinc-200'}`}
                >
                  {u ? `NÃO LIDAS${unread ? ` · ${unread}` : ''}` : 'TODAS'}
                </button>
              ))}
            </div>
            <button
              className="icon-btn ml-auto"
              title="Marcar todas como lidas"
              disabled={!unread}
              onClick={() => setItems(items.map((x) => ({ ...x, read: true })))}
            >
              <CheckCheck className="size-3.5" />
            </button>
            <button className="icon-btn hover:!text-rose-300" title="Limpar todas" disabled={!items.length} onClick={() => setItems([])}>
              <Trash2 className="size-3.5" />
            </button>
            <button
              className="icon-btn"
              title="Preferências de notificação"
              onClick={() => {
                onNavigate('settings')
                setOpen(false)
                setTimeout(() => document.getElementById('notifications')?.scrollIntoView({ behavior: 'smooth' }), 150)
              }}
            >
              <Settings className="size-3.5" />
            </button>
          </header>

          {shown.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <BellOff className="size-7 text-zinc-700" strokeWidth={1.5} />
              <p className="text-[12px] text-zinc-500">{onlyUnread ? 'Tudo lido por aqui.' : 'Nenhuma notificação ainda.'}</p>
              <p className="max-w-[260px] text-[11px] text-zinc-600">Jogos grátis, alertas de preço, patches e resumos de sessão aparecem aqui.</p>
            </div>
          ) : (
            <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
              {shown.map((n) => {
                const K = KIND[n.kind] ?? KIND.system
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => activate(n)}
                      className={`group flex w-full gap-3 rounded-[3px] p-2 text-left transition-colors hover:bg-white/[0.04] ${n.read ? 'opacity-60 hover:opacity-100' : ''}`}
                    >
                      <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-[3px] border ${K.tone}`}>
                        <K.icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="truncate text-[13px] font-medium text-zinc-100">{n.title}</span>
                          <span className="ml-auto shrink-0 font-mono text-[10px] text-zinc-600">{ago(n.createdAt)}</span>
                        </span>
                        <span className="line-clamp-2 text-[12px] text-zinc-400">{n.body}</span>
                      </span>
                      {!n.read && <span className="mt-2 size-1.5 shrink-0 rounded-full bg-volt shadow-[0_0_6px_var(--color-volt)]" />}
                      {n.image && <img src={n.image} alt="" className="h-10 w-[72px] shrink-0 rounded-[2px] object-cover" />}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
