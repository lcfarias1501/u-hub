import { Eye, EyeOff, KeyRound, Lock, Pencil, Plus, Search, Server, Settings2, ShieldCheck, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { FALLBACK_CATEGORY_ID, type VaultCategoryDef, type VaultEntry } from '@shared/types'
import { CopyButton } from '@renderer/components/CopyButton'
import { Field, Modal } from '@renderer/components/Modal'
import { CategoryBadge, CategoryForm, CategoryManager, resolveCategory } from '@renderer/components/VaultCategories'
import { MOD_LABEL, useModHotkeys } from '@renderer/hooks/useHotkeys'
import { usePersistentState } from '@renderer/hooks/usePersistentState'
import { ACCENTS } from '@renderer/lib/accents'
import { uid } from '@renderer/lib/format'
import { iconFor } from '@renderer/lib/icons'
import { PageHeader } from './PageHeader'

export function VaultView() {
  const [entries, setEntries] = useState<VaultEntry[]>([])
  const [protection, setProtection] = useState<'keychain' | 'local-key' | null>(null)
  const [locked, setLocked] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [categories, setCategories, categoriesReady] = usePersistentState('vaultCategories', [])
  const [filter, setFilter] = useState<string>('all')
  const [revealAll, setRevealAll] = useState(false)
  const [editing, setEditing] = useState<VaultEntry | 'new' | null>(null)
  const [managing, setManaging] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const load = (): void =>
    void window.uhub.vault.read().then(({ entries, protection, error }) => {
      setEntries(entries)
      setProtection(protection)
      setLocked(error)
    })
  useEffect(load, [])

  useModHotkeys({
    k: () => searchRef.current?.focus(),
    n: () => setEditing('new')
  })

  const persist = (next: VaultEntry[]): void => {
    setEntries(next)
    void window.uhub.vault.write(next)
  }

  // Entries pointing at a missing category are shown (and counted) under the fallback.
  const categoryOf = (e: VaultEntry): VaultCategoryDef => resolveCategory(categories, e.category)

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return entries
      .filter((e) => filter === 'all' || categoryOf(e).id === filter)
      .filter((e) => !q || [e.title, e.username, e.host, e.notes, categoryOf(e).label].some((f) => f.toLowerCase().includes(q)))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }, [entries, query, filter, categories])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const e of entries) {
      const id = categoryOf(e).id
      c[id] = (c[id] ?? 0) + 1
    }
    return c
  }, [entries, categories])

  const deleteCategory = (id: string): void => {
    if (id === FALLBACK_CATEGORY_ID) return
    setCategories(categories.filter((c) => c.id !== id))
    if (entries.some((e) => e.category === id)) {
      persist(entries.map((e) => (e.category === id ? { ...e, category: FALLBACK_CATEGORY_ID } : e)))
    }
    if (filter === id) setFilter('all')
  }

  if (!categoriesReady) return null
  if (locked) return <LockedVault reason={locked} onStartOver={load} />

  return (
    <div className="animate-rise flex h-full flex-col p-6">
      <PageHeader index="02" title="Vault & Game Keys" subtitle="Credenciais criptografadas localmente">
        {protection && (
          <span className="flex items-center gap-1.5 font-mono text-[10px] text-acid-soft" title={protection === 'keychain' ? 'Criptografado com o chaveiro do sistema (safeStorage)' : 'AES-256-GCM com chave local'}>
            <ShieldCheck className="size-3.5" />
            {protection === 'keychain' ? 'OS KEYCHAIN' : 'AES-256 LOCAL'}
          </span>
        )}
        <button className="btn btn-volt" onClick={() => setEditing('new')}>
          <Plus className="size-3.5" /> Nova credencial
          <kbd className="kbd ml-1">{MOD_LABEL}N</kbd>
        </button>
      </PageHeader>

      <div className="mb-3 flex items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-zinc-600" />
          <input ref={searchRef} className="field pl-9" placeholder="Buscar por nome, user, IP…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <kbd className="kbd absolute top-1/2 right-2 -translate-y-1/2">{MOD_LABEL}K</kbd>
        </div>
        <button className="btn ml-auto" onClick={() => setRevealAll((r) => !r)}>
          {revealAll ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          {revealAll ? 'Ocultar' : 'Mostrar'} todas
        </button>
      </div>

      {/* Category filters scroll sideways once users create many of them. */}
      <div className="mb-4 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto pb-1 [scrollbar-width:thin]">
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label="Todos" count={entries.length} />
          {categories.map((c) => (
            <FilterChip key={c.id} category={c} active={filter === c.id} onClick={() => setFilter(c.id)} label={c.label} count={counts[c.id] ?? 0} />
          ))}
        </div>
        <button className="btn shrink-0" onClick={() => setManaging(true)} title="Criar, editar e reordenar categorias">
          <Settings2 className="size-3.5" /> Categorias
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="panel grid flex-1 place-items-center">
          <div className="text-center">
            <KeyRound className="mx-auto mb-3 size-8 text-zinc-700" strokeWidth={1.25} />
            <p className="font-mono text-[12px] text-zinc-500">{entries.length ? 'Nenhum resultado para o filtro.' : 'Vault vazio. Adicione sua primeira credencial.'}</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
          {visible.map((e) => (
            <VaultCard key={e.id} entry={e} category={categoryOf(e)} revealAll={revealAll} onEdit={() => setEditing(e)} onDelete={() => persist(entries.filter((x) => x.id !== e.id))} />
          ))}
        </div>
      )}

      {editing && (
        <VaultEditor
          initial={editing === 'new' ? null : editing}
          categories={categories}
          defaultCategory={filter !== 'all' ? filter : (categories[0]?.id ?? FALLBACK_CATEGORY_ID)}
          onCreateCategory={(c) => setCategories([...categories, c])}
          onClose={() => setEditing(null)}
          onSave={(entry) => {
            const exists = entries.some((x) => x.id === entry.id)
            persist(exists ? entries.map((x) => (x.id === entry.id ? entry : x)) : [entry, ...entries])
            setEditing(null)
          }}
        />
      )}

      {managing && (
        <CategoryManager categories={categories} counts={counts} onChange={setCategories} onDelete={deleteCategory} onClose={() => setManaging(false)} />
      )}
    </div>
  )
}

/** The stored vault can't be decrypted on this machine: never show it as empty (saving would overwrite it). */
function LockedVault({ reason, onStartOver }: { reason: string; onStartOver: () => void }) {
  const [confirm, setConfirm] = useState(false)
  return (
    <div className="animate-rise grid h-full place-items-center p-6">
      <div className="panel max-w-lg px-8 py-10 text-center">
        <Lock className="mx-auto mb-4 size-9 text-amber-300/80" strokeWidth={1.4} />
        <h2 className="text-[20px] font-semibold text-zinc-50">Vault bloqueado neste computador</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">{reason}</p>
        <p className="mt-3 text-[12px] leading-relaxed text-zinc-500">
          Suas credenciais continuam guardadas e não foram apagadas. Para trazê-las, restaure um backup com Vault em Configurações → Dados & Sobre.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          {confirm ? (
            <button
              className="btn !border-rose-400/40 !text-rose-200"
              onClick={async () => {
                await window.uhub.vault.startOver()
                onStartOver()
              }}
            >
              Sim, começar um Vault vazio
            </button>
          ) : (
            <button className="btn" onClick={() => setConfirm(true)}>
              Começar um Vault vazio
            </button>
          )}
        </div>
        {confirm && <p className="mt-3 font-mono text-[10px] text-zinc-600">O Vault antigo fica guardado como arquivo na pasta de dados do U-Hub.</p>}
      </div>
    </div>
  )
}

function FilterChip({ active, label, count, onClick, category }: { active: boolean; label: string; count: number; onClick: () => void; category?: VaultCategoryDef }) {
  const Icon = category ? iconFor(category.icon) : null
  return (
    <button
      onClick={onClick}
      className={`flex h-8 shrink-0 items-center gap-1.5 rounded-[3px] border px-2.5 text-[12px] whitespace-nowrap transition-all duration-150 ${
        active ? 'border-volt/50 bg-volt/15 text-volt-100' : 'border-transparent text-zinc-500 hover:border-white/10 hover:text-zinc-200'
      }`}
    >
      {Icon && <Icon className={`size-3.5 ${active ? '' : ACCENTS[category!.accent].tone.split(' ')[0]}`} />}
      {label}
      <span className={`font-mono text-[10px] ${active ? 'text-volt-soft' : 'text-zinc-600'}`}>{count}</span>
    </button>
  )
}

function VaultCard({ entry, category: cat, revealAll, onEdit, onDelete }: { entry: VaultEntry; category: VaultCategoryDef; revealAll: boolean; onEdit: () => void; onDelete: () => void }) {
  const [reveal, setReveal] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const shown = reveal || revealAll

  useEffect(() => {
    if (!confirmDelete) return
    const t = setTimeout(() => setConfirmDelete(false), 2500)
    return () => clearTimeout(t)
  }, [confirmDelete])

  return (
    <article className="panel panel-hover group flex flex-col">
      <header className="flex items-start gap-3 p-3 pb-2">
        <CategoryBadge category={cat} className="size-8" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14px] font-semibold text-zinc-100">{entry.title || 'Sem título'}</h3>
          <div className="eyebrow">{cat.label}</div>
        </div>
        <div className="flex opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          <button className="icon-btn" onClick={onEdit} aria-label="Editar">
            <Pencil className="size-3.5" />
          </button>
          <button
            className={`icon-btn ${confirmDelete ? '!bg-crit/20 !text-rose-300' : ''}`}
            onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
            aria-label="Excluir"
            title={confirmDelete ? 'Clique de novo para excluir' : 'Excluir'}
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </header>

      <dl className="mx-3 mb-3 divide-y divide-white/[0.04] rounded-[3px] border border-white/[0.05] bg-black/20 font-mono text-[12px]">
        <Row label="USER" value={entry.username} />
        <Row
          label="KEY"
          value={entry.secret}
          display={shown ? entry.secret : entry.secret ? '•'.repeat(Math.min(entry.secret.length, 16)) : ''}
          sensitive
          extra={
            <button className="icon-btn size-6" onClick={() => setReveal((r) => !r)} aria-label={shown ? 'Ocultar' : 'Mostrar'}>
              {shown ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
            </button>
          }
        />
        {entry.host && <Row label="HOST" value={entry.host} icon={<Server className="size-3 text-zinc-600" />} />}
      </dl>

      {entry.notes && <p className="mx-3 mb-3 line-clamp-2 border-l border-volt/40 pl-2 text-[12px] text-zinc-500">{entry.notes}</p>}
    </article>
  )
}

function Row({ label, value, display, sensitive, extra, icon }: { label: string; value: string; display?: string; sensitive?: boolean; extra?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex h-8 items-center gap-2 px-2">
      <dt className="w-10 shrink-0 text-[9px] tracking-widest text-zinc-600">{label}</dt>
      {icon}
      <dd className="min-w-0 flex-1 truncate text-zinc-300 select-text">{(display ?? value) || <span className="text-zinc-700">—</span>}</dd>
      {extra}
      <CopyButton value={value} sensitive={sensitive} />
    </div>
  )
}

function VaultEditor({
  initial,
  categories,
  defaultCategory,
  onCreateCategory,
  onClose,
  onSave
}: {
  initial: VaultEntry | null
  categories: VaultCategoryDef[]
  defaultCategory: string
  onCreateCategory: (c: VaultCategoryDef) => void
  onClose: () => void
  onSave: (e: VaultEntry) => void
}) {
  const [draft, setDraft] = useState<VaultEntry>(
    initial ?? { id: uid(), category: defaultCategory, title: '', username: '', secret: '', host: '', notes: '', updatedAt: 0 }
  )
  const [showSecret, setShowSecret] = useState(false)
  const [creatingCategory, setCreatingCategory] = useState(false)
  const selected = resolveCategory(categories, draft.category).id
  const set = <K extends keyof VaultEntry>(k: K, v: VaultEntry[K]): void => setDraft((d) => ({ ...d, [k]: v }))

  return (
    <Modal title={initial ? 'Editar credencial' : 'Nova credencial'} onClose={onClose}>
      <form
        className="grid grid-cols-2 gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!draft.title.trim()) return
          onSave({ ...draft, title: draft.title.trim(), updatedAt: Date.now() })
        }}
      >
        <div className="col-span-2 space-y-2">
          <span className="eyebrow">Categoria</span>
          <div className="flex flex-wrap gap-1">
            {categories.map((c) => {
              const Icon = iconFor(c.icon)
              return (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => set('category', c.id)}
                  className={`flex h-8 items-center gap-1.5 rounded-[3px] border px-2.5 text-[12px] transition-all ${
                    selected === c.id ? ACCENTS[c.accent].tone : 'border-white/[0.06] text-zinc-500 hover:text-zinc-200'
                  }`}
                >
                  <Icon className="size-3.5" /> {c.label}
                </button>
              )
            })}
            {!creatingCategory && (
              <button
                type="button"
                onClick={() => setCreatingCategory(true)}
                className="flex h-8 items-center gap-1 rounded-[3px] border border-dashed border-white/15 px-2.5 text-[12px] text-zinc-500 transition-colors hover:border-volt/50 hover:text-volt-200"
              >
                <Plus className="size-3.5" /> Nova
              </button>
            )}
          </div>
          {creatingCategory && (
            <CategoryForm
              existing={categories}
              onCancel={() => setCreatingCategory(false)}
              onSave={(c) => {
                onCreateCategory(c)
                set('category', c.id)
                setCreatingCategory(false)
              }}
            />
          )}
        </div>
        <div className="col-span-2">
          <Field label="Título / Servidor">
            <input autoFocus={!creatingCategory} className="field" value={draft.title} onChange={(e) => set('title', e.target.value)} placeholder="Ex: Conta principal Steam" />
          </Field>
        </div>
        <Field label="Username / Tag">
          <input className="field" value={draft.username} onChange={(e) => set('username', e.target.value)} placeholder="player#1234" />
        </Field>
        <Field label="Senha / Key">
          <div className="relative">
            <input className="field pr-9" type={showSecret ? 'text' : 'password'} value={draft.secret} onChange={(e) => set('secret', e.target.value)} />
            <button type="button" className="icon-btn absolute top-1 right-1" onClick={() => setShowSecret((s) => !s)}>
              {showSecret ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </button>
          </div>
        </Field>
        <div className="col-span-2">
          <Field label="IP / Porta">
            <input className="field" value={draft.host} onChange={(e) => set('host', e.target.value)} placeholder="play.servidor.net:25565" />
          </Field>
        </div>
        <div className="col-span-2">
          <Field label="Notas rápidas">
            <textarea className="field h-20 resize-none py-2" value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </div>
        <div className="col-span-2 flex justify-end gap-2 pt-1">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-volt" disabled={!draft.title.trim()}>
            Salvar
          </button>
        </div>
      </form>
    </Modal>
  )
}
