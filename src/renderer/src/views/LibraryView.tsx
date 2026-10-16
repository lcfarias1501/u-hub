import { BarChart3, Clock, EyeOff, FolderOpen, Gamepad2, LibraryBig, Loader2, MoreHorizontal, Play, Plus, RefreshCw, Search, Trash2, Trophy } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import type { Game, GameSource, LibrarySnapshot, ManualGame, PlaytimeEntry } from '@shared/types'
import { Field, Modal } from '@renderer/components/Modal'
import { Panel } from '@renderer/components/Panel'
import { usePersistentState } from '@renderer/hooks/usePersistentState'
import { uid } from '@renderer/lib/format'
import { useSettings } from '@renderer/lib/settings'
import { PageHeader } from './PageHeader'

type Sort = 'recent' | 'played' | 'name'

const SOURCE_LABEL: Record<GameSource, string> = { steam: 'Steam', epic: 'Epic', manual: 'Manual' }

const DAY_MS = 86_400_000
const dayKey = (t: number): string => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function duration(ms: number): string {
  const m = Math.round(ms / 60_000)
  if (m < 1) return '< 1min'
  if (m < 60) return `${m}min`
  const h = Math.floor(m / 60)
  return m % 60 ? `${h}h ${m % 60}min` : `${h}h`
}

/** Steam's own total already includes sessions U-Hub tracked, so take the larger instead of adding. */
const totalMs = (g: Game, p?: PlaytimeEntry): number => Math.max(p?.totalMs ?? 0, (g.sourceMinutes ?? 0) * 60_000)
const lastPlayed = (g: Game, p?: PlaytimeEntry): number => Math.max(p?.lastPlayed ?? 0, g.sourceLastPlayed ?? 0)

function relative(t: number): string {
  if (!t) return 'nunca'
  const days = Math.floor((Date.now() - t) / DAY_MS)
  if (days <= 0) return 'hoje'
  if (days === 1) return 'ontem'
  if (days < 30) return `há ${days} dias`
  return new Date(t).toLocaleDateString('pt-BR')
}

export function LibraryView() {
  const [lib, setLib] = useState<LibrarySnapshot | null>(null)
  const [hidden, setHidden] = usePersistentState('hiddenGames', [])
  const [manual, setManual] = usePersistentState('manualGames', [])
  const [query, setQuery] = useState('')
  const [source, setSource] = useState<GameSource | 'all'>('all')
  const [sort, setSort] = useState<Sort>('recent')
  const [showHidden, setShowHidden] = useState(false)
  const [adding, setAdding] = useState(false)
  const [scanning, setScanning] = useState(false)

  useEffect(() => {
    void window.uhub.library.get().then(setLib)
    return window.uhub.library.onUpdate(setLib)
  }, [])

  const playtime = lib?.playtime ?? {}
  const playingIds = new Set(lib?.nowPlaying.map((n) => n.id))

  const visible = useMemo(() => {
    if (!lib) return []
    const q = query.trim().toLowerCase()
    const list = lib.games
      .filter((g) => showHidden || !hidden.includes(g.id))
      .filter((g) => source === 'all' || g.source === source)
      .filter((g) => !q || g.name.toLowerCase().includes(q))
    const by: Record<Sort, (a: Game, b: Game) => number> = {
      recent: (a, b) => lastPlayed(b, playtime[b.id]) - lastPlayed(a, playtime[a.id]) || a.name.localeCompare(b.name),
      played: (a, b) => totalMs(b, playtime[b.id]) - totalMs(a, playtime[a.id]) || a.name.localeCompare(b.name),
      name: (a, b) => a.name.localeCompare(b.name)
    }
    // Whatever is running always comes first.
    return [...list].sort((a, b) => Number(playingIds.has(b.id)) - Number(playingIds.has(a.id)) || by[sort](a, b))
  }, [lib, query, source, sort, hidden, showHidden, playtime])

  const counts = useMemo(() => {
    const c: Partial<Record<GameSource, number>> = {}
    for (const g of lib?.games ?? []) if (!hidden.includes(g.id)) c[g.source] = (c[g.source] ?? 0) + 1
    return c
  }, [lib, hidden])

  const rescan = async (): Promise<void> => {
    setScanning(true)
    setLib(await window.uhub.library.scan())
    setScanning(false)
  }

  if (!lib) return null
  const hasAny = lib.games.length > 0

  return (
    <div className="animate-rise p-6">
      <PageHeader index="05" title="Biblioteca" subtitle="Jogos instalados · tempo de jogo">
        <span className="font-mono text-[10px] text-zinc-600">
          {[lib.sources.steam && 'STEAM', lib.sources.epic && 'EPIC'].filter(Boolean).join(' · ') || 'NENHUMA LAUNCHER DETECTADA'}
        </span>
        <button className="btn" onClick={rescan} disabled={scanning} title="Procurar jogos de novo">
          {scanning ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
        </button>
        <button className="btn btn-volt" onClick={() => setAdding(true)}>
          <Plus className="size-3.5" /> Adicionar jogo
        </button>
      </PageHeader>

      {lib.nowPlaying.map((n) => {
        const g = lib.games.find((x) => x.id === n.id)
        return g ? <NowPlayingBanner key={n.id} game={g} startedAt={n.startedAt} entry={playtime[g.id]} /> : null
      })}

      {hasAny && <Activity lib={lib} />}

      {hasAny ? (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative w-64">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-zinc-600" />
              <input className="field pl-9" placeholder="Buscar jogo…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="flex gap-1">
              <Chip active={source === 'all'} onClick={() => setSource('all')} label="Todos" count={lib.games.length - hidden.filter((h) => lib.games.some((g) => g.id === h)).length} />
              {(Object.keys(SOURCE_LABEL) as GameSource[])
                .filter((s) => counts[s])
                .map((s) => (
                  <Chip key={s} active={source === s} onClick={() => setSource(s)} label={SOURCE_LABEL[s]} count={counts[s] ?? 0} />
                ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              {hidden.length > 0 && (
                <button className={`btn ${showHidden ? '!border-volt/40 !text-volt-200' : ''}`} onClick={() => setShowHidden((s) => !s)}>
                  <EyeOff className="size-3.5" /> Ocultos ({hidden.length})
                </button>
              )}
              <select className="field h-8 w-52 cursor-pointer" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="recent">Jogados recentemente</option>
                <option value="played">Mais jogados</option>
                <option value="name">A–Z</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
            {visible.map((g) => (
              <GameCard
                key={g.id}
                game={g}
                entry={playtime[g.id]}
                playing={playingIds.has(g.id)}
                hidden={hidden.includes(g.id)}
                onToggleHidden={() => setHidden(hidden.includes(g.id) ? hidden.filter((h) => h !== g.id) : [...hidden, g.id])}
                onRemove={g.source === 'manual' ? () => setManual(manual.filter((m) => m.id !== g.id)) : undefined}
              />
            ))}
          </div>
        </>
      ) : (
        <EmptyState onAdd={() => setAdding(true)} />
      )}

      {adding && (
        <AddGameModal
          onClose={() => setAdding(false)}
          onSave={(m) => {
            setManual([...manual, m])
            setAdding(false)
          }}
        />
      )}
    </div>
  )
}

function Chip({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex h-8 items-center gap-1.5 rounded-[3px] border px-2.5 text-[12px] transition-all duration-150 ${
        active ? 'border-volt/50 bg-volt/15 text-volt-100' : 'border-transparent text-zinc-500 hover:border-white/10 hover:text-zinc-200'
      }`}
    >
      {label}
      <span className={`font-mono text-[10px] ${active ? 'text-volt-soft' : 'text-zinc-600'}`}>{count}</span>
    </button>
  )
}

// ── Cover art ────────────────────────────────────────────────────────────────

/** Deterministic two-colour gradient + initials for games without art. */
function Placeholder({ name }: { name: string }) {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360
  const initials = name
    .split(/[\s:–-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
  return (
    <div className="grid size-full place-items-center" style={{ background: `linear-gradient(150deg, hsl(${h} 55% 32%), hsl(${(h + 60) % 360} 50% 14%))` }}>
      <span className="font-mono text-[28px] font-bold tracking-wider text-white/80">{initials}</span>
    </div>
  )
}

function Cover({ game }: { game: Game }) {
  // Steam: portrait art → header fallback → placeholder. Others: given cover → placeholder.
  const candidates = useMemo(() => {
    const list = [game.cover]
    if (game.source === 'steam') list.push(`https://cdn.cloudflare.steamstatic.com/steam/apps/${game.id.slice(6)}/header.jpg`)
    return list.filter((x): x is string => !!x)
  }, [game])
  const [i, setI] = useState(0)
  const src = candidates[i]
  if (!src) return <Placeholder name={game.name} />
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      draggable={false}
      onError={() => setI((n) => n + 1)}
      className={`size-full ${i > 0 ? 'object-contain bg-black' : 'object-cover'}`}
    />
  )
}

// ── Cards ────────────────────────────────────────────────────────────────────

function GameCard({
  game,
  entry,
  playing,
  hidden,
  onToggleHidden,
  onRemove
}: {
  game: Game
  entry?: PlaytimeEntry
  playing: boolean
  hidden: boolean
  onToggleHidden: () => void
  onRemove?: () => void
}) {
  const [menu, setMenu] = useState(false)
  const [status, setStatus] = useState<'idle' | 'launching' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const total = totalMs(game, entry)

  useEffect(() => {
    if (status === 'idle') return
    const t = setTimeout(() => setStatus('idle'), status === 'error' ? 4000 : 2500)
    return () => clearTimeout(t)
  }, [status])

  const play = async (): Promise<void> => {
    setStatus('launching')
    const r = await window.uhub.library.launch(game.id)
    if (!r.ok) {
      setError(r.error ?? 'Falha ao abrir')
      setStatus('error')
    }
  }

  return (
    <div className={`group relative ${hidden ? 'opacity-45' : ''}`} onMouseLeave={() => setMenu(false)}>
      <div
        className={`relative aspect-[2/3] overflow-hidden rounded-[4px] border bg-raised transition-all duration-300 ease-(--ease-snap) group-hover:-translate-y-1 group-hover:shadow-[0_18px_40px_-14px_color-mix(in_srgb,var(--color-volt)_55%,transparent)] ${
          playing ? 'border-acid/70 shadow-[0_0_0_1px_var(--color-acid),0_0_28px_-6px_var(--color-acid)]' : 'border-white/[0.07] group-hover:border-volt/50'
        }`}
      >
        <Cover game={game} />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />

        {playing && (
          <span className="absolute top-2 left-2 flex items-center gap-1 rounded-[3px] bg-acid/90 px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider text-black">
            <span className="size-1.5 rounded-full bg-black animate-pulse-dot" /> AO VIVO
          </span>
        )}
        <span className="absolute top-2 right-2 rounded-[2px] bg-black/60 px-1 font-mono text-[9px] text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100">
          {SOURCE_LABEL[game.source].toUpperCase()}
        </span>

        <button
          onClick={play}
          disabled={status === 'launching'}
          aria-label={`Jogar ${game.name}`}
          className="absolute top-1/2 left-1/2 grid size-12 -translate-x-1/2 -translate-y-1/2 scale-75 place-items-center rounded-full bg-white text-black opacity-0 shadow-xl transition-all duration-200 group-hover:scale-100 group-hover:opacity-100 hover:scale-110"
        >
          {status === 'launching' ? <Loader2 className="size-5 animate-spin" /> : <Play className="ml-0.5 size-5" fill="currentColor" />}
        </button>

        <div className="absolute inset-x-0 bottom-0 p-2.5">
          <div className="line-clamp-2 text-[13px] leading-tight font-semibold text-white drop-shadow">{game.name}</div>
          <div className="mt-1 flex items-center gap-1 font-mono text-[10px] text-zinc-400">
            <Clock className="size-3" /> {total ? duration(total) : '—'}
          </div>
        </div>
      </div>

      {status === 'error' && <p className="mt-1 font-mono text-[10px] text-rose-300">{error}</p>}

      <button
        onClick={() => setMenu((m) => !m)}
        className="icon-btn absolute right-1.5 bottom-12 size-6 bg-black/60 opacity-0 group-hover:opacity-100"
        aria-label="Mais opções"
      >
        <MoreHorizontal className="size-3.5" />
      </button>
      {menu && (
        <div className="panel animate-rise absolute right-1.5 bottom-20 z-20 w-44 !bg-raised/95 p-1 text-[12px]">
          <MenuRow icon={<BarChart3 />} label={`Última vez: ${relative(lastPlayed(game, entry))}`} />
          {game.installDir && <MenuRow icon={<FolderOpen />} label="Mostrar na pasta" onClick={() => void window.uhub.library.reveal(game.id)} />}
          <MenuRow icon={<EyeOff />} label={hidden ? 'Mostrar na biblioteca' : 'Ocultar'} onClick={onToggleHidden} />
          {onRemove && <MenuRow icon={<Trash2 />} label="Remover" danger onClick={onRemove} />}
        </div>
      )}
    </div>
  )
}

function MenuRow({ icon, label, onClick, danger }: { icon: ReactNode; label: string; onClick?: () => void; danger?: boolean }) {
  return (
    <button
      disabled={!onClick}
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-[2px] px-2 py-1.5 text-left transition-colors disabled:cursor-default [&_svg]:size-3.5 ${
        onClick ? (danger ? 'text-rose-300 hover:bg-crit/15' : 'text-zinc-300 hover:bg-white/[0.06]') : 'text-zinc-500'
      }`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  )
}

// ── Now playing ──────────────────────────────────────────────────────────────

function NowPlayingBanner({ game, startedAt, entry }: { game: Game; startedAt: number; entry?: PlaytimeEntry }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const s = Math.floor((now - startedAt) / 1000)
  const clock = `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className="panel relative mb-5 flex h-28 items-center gap-5 overflow-hidden !border-acid/40 px-5">
      {game.hero && <img src={game.hero} alt="" className="pointer-events-none absolute inset-0 size-full object-cover opacity-25" onError={(e) => (e.currentTarget.style.display = 'none')} />}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-base via-base/80 to-transparent" />
      <div className="relative h-20 w-[54px] shrink-0 overflow-hidden rounded-[3px] border border-white/10">
        <Cover game={game} />
      </div>
      <div className="relative min-w-0 flex-1">
        <div className="eyebrow flex items-center gap-1.5 text-acid-soft">
          <span className="size-1.5 rounded-full bg-acid animate-pulse-dot" /> Jogando agora
        </div>
        <div className="truncate text-[22px] font-semibold text-zinc-50">{game.name}</div>
        <div className="font-mono text-[11px] text-zinc-500">Total: {duration(totalMs(game, entry))}</div>
      </div>
      <div className="relative text-right">
        <div className="eyebrow">Sessão</div>
        <div className="font-mono text-[28px] font-medium text-zinc-50 tabular-nums">{clock}</div>
      </div>
    </div>
  )
}

// ── Activity ─────────────────────────────────────────────────────────────────

function Activity({ lib }: { lib: LibrarySnapshot }) {
  const { volt } = useSettings()
  const [range, setRange] = useState<7 | 30>(7)

  const { data, today, week, top } = useMemo(() => {
    const days = Array.from({ length: range }, (_, i) => dayKey(Date.now() - (range - 1 - i) * DAY_MS))
    const byDay = new Map(days.map((d) => [d, 0]))
    const perGame = new Map<string, number>()
    const weekStart = dayKey(Date.now() - 6 * DAY_MS)
    let week = 0
    for (const [id, e] of Object.entries(lib.playtime)) {
      for (const [d, ms] of Object.entries(e.days)) {
        if (byDay.has(d)) byDay.set(d, byDay.get(d)! + ms)
        if (d >= weekStart) {
          week += ms
          perGame.set(id, (perGame.get(id) ?? 0) + ms)
        }
      }
    }
    const topId = [...perGame.entries()].sort((a, b) => b[1] - a[1])[0]
    return {
      data: days.map((d) => ({
        day: new Date(`${d}T12:00`).toLocaleDateString('pt-BR', range === 7 ? { weekday: 'short' } : { day: '2-digit' }).replace('.', ''),
        hours: +(byDay.get(d)! / 3_600_000).toFixed(2)
      })),
      today: byDay.get(dayKey(Date.now())) ?? 0,
      week,
      top: topId ? { game: lib.games.find((g) => g.id === topId[0]), ms: topId[1] } : null
    }
  }, [lib, range])

  return (
    <div className="mb-6 grid grid-cols-[220px_minmax(0,1fr)] gap-4">
      <div className="grid gap-3">
        <Stat icon={<Clock />} label="Hoje" value={duration(today)} />
        <Stat icon={<BarChart3 />} label="Últimos 7 dias" value={duration(week)} />
        <Stat icon={<Trophy />} label="Mais jogado na semana" value={top?.game?.name ?? '—'} sub={top ? duration(top.ms) : undefined} />
      </div>
      <Panel
        title="Atividade"
        icon={<Gamepad2 />}
        hover={false}
        actions={
          <div className="flex rounded-[3px] border border-white/[0.08] p-0.5">
            {([7, 30] as const).map((r) => (
              <button key={r} onClick={() => setRange(r)} className={`rounded-[2px] px-2 py-0.5 font-mono text-[10px] ${range === r ? 'bg-volt/25 text-volt-100' : 'text-zinc-500 hover:text-zinc-200'}`}>
                {r}D
              </button>
            ))}
          </div>
        }
        bodyClassName="h-[196px] p-3"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
            <XAxis dataKey="day" tick={{ fill: '#52525b', fontSize: 10 }} axisLine={false} tickLine={false} interval={range === 30 ? 3 : 0} />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="rounded-[3px] border border-white/10 bg-void/95 px-2 py-1.5 font-mono text-[10px]">
                    <span className="text-zinc-500">{label} </span>
                    <span className="text-zinc-100">{duration(Number(payload[0].value) * 3_600_000)}</span>
                  </div>
                ) : null
              }
            />
            <Bar dataKey="hours" fill={volt} radius={[2, 2, 0, 0]} maxBarSize={36} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>
    </div>
  )
}

function Stat({ icon, label, value, sub }: { icon: ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="panel flex items-center gap-3 px-3 py-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-[3px] border border-volt/25 bg-volt/10 text-volt-soft [&_svg]:size-4">{icon}</span>
      <div className="min-w-0">
        <div className="eyebrow">{label}</div>
        <div className="truncate font-mono text-[15px] text-zinc-50">{value}</div>
        {sub && <div className="font-mono text-[10px] text-zinc-500">{sub}</div>}
      </div>
    </div>
  )
}

// ── Empty state + add ────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="panel grid place-items-center px-6 py-16 text-center">
      <LibraryBig className="mb-3 size-10 text-zinc-700" strokeWidth={1.25} />
      <h2 className="text-[16px] font-semibold text-zinc-200">Nenhum jogo encontrado</h2>
      <p className="mt-1 max-w-md text-[12px] leading-relaxed text-zinc-500">
        O U-Hub procura jogos da Steam e da Epic automaticamente. Para outros jogos (Minecraft, League, apps da App Store…), adicione manualmente — o tempo de
        jogo é registrado do mesmo jeito.
      </p>
      <button className="btn btn-volt mt-4" onClick={onAdd}>
        <Plus className="size-3.5" /> Adicionar jogo
      </button>
    </div>
  )
}

function AddGameModal({ onClose, onSave }: { onClose: () => void; onSave: (m: ManualGame) => void }) {
  const [draft, setDraft] = useState<ManualGame>({ id: `manual:${uid()}`, name: '', path: '', cover: null })
  const pick = async (): Promise<void> => {
    const r = await window.uhub.library.pickExecutable()
    if (r) setDraft((d) => ({ ...d, path: r.path, name: d.name || r.name }))
  }
  const valid = draft.name.trim() && draft.path

  return (
    <Modal title="Adicionar jogo" onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) onSave({ ...draft, name: draft.name.trim(), cover: draft.cover?.trim() || null })
        }}
      >
        <Field label="Jogo ou app" hint="Usado para abrir o jogo e para detectar quando ele está rodando.">
          <div className="flex gap-2">
            <input className="field flex-1" readOnly value={draft.path} placeholder="Nenhum arquivo escolhido" />
            <button type="button" className="btn shrink-0" onClick={pick}>
              <FolderOpen className="size-3.5" /> Escolher…
            </button>
          </div>
        </Field>
        <Field label="Nome">
          <input className="field" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Minecraft" />
        </Field>
        <Field label="Capa (opcional)" hint="URL de uma imagem vertical. Sem capa, o U-Hub gera uma.">
          <input className="field" value={draft.cover ?? ''} onChange={(e) => setDraft({ ...draft, cover: e.target.value })} placeholder="https://…/capa.jpg" />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-volt" disabled={!valid}>
            Adicionar
          </button>
        </div>
      </form>
    </Modal>
  )
}
