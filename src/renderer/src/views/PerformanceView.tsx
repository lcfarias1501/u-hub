import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ArrowDown,
  ArrowUp,
  BatteryCharging,
  BatteryFull,
  Cpu,
  GripVertical,
  Grid3x3,
  MemoryStick,
  Network,
  Thermometer
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, YAxis } from 'recharts'
import type { SystemSnapshot, SystemStatic } from '@shared/types'
import { Panel } from '@renderer/components/Panel'
import { usePersistentState } from '@renderer/hooks/usePersistentState'
import { bytes, kbps, pct, rate } from '@renderer/lib/format'
import { HISTORY_SECONDS, LEVEL_META, systemLevel, useSystemFeed } from '@renderer/lib/systemFeed'
import { useSettings } from '@renderer/lib/settings'
import { withAlpha } from '@renderer/lib/theme'
import { PageHeader } from './PageHeader'

const ACID = '#10B981'

type WidgetId = 'cpu' | 'cores' | 'memory' | 'network' | 'power'
const ALL_WIDGETS: WidgetId[] = ['cpu', 'cores', 'memory', 'network', 'power']
const SPAN: Record<WidgetId, string> = {
  cpu: 'col-span-2',
  cores: 'col-span-1',
  memory: 'col-span-1',
  network: 'col-span-1',
  power: 'col-span-1'
}

/** Pads history on the left so charts always span a fixed 60s window instead of stretching. */
function padded<T>(rows: T[], empty: T): T[] {
  return [...Array.from({ length: Math.max(0, HISTORY_SECONDS - rows.length) }, () => empty), ...rows]
}

export function PerformanceView() {
  const { latest, history } = useSystemFeed()
  const [info, setInfo] = useState<SystemStatic | null>(null)
  const [layout, setLayout] = usePersistentState('perfLayout', ALL_WIDGETS)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  useEffect(() => {
    void window.uhub.system.static().then(setInfo)
  }, [])

  // Keep the layout valid if widgets are added/removed in future versions.
  const order = useMemo(() => {
    const known = layout.filter((id): id is WidgetId => ALL_WIDGETS.includes(id as WidgetId))
    return [...known, ...ALL_WIDGETS.filter((w) => !known.includes(w))]
  }, [layout])

  const onDragEnd = ({ active, over }: DragEndEvent): void => {
    if (!over || active.id === over.id) return
    setLayout(arrayMove(order, order.indexOf(active.id as WidgetId), order.indexOf(over.id as WidgetId)))
  }

  const widgets: Record<WidgetId, (handle: ReactNode) => ReactNode> = {
    cpu: (h) => <CpuWidget handle={h} history={history} latest={latest} />,
    cores: (h) => <CoresWidget handle={h} history={history} />,
    memory: (h) => <MemoryWidget handle={h} history={history} latest={latest} />,
    network: (h) => <NetworkWidget handle={h} history={history} latest={latest} />,
    power: (h) => <PowerWidget handle={h} latest={latest} />
  }

  return (
    <div className="animate-rise p-6">
      <PageHeader index="01" title="System Monitor" subtitle="Telemetria em tempo real · 60s">
        {info && (
          <div className="flex gap-px overflow-hidden rounded-[3px] border border-white/[0.06] bg-white/[0.05] font-mono text-[10px]">
            {[
              ['HOST', info.hostname],
              ['CPU', `${info.cpuBrand} · ${info.cpuCores}C`],
              ['OS', `${info.os} ${info.arch}`]
            ].map(([k, v]) => (
              <div key={k} className="bg-void/80 px-2.5 py-1.5">
                <span className="text-zinc-600">{k} </span>
                <span className="text-zinc-300">{v}</span>
              </div>
            ))}
          </div>
        )}
      </PageHeader>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-3 gap-4">
            {order.map((id) => (
              <SortableWidget key={id} id={id} className={SPAN[id]}>
                {widgets[id]}
              </SortableWidget>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}

function SortableWidget({ id, className, children }: { id: string; className: string; children: (handle: ReactNode) => ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id })
  const handle = (
    <button
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      className="-ml-1 cursor-grab text-zinc-600 transition-colors hover:text-zinc-300 active:cursor-grabbing"
      aria-label="Arrastar widget"
    >
      <GripVertical className="size-3.5" />
    </button>
  )
  return (
    <div
      ref={setNodeRef}
      className={`${className} ${isDragging ? 'z-10 opacity-80 [&>section]:border-volt/50' : ''}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      {children(handle)}
    </div>
  )
}

// ── Chart chrome ─────────────────────────────────────────────────────────────

function ChartTip({ active, payload, unit }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; unit: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-[3px] border border-white/10 bg-void/95 px-2 py-1.5 font-mono text-[10px] shadow-xl backdrop-blur">
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="size-1.5" style={{ background: p.color }} />
          <span className="text-zinc-500">{p.name}</span>
          <span className="ml-auto text-zinc-100 tabular-nums">
            {p.value == null ? '—' : `${p.value.toFixed(1)}${unit}`}
          </span>
        </div>
      ))}
    </div>
  )
}

function Readout({ label, value, accent = 'text-zinc-50', sub }: { label: string; value: string; accent?: string; sub?: string }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className={`font-mono text-[22px] leading-tight font-medium tabular-nums ${accent}`}>{value}</div>
      {sub && <div className="font-mono text-[10px] text-zinc-500">{sub}</div>}
    </div>
  )
}

const grid = <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />

// ── Widgets ──────────────────────────────────────────────────────────────────

interface WidgetProps {
  handle: ReactNode
  history: SystemSnapshot[]
  latest: SystemSnapshot | null
}

function CpuWidget({ handle, history, latest }: WidgetProps) {
  const { volt: VOLT } = useSettings()
  const data = padded(
    history.map((s) => ({ cpu: s.cpu.total })),
    { cpu: null as number | null }
  )
  const avg = history.length ? history.reduce((a, s) => a + s.cpu.total, 0) / history.length : 0
  const peak = history.reduce((m, s) => Math.max(m, s.cpu.total), 0)

  return (
    <Panel title="CPU · Total" icon={<Cpu />} lead={handle} meta={`${HISTORY_SECONDS}s`} className="h-[290px]" bodyClassName="flex gap-4 p-4">
      <div className="flex w-32 shrink-0 flex-col justify-between">
        <Readout label="Agora" value={pct(latest?.cpu.total ?? 0)} accent="text-volt-soft" />
        <Readout label="Média" value={pct(avg)} />
        <Readout label="Pico" value={pct(peak)} />
      </div>
      <div className="min-w-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: -18 }}>
            <defs>
              <linearGradient id="cpuFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={VOLT} stopOpacity={0.45} />
                <stop offset="100%" stopColor={VOLT} stopOpacity={0} />
              </linearGradient>
            </defs>
            {grid}
            <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={{ fill: '#52525b', fontSize: 10, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTip unit="%" />} cursor={{ stroke: withAlpha(VOLT, 0.3) }} />
            <Area name="CPU" type="monotone" dataKey="cpu" stroke={VOLT} strokeWidth={1.5} fill="url(#cpuFill)" isAnimationActive={false} connectNulls={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  )
}

/** Heatmap: one row per core, one column per second. Cheaper and denser than N separate line charts. */
function CoresWidget({ handle, history }: Omit<WidgetProps, 'latest'>) {
  const { volt: VOLT } = useSettings()
  const cores = history.at(-1)?.cpu.cores ?? []
  const cols = HISTORY_SECONDS
  const offset = cols - history.length

  return (
    <Panel title="Núcleos" icon={<Grid3x3 />} lead={handle} meta={`${cores.length} threads`} className="h-[290px]" bodyClassName="flex gap-3 p-4">
      <svg className="h-full min-w-0 flex-1" viewBox={`0 0 ${cols} ${Math.max(cores.length, 1)}`} preserveAspectRatio="none">
        {history.map((s, x) =>
          s.cpu.cores.map((load, y) => (
            <rect
              key={`${x}-${y}`}
              x={x + offset}
              y={y}
              width={0.86}
              height={0.8}
              fill={load > 85 ? '#f43f5e' : VOLT}
              fillOpacity={0.06 + (load / 100) * 0.94}
            />
          ))
        )}
      </svg>
      <div className="flex w-14 flex-col justify-between font-mono text-[10px] tabular-nums">
        {cores.map((load, i) => (
          <div key={i} className="flex items-center justify-between leading-none">
            <span className="text-zinc-600">{String(i).padStart(2, '0')}</span>
            <span className={load > 85 ? 'text-rose-300' : load > 50 ? 'text-volt-200' : 'text-zinc-400'}>{load.toFixed(0)}</span>
          </div>
        ))}
      </div>
    </Panel>
  )
}

function MemoryWidget({ handle, history, latest }: WidgetProps) {
  const GB = 1024 ** 3
  const data = padded(
    history.map((s) => ({ used: s.mem.used / GB, free: s.mem.free / GB })),
    { used: null as number | null, free: null as number | null }
  )
  const usedPct = latest ? (latest.mem.used / latest.mem.total) * 100 : 0

  return (
    <Panel title="Memória" icon={<MemoryStick />} lead={handle} meta={latest ? bytes(latest.mem.total) : '—'} className="h-[270px]" bodyClassName="flex flex-col p-4 pt-3">
      <div className="flex items-end justify-between">
        <Readout label="Usada" value={latest ? bytes(latest.mem.used) : '—'} accent="text-acid-soft" sub={pct(usedPct)} />
        <Readout label="Livre" value={latest ? bytes(latest.mem.free) : '—'} sub={latest ? `swap ${bytes(latest.mem.swapUsed)}` : undefined} />
      </div>
      <div className="mt-2 min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: -24 }}>
            {grid}
            <YAxis domain={[0, latest ? latest.mem.total / GB : 'auto']} tick={{ fill: '#52525b', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v.toFixed(0)} />
            <Tooltip content={<ChartTip unit=" GB" />} cursor={{ stroke: 'rgba(16,185,129,0.3)' }} />
            <Area name="Usada" stackId="m" type="monotone" dataKey="used" stroke={ACID} strokeWidth={1.5} fill={ACID} fillOpacity={0.25} isAnimationActive={false} />
            <Area name="Livre" stackId="m" type="monotone" dataKey="free" stroke="rgba(255,255,255,0.15)" strokeWidth={1} fill="rgba(255,255,255,0.03)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  )
}

function NetworkWidget({ handle, history, latest }: WidgetProps) {
  const { volt: VOLT } = useSettings()
  const data = padded(
    history.map((s) => ({ down: kbps(s.net.rxSec), up: kbps(s.net.txSec) })),
    { down: null as number | null, up: null as number | null }
  )

  return (
    <Panel title="Rede" icon={<Network />} lead={handle} meta={latest?.net.iface ?? '—'} className="h-[270px]" bodyClassName="flex flex-col p-4 pt-3">
      <div className="flex gap-6">
        <div className="flex items-center gap-2">
          <ArrowDown className="size-4 text-acid" />
          <Readout label="Download" value={rate(latest?.net.rxSec ?? 0)} />
        </div>
        <div className="flex items-center gap-2">
          <ArrowUp className="size-4 text-volt-soft" />
          <Readout label="Upload" value={rate(latest?.net.txSec ?? 0)} />
        </div>
      </div>
      <div className="mt-2 min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: -18 }}>
            {grid}
            <YAxis tick={{ fill: '#52525b', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v.toFixed(0)} />
            <Tooltip content={<ChartTip unit=" KB/s" />} cursor={{ stroke: 'rgba(255,255,255,0.15)' }} />
            <Line name="Down" type="monotone" dataKey="down" stroke={ACID} strokeWidth={1.5} dot={false} isAnimationActive={false} />
            <Line name="Up" type="monotone" dataKey="up" stroke={VOLT} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  )
}

function Gauge({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex h-2 gap-[2px]">
      {Array.from({ length: 20 }, (_, i) => (
        <span key={i} className="flex-1 rounded-[1px] transition-colors duration-500" style={{ background: i < Math.round(value / 5) ? color : 'rgba(255,255,255,0.06)' }} />
      ))}
    </div>
  )
}

function PowerWidget({ handle, latest }: Omit<WidgetProps, 'history'>) {
  const { volt: VOLT } = useSettings()
  const level = systemLevel(latest)
  const meta = LEVEL_META[level]
  const bat = latest?.battery
  const temp = latest?.temp.main
  const BatIcon = bat?.charging ? BatteryCharging : BatteryFull

  return (
    <Panel title="Energia & Status" icon={<Thermometer />} lead={handle} className="h-[270px]" bodyClassName="flex flex-col gap-4 p-4 pt-3">
      <div className={`flex items-center gap-3 rounded-[3px] border px-3 py-2.5 ${meta.ring}`}>
        <span className={`size-2.5 rounded-full ${meta.dot} ${level === 'normal' ? '' : 'animate-pulse-dot'} shadow-[0_0_10px_currentColor]`} />
        <div>
          <div className="eyebrow">Status do sistema</div>
          <div className={`font-mono text-[15px] font-semibold tracking-wider ${meta.text}`}>{meta.label.toUpperCase()}</div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="eyebrow flex items-center gap-1.5">
            <BatIcon className="size-3" /> Bateria
          </span>
          <span className="font-mono text-[12px] text-zinc-200 tabular-nums">
            {bat?.present ? `${bat.percent.toFixed(0)}%${bat.charging ? ' · carregando' : ''}` : 'n/d'}
          </span>
        </div>
        <Gauge value={bat?.present ? bat.percent : 0} color={bat && bat.percent < 20 ? '#f43f5e' : ACID} />
        {bat?.timeRemaining != null && <div className="font-mono text-[10px] text-zinc-500">~{bat.timeRemaining} min restantes</div>}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="eyebrow flex items-center gap-1.5">
            <Thermometer className="size-3" /> CPU Temp
          </span>
          <span className="font-mono text-[12px] text-zinc-200 tabular-nums">{temp != null ? `${temp.toFixed(0)}°C` : 'sensor n/d'}</span>
        </div>
        <Gauge value={temp ?? 0} color={temp && temp > 80 ? '#f43f5e' : VOLT} />
      </div>
    </Panel>
  )
}
