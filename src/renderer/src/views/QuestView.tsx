import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Check, Hammer, Pencil, Plus, Rocket, ScrollText, Sun, Tag, Terminal, Trash2, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Launcher, LauncherKind, Quest, QuestColumn, QuestTag } from '@shared/types'
import { Field, Modal } from '@renderer/components/Modal'
import { Panel } from '@renderer/components/Panel'
import { AccentPicker, IconPicker } from '@renderer/components/Pickers'
import { usePersistentState } from '@renderer/hooks/usePersistentState'
import { ACCENTS } from '@renderer/lib/accents'
import { uid } from '@renderer/lib/format'
import { iconFor } from '@renderer/lib/icons'
import { PageHeader } from './PageHeader'

export function QuestView() {
  return (
    <div className="animate-rise flex h-full flex-col gap-4 p-6">
      <PageHeader index="04" title="Quest Log & Atalhos" subtitle="Tarefas · builds · launchers" />
      <QuestBoard />
      <QuickLauncher />
    </div>
  )
}

// ── Quest board ──────────────────────────────────────────────────────────────

const COLUMNS: { id: QuestColumn; label: string; accent: string }[] = [
  { id: 'backlog', label: 'Backlog', accent: 'bg-zinc-500' },
  { id: 'active', label: 'Em andamento', accent: 'bg-volt' },
  { id: 'done', label: 'Concluído', accent: 'bg-acid' }
]

const TAGS: Record<QuestTag, { label: string; icon: LucideIcon; tone: string }> = {
  build: { label: 'Build', icon: Hammer, tone: 'text-amber-300 border-amber-400/25 bg-amber-500/10' },
  code: { label: 'Código', icon: Terminal, tone: 'text-sky-300 border-sky-400/25 bg-sky-500/10' },
  daily: { label: 'Daily', icon: Sun, tone: 'text-violet-300 border-violet-400/25 bg-violet-500/10' },
  misc: { label: 'Misc', icon: Tag, tone: 'text-zinc-300 border-white/15 bg-white/5' }
}

const isColumn = (id: unknown): id is QuestColumn => COLUMNS.some((c) => c.id === id)

function QuestBoard() {
  const [quests, setQuests] = usePersistentState('quests', [])
  const [dragging, setDragging] = useState<Quest | null>(null)
  const [title, setTitle] = useState('')
  const [hint, setHint] = useState(false)
  const [fresh, setFresh] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [tag, setTag] = useState<QuestTag>('misc')
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const columnOf = (id: unknown): QuestColumn | undefined => (isColumn(id) ? id : quests.find((q) => q.id === id)?.column)

  const onDragStart = ({ active }: DragStartEvent): void => setDragging(quests.find((q) => q.id === active.id) ?? null)

  // Cross-column moves happen while hovering so the card visibly jumps into the target list.
  const onDragOver = ({ active, over }: DragOverEvent): void => {
    if (!over) return
    const to = columnOf(over.id)
    const from = columnOf(active.id)
    if (!to || !from || to === from) return
    setQuests((qs) => {
      const moving = qs.find((q) => q.id === active.id)!
      const rest = qs.filter((q) => q.id !== active.id)
      const at = rest.findIndex((q) => q.id === over.id)
      const moved = { ...moving, column: to }
      return at < 0 ? [...rest, moved] : [...rest.slice(0, at), moved, ...rest.slice(at)]
    })
  }

  const onDragEnd = ({ active, over }: DragEndEvent): void => {
    setDragging(null)
    if (!over || active.id === over.id || isColumn(over.id)) return
    setQuests((qs) => arrayMove(qs, qs.findIndex((q) => q.id === active.id), qs.findIndex((q) => q.id === over.id)))
  }

  // Add stays clickable: with an empty title it points the user at the input instead of silently doing nothing.
  const add = (): void => {
    if (!title.trim()) {
      setHint(true)
      inputRef.current?.focus()
      inputRef.current?.animate(
        [{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }],
        { duration: 240, iterations: 2 }
      )
      return
    }
    const q: Quest = { id: uid(), title: title.trim(), tag, column: 'backlog', createdAt: Date.now() }
    setQuests([q, ...quests]) // newest on top of Backlog, so it's visible even when the column scrolls
    setTitle('')
    setFresh(q.id)
  }

  useEffect(() => {
    if (!fresh) return
    const t = setTimeout(() => setFresh(null), 1600)
    return () => clearTimeout(t)
  }, [fresh])

  const toggleDone = (q: Quest): void =>
    setQuests(quests.map((x) => (x.id === q.id ? { ...x, column: x.column === 'done' ? 'backlog' : 'done' } : x)))

  const remove = (q: Quest): void => setQuests(quests.filter((x) => x.id !== q.id))

  return (
    <Panel title="Quest Log" icon={<ScrollText />} meta={`${quests.filter((q) => q.column === 'done').length}/${quests.length} completas`} hover={false} bodyClassName="flex flex-col gap-3 p-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <div className="flex gap-1">
          {(Object.keys(TAGS) as QuestTag[]).map((t) => {
            const T = TAGS[t]
            return (
              <button
                type="button"
                key={t}
                onClick={() => setTag(t)}
                title={T.label}
                className={`grid size-8 place-items-center rounded-[3px] border transition-all ${tag === t ? T.tone : 'border-white/[0.06] text-zinc-600 hover:text-zinc-300'}`}
              >
                <T.icon className="size-3.5" />
              </button>
            )
          })}
        </div>
        <input
          ref={inputRef}
          className={`field h-8 flex-1 ${hint ? '!border-volt/70' : ''}`}
          placeholder={hint ? 'Digite o nome da quest aqui e aperte Enter ou Add' : 'Nova quest: build, código de console, afazer…  ↵'}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => setHint(false)}
        />
        <button className={`btn btn-volt ${title.trim() ? '' : 'opacity-60'}`}>
          <Plus className="size-3.5" /> Add
        </button>
      </form>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
        <div className="grid grid-cols-3 gap-3">
          {COLUMNS.map((col) => (
            <QuestColumnView key={col.id} column={col} quests={quests.filter((q) => q.column === col.id)} onToggle={toggleDone} onRemove={remove} freshId={fresh} />
          ))}
        </div>
        {/* Portalled to <body> so no transformed ancestor can offset the overlay from the pointer. */}
        {createPortal(
          <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2,0.9,0.25,1)' }}>
            {dragging && <QuestCard quest={dragging} overlay />}
          </DragOverlay>,
          document.body
        )}
      </DndContext>
    </Panel>
  )
}

function QuestColumnView({ column, quests, onToggle, onRemove, freshId }: { column: (typeof COLUMNS)[number]; quests: Quest[]; onToggle: (q: Quest) => void; onRemove: (q: Quest) => void; freshId: string | null }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })
  return (
    <div ref={setNodeRef} className={`flex min-h-[180px] flex-col rounded-[3px] border bg-black/20 transition-colors ${isOver ? 'border-volt/40' : 'border-white/[0.05]'}`}>
      <div className="flex h-8 items-center gap-2 border-b border-white/[0.04] px-2.5">
        <span className={`size-1.5 ${column.accent}`} />
        <span className="eyebrow text-zinc-400">{column.label}</span>
        <span className="ml-auto font-mono text-[10px] text-zinc-600">{quests.length}</span>
      </div>
      <SortableContext items={quests.map((q) => q.id)} strategy={verticalListSortingStrategy}>
        <div className="flex max-h-[260px] flex-1 flex-col gap-1.5 overflow-y-auto p-1.5">
          {quests.map((q) => (
            <SortableQuest key={q.id} quest={q} fresh={q.id === freshId} onToggle={() => onToggle(q)} onRemove={() => onRemove(q)} />
          ))}
        </div>
      </SortableContext>
    </div>
  )
}

function SortableQuest({ quest, fresh, onToggle, onRemove }: { quest: Quest; fresh: boolean; onToggle: () => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: quest.id })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} {...attributes} {...listeners} className={`${isDragging ? 'opacity-30' : ''} ${fresh ? 'animate-rise [&>div]:!border-acid/60 [&>div]:shadow-[0_0_18px_-6px_var(--color-acid)]' : ''}`}>
      <QuestCard quest={quest} onToggle={onToggle} onRemove={onRemove} />
    </div>
  )
}

function QuestCard({ quest, overlay, onToggle, onRemove }: { quest: Quest; overlay?: boolean; onToggle?: () => void; onRemove?: () => void }) {
  const T = TAGS[quest.tag]
  const done = quest.column === 'done'
  return (
    <div
      className={`group flex cursor-grab items-start gap-2 rounded-[3px] border bg-raised/80 p-2 transition-all duration-150 active:cursor-grabbing ${
        overlay ? 'rotate-[1.5deg] border-volt/50 shadow-[0_16px_40px_-12px_color-mix(in_srgb,var(--color-volt)_50%,transparent)]' : 'border-white/[0.06] hover:border-white/15'
      }`}
    >
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onToggle}
        className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-[2px] border transition-all ${done ? 'border-acid bg-acid/25 text-acid-soft' : 'border-white/20 hover:border-volt'}`}
        aria-label="Concluir"
      >
        {done && <Check className="size-3" strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-[12px] leading-snug break-words ${done ? 'text-zinc-600 line-through' : 'text-zinc-200'} ${quest.tag === 'code' ? 'font-mono select-text' : ''}`}>{quest.title}</p>
        <span className={`mt-1 inline-flex items-center gap-1 rounded-[2px] border px-1 py-px font-mono text-[9px] ${T.tone}`}>
          <T.icon className="size-2.5" /> {T.label.toUpperCase()}
        </span>
      </div>
      {onRemove && (
        <button onPointerDown={(e) => e.stopPropagation()} onClick={onRemove} className="icon-btn size-5 opacity-0 group-hover:opacity-100" aria-label="Remover">
          <Trash2 className="size-3" />
        </button>
      )}
    </div>
  )
}

// ── Quick launcher ───────────────────────────────────────────────────────────



const KIND_LABEL: Record<LauncherKind, string> = { app: 'APP', path: 'PASTA', url: 'URL' }

function QuickLauncher() {
  const [launchers, setLaunchers] = usePersistentState('launchers', [])
  const [editing, setEditing] = useState<Launcher | 'new' | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const onDragEnd = ({ active, over }: DragEndEvent): void => {
    if (!over || active.id === over.id) return
    setLaunchers((ls) => arrayMove(ls, ls.findIndex((l) => l.id === active.id), ls.findIndex((l) => l.id === over.id)))
  }

  return (
    <Panel
      title="Quick Launcher"
      icon={<Rocket />}
      meta="arraste para reordenar"
      hover={false}
      actions={
        <button className="btn ml-2 h-7" onClick={() => setEditing('new')}>
          <Plus className="size-3" /> Atalho
        </button>
      }
      bodyClassName="p-3"
    >
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
        <SortableContext items={launchers.map((l) => l.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
            {launchers.map((l) => (
              <LauncherTile key={l.id} launcher={l} onEdit={() => setEditing(l)} />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {editing && (
        <LauncherEditor
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onDelete={(id) => {
            setLaunchers(launchers.filter((l) => l.id !== id))
            setEditing(null)
          }}
          onSave={(l) => {
            const exists = launchers.some((x) => x.id === l.id)
            setLaunchers(exists ? launchers.map((x) => (x.id === l.id ? l : x)) : [...launchers, l])
            setEditing(null)
          }}
        />
      )}
    </Panel>
  )
}

function LauncherTile({ launcher, onEdit }: { launcher: Launcher; onEdit: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: launcher.id })
  const [status, setStatus] = useState<{ ok: boolean; error?: string } | null>(null)
  const Icon = iconFor(launcher.icon)
  const accent = ACCENTS[launcher.accent]

  useEffect(() => {
    if (!status) return
    const t = setTimeout(() => setStatus(null), status.ok ? 1200 : 4000)
    return () => clearTimeout(t)
  }, [status])

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={`group relative ${isDragging ? 'z-10 opacity-70' : ''}`}
    >
      <button
        // Launches go through main by id, so the renderer never hands a raw command to child_process.
        onClick={async () => setStatus(await window.uhub.launcher.run(launcher.id))}
        title={status?.error ?? launcher.target}
        className={`flex h-[84px] w-full flex-col justify-between rounded-[3px] border p-2.5 text-left transition-all duration-200 group-hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] ${accent.tile} ${accent.glow} ${
          status ? (status.ok ? '!border-acid/60' : '!border-crit/60') : ''
        }`}
      >
        <div className="flex items-start justify-between">
          <Icon className="size-5" strokeWidth={1.5} />
          <span className="font-mono text-[9px] text-zinc-500 transition-opacity group-hover:opacity-0">{KIND_LABEL[launcher.kind]}</span>
        </div>
        <div>
          <div className="truncate text-[13px] font-medium text-zinc-100">{launcher.label}</div>
          <div className={`truncate font-mono text-[10px] ${status && !status.ok ? 'text-rose-300' : 'text-zinc-500'}`}>
            {status ? (status.ok ? '▸ executado' : status.error) : launcher.target}
          </div>
        </div>
      </button>
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onEdit}
        className="icon-btn absolute top-1.5 right-1.5 size-6 bg-void/80 opacity-0 group-hover:opacity-100"
        aria-label="Editar atalho"
      >
        <Pencil className="size-3" />
      </button>
    </div>
  )
}

function LauncherEditor({ initial, onClose, onSave, onDelete }: { initial: Launcher | null; onClose: () => void; onSave: (l: Launcher) => void; onDelete: (id: string) => void }) {
  const [d, setD] = useState<Launcher>(initial ?? { id: uid(), label: '', kind: 'app', target: '', icon: 'rocket', accent: 'violet' })
  const set = <K extends keyof Launcher>(k: K, v: Launcher[K]): void => setD((x) => ({ ...x, [k]: v }))
  const isMac = window.uhub.platform === 'darwin'
  const placeholder: Record<LauncherKind, string> = {
    app: isMac ? 'Visual Studio Code  ou  /Applications/Steam.app' : 'C:\\Program Files\\Discord\\Update.exe',
    path: '~/Projects  ou  /Volumes/Games',
    url: 'steam://open/main  ou  https://…'
  }

  return (
    <Modal title={initial ? 'Editar atalho' : 'Novo atalho'} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (d.label.trim() && d.target.trim()) onSave({ ...d, label: d.label.trim(), target: d.target.trim() })
        }}
      >
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Nome">
            <input autoFocus className="field" value={d.label} onChange={(e) => set('label', e.target.value)} placeholder="Discord" />
          </Field>
          <Field label="Tipo">
            <div className="flex h-9 rounded-[3px] border border-white/[0.08] p-0.5">
              {(Object.keys(KIND_LABEL) as LauncherKind[]).map((k) => (
                <button type="button" key={k} onClick={() => set('kind', k)} className={`rounded-[2px] px-3 font-mono text-[10px] transition-colors ${d.kind === k ? 'bg-volt/25 text-volt-100' : 'text-zinc-500 hover:text-zinc-200'}`}>
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
          </Field>
        </div>
        <Field label="Alvo" hint={d.kind === 'app' && isMac ? 'Nome do app (abre com `open -a`) ou caminho .app' : undefined}>
          <input className="field" value={d.target} onChange={(e) => set('target', e.target.value)} placeholder={placeholder[d.kind]} />
        </Field>
        <Field label="Ícone">
          <IconPicker value={d.icon} onChange={(v) => set('icon', v)} />
        </Field>
        <Field label="Cor">
          <AccentPicker value={d.accent} onChange={(v) => set('accent', v)} />
        </Field>
        <div className="flex gap-2 pt-1">
          {initial && (
            <button type="button" className="btn hover:!border-crit/50 hover:!text-rose-300" onClick={() => onDelete(initial.id)}>
              <Trash2 className="size-3.5" /> Excluir
            </button>
          )}
          <button type="button" className="btn ml-auto" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-volt" disabled={!d.label.trim() || !d.target.trim()}>
            Salvar
          </button>
        </div>
      </form>
    </Modal>
  )
}
