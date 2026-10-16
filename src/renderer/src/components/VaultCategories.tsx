import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Check, GripVertical, Lock, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { FALLBACK_CATEGORY_ID, type VaultCategoryDef } from '@shared/types'
import { ACCENTS } from '@renderer/lib/accents'
import { uid } from '@renderer/lib/format'
import { iconFor } from '@renderer/lib/icons'
import { Field, Modal } from './Modal'
import { AccentPicker, IconPicker } from './Pickers'

const MAX_LABEL = 24

export const FALLBACK_CATEGORY: VaultCategoryDef = { id: FALLBACK_CATEGORY_ID, label: 'Outros', icon: 'key-round', accent: 'zinc' }

/** Resolves an entry's category, falling back to "Outros" for ids that no longer exist. */
export function resolveCategory(categories: VaultCategoryDef[], id: string): VaultCategoryDef {
  return categories.find((c) => c.id === id) ?? categories.find((c) => c.id === FALLBACK_CATEGORY_ID) ?? FALLBACK_CATEGORY
}

export function CategoryBadge({ category, className = '' }: { category: VaultCategoryDef; className?: string }) {
  const Icon = iconFor(category.icon)
  return (
    <span className={`grid shrink-0 place-items-center rounded-[3px] border ${ACCENTS[category.accent].tone} ${className}`}>
      <Icon className="size-[55%]" strokeWidth={1.75} />
    </span>
  )
}

/**
 * Name + icon + colour editor. Not a <form>: it is also rendered inside the
 * credential editor's form, and nested forms are invalid HTML.
 */
export function CategoryForm({
  initial,
  existing,
  onSave,
  onCancel
}: {
  initial?: VaultCategoryDef
  existing: VaultCategoryDef[]
  onSave: (c: VaultCategoryDef) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<VaultCategoryDef>(initial ?? { id: uid(), label: '', icon: 'gamepad', accent: 'violet' })
  const label = draft.label.trim()
  const duplicate = existing.some((c) => c.id !== draft.id && c.label.trim().toLowerCase() === label.toLowerCase())
  const error = duplicate ? 'Já existe uma categoria com esse nome' : null
  const canSave = label.length > 0 && !duplicate

  const save = (): void => {
    if (canSave) onSave({ ...draft, label })
  }

  return (
    <div className="animate-rise space-y-3 rounded-[3px] border border-volt/25 bg-volt/[0.04] p-3">
      <div className="flex items-end gap-3">
        <CategoryBadge category={{ ...draft, label: label || 'Prévia' }} className="size-9" />
        <div className="flex-1">
          <Field label="Nome da categoria">
            <input
              autoFocus
              className={`field ${error ? '!border-crit/50' : ''}`}
              maxLength={MAX_LABEL}
              placeholder="Ex: Valorant, Servidor de RPG…"
              value={draft.label}
              onChange={(e) => {
                const label = e.target.value
                setDraft((d) => ({ ...d, label }))
              }}
              onKeyDown={(e) => {
                // Enter saves the category without submitting a surrounding form.
                if (e.key === 'Enter') {
                  e.preventDefault()
                  save()
                }
                if (e.key === 'Escape') {
                  e.stopPropagation()
                  onCancel()
                }
              }}
            />
          </Field>
        </div>
      </div>
      {error && <p className="font-mono text-[10px] text-rose-300">{error}</p>}
      <Field label="Ícone">
        <IconPicker value={draft.icon} onChange={(icon) => setDraft((d) => ({ ...d, icon }))} />
      </Field>
      <Field label="Cor">
        <AccentPicker value={draft.accent} onChange={(accent) => setDraft((d) => ({ ...d, accent }))} />
      </Field>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn h-7" onClick={onCancel}>
          Cancelar
        </button>
        <button type="button" className="btn btn-volt h-7" disabled={!canSave} onClick={save}>
          <Check className="size-3.5" /> {initial ? 'Salvar' : 'Criar categoria'}
        </button>
      </div>
    </div>
  )
}

export function CategoryManager({
  categories,
  counts,
  onChange,
  onDelete,
  onClose
}: {
  categories: VaultCategoryDef[]
  counts: Record<string, number>
  onChange: (next: VaultCategoryDef[]) => void
  /** Deleting moves that category's entries to the fallback category. */
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const onDragEnd = ({ active, over }: DragEndEvent): void => {
    if (!over || active.id === over.id) return
    onChange(arrayMove(categories, categories.findIndex((c) => c.id === active.id), categories.findIndex((c) => c.id === over.id)))
  }

  return (
    <Modal title="Categorias do Vault" onClose={onClose} width="max-w-xl">
      <p className="mb-3 text-[12px] text-zinc-500">Arraste para reordenar. A ordem aqui é a ordem dos filtros.</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={categories.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          <ul className="max-h-[50vh] space-y-1 overflow-y-auto pr-1">
            {categories.map((c) =>
              editing === c.id ? (
                <li key={c.id}>
                  <CategoryForm
                    initial={c}
                    existing={categories}
                    onCancel={() => setEditing(null)}
                    onSave={(next) => {
                      onChange(categories.map((x) => (x.id === next.id ? next : x)))
                      setEditing(null)
                    }}
                  />
                </li>
              ) : (
                <CategoryRow key={c.id} category={c} count={counts[c.id] ?? 0} onEdit={() => setEditing(c.id)} onDelete={() => onDelete(c.id)} />
              )
            )}
          </ul>
        </SortableContext>
      </DndContext>

      <div className="mt-3">
        {editing === 'new' ? (
          <CategoryForm
            existing={categories}
            onCancel={() => setEditing(null)}
            onSave={(c) => {
              onChange([...categories, c])
              setEditing(null)
            }}
          />
        ) : (
          <button className="btn w-full justify-center border-dashed" onClick={() => setEditing('new')}>
            <Plus className="size-3.5" /> Nova categoria
          </button>
        )}
      </div>
    </Modal>
  )
}

function CategoryRow({ category, count, onEdit, onDelete }: { category: VaultCategoryDef; count: number; onEdit: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: category.id })
  const [confirm, setConfirm] = useState(false)
  const locked = category.id === FALLBACK_CATEGORY_ID

  useEffect(() => {
    if (!confirm) return
    const t = setTimeout(() => setConfirm(false), 3000)
    return () => clearTimeout(t)
  }, [confirm])

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`group flex h-11 items-center gap-2.5 rounded-[3px] border px-2 transition-colors ${
        isDragging ? 'z-10 border-volt/50 bg-raised' : 'border-white/[0.05] bg-black/20 hover:border-white/10'
      }`}
    >
      <button ref={setActivatorNodeRef} {...attributes} {...listeners} className="cursor-grab text-zinc-600 hover:text-zinc-300 active:cursor-grabbing" aria-label="Arrastar">
        <GripVertical className="size-3.5" />
      </button>
      <CategoryBadge category={category} className="size-7" />
      <span className="flex-1 truncate text-[13px] text-zinc-200">{category.label}</span>
      <span className="font-mono text-[10px] text-zinc-600">{count} {count === 1 ? 'item' : 'itens'}</span>

      {confirm ? (
        <span className="flex items-center gap-1">
          <span className="font-mono text-[10px] text-rose-300">{count ? `${count} → Outros` : 'Excluir?'}</span>
          <button className="icon-btn !text-rose-300 hover:!bg-crit/20" onClick={onDelete} aria-label="Confirmar exclusão">
            <Check className="size-3.5" />
          </button>
          <button className="icon-btn" onClick={() => setConfirm(false)} aria-label="Cancelar">
            <X className="size-3.5" />
          </button>
        </span>
      ) : (
        <span className="flex items-center opacity-0 transition-opacity group-hover:opacity-100">
          <button className="icon-btn" onClick={onEdit} aria-label="Editar categoria">
            <Pencil className="size-3.5" />
          </button>
          {locked ? (
            <span className="icon-btn cursor-default" title="Categoria padrão: recebe os itens de categorias excluídas">
              <Lock className="size-3.5" />
            </span>
          ) : (
            <button className="icon-btn hover:!text-rose-300" onClick={() => setConfirm(true)} aria-label="Excluir categoria">
              <Trash2 className="size-3.5" />
            </button>
          )}
        </span>
      )}
    </li>
  )
}
