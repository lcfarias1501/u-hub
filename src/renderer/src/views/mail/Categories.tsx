import { Bell, BellOff, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import type { MailCategory, MailRule } from '@shared/types'
import { Modal } from '@renderer/components/Modal'
import { AccentPicker, IconPicker } from '@renderer/components/Pickers'
import { ACCENTS } from '@renderer/lib/accents'
import { uid } from '@renderer/lib/format'
import { iconFor } from '@renderer/lib/icons'

const FIELD_LABEL: Record<MailRule['field'], string> = { from: 'Remetente contém', to: 'Destinatário contém', subject: 'Assunto contém' }

export function CategoriesManager({
  categories,
  rules,
  onChange,
  onClose
}: {
  categories: MailCategory[]
  rules: MailRule[]
  onChange: (categories: MailCategory[], rules: MailRule[]) => void
  onClose: () => void
}) {
  const [selected, setSelected] = useState<string | null>(categories[0]?.id ?? null)
  const cat = categories.find((c) => c.id === selected) ?? null
  const myRules = rules.filter((r) => r.categoryId === selected)
  const setCat = (patch: Partial<MailCategory>): void => onChange(categories.map((c) => (c.id === selected ? { ...c, ...patch } : c)), rules)

  return (
    <Modal title="Categorias de e-mail" onClose={onClose} width="max-w-3xl">
      <p className="mb-4 text-[12px] text-zinc-500">
        Categorias organizam seus e-mails dentro do U-Hub, sem mexer nas pastas da sua conta. Um e-mail entra na categoria quando bate com qualquer uma das regras dela.
      </p>
      <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-4">
        <div className="space-y-1">
          {categories.map((c) => {
            const Icon = iconFor(c.icon)
            return (
              <button
                key={c.id}
                onClick={() => setSelected(c.id)}
                className={`flex w-full items-center gap-2 rounded-[3px] px-2.5 py-2 text-left text-[13px] transition-colors ${selected === c.id ? 'bg-volt/15 text-zinc-50' : 'text-zinc-400 hover:bg-white/[0.04]'}`}
              >
                <Icon className={`size-4 ${ACCENTS[c.accent].tone.split(' ')[0]}`} />
                <span className="flex-1 truncate">{c.name}</span>
                <span className="font-mono text-[10px] text-zinc-600">{rules.filter((r) => r.categoryId === c.id).length}</span>
              </button>
            )
          })}
          <button
            className="btn mt-2 w-full justify-center border-dashed"
            onClick={() => {
              const c: MailCategory = { id: uid(), name: 'Nova categoria', icon: 'star', accent: 'violet', notify: false }
              onChange([...categories, c], rules)
              setSelected(c.id)
            }}
          >
            <Plus className="size-3.5" /> Nova categoria
          </button>
        </div>

        {cat ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <input className="field h-10 flex-1 text-[14px]" value={cat.name} maxLength={28} onChange={(e) => setCat({ name: e.target.value })} />
              <button className={`btn h-10 ${cat.notify ? '!border-volt/50 !text-volt-100' : ''}`} onClick={() => setCat({ notify: !cat.notify })} title="Notificar e-mails novos desta categoria">
                {cat.notify ? <Bell className="size-3.5" /> : <BellOff className="size-3.5" />} {cat.notify ? 'Notifica' : 'Silenciosa'}
              </button>
              <button
                className="icon-btn size-10 hover:!text-rose-300"
                title="Excluir categoria"
                onClick={() => {
                  onChange(
                    categories.filter((c) => c.id !== cat.id),
                    rules.filter((r) => r.categoryId !== cat.id)
                  )
                  setSelected(categories.find((c) => c.id !== cat.id)?.id ?? null)
                }}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
            <div className="max-h-24 overflow-y-auto">
              <IconPicker value={cat.icon} onChange={(icon) => setCat({ icon })} />
            </div>
            <AccentPicker value={cat.accent} onChange={(accent) => setCat({ accent })} />

            <div>
              <div className="eyebrow mb-2">Regras</div>
              <div className="space-y-1.5">
                {myRules.map((r) => (
                  <div key={r.id} className="flex items-center gap-2">
                    <select
                      className="field h-8 w-48 cursor-pointer"
                      value={r.field}
                      onChange={(e) => onChange(categories, rules.map((x) => (x.id === r.id ? { ...x, field: e.target.value as MailRule['field'] } : x)))}
                    >
                      {Object.entries(FIELD_LABEL).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                    <input
                      className="field h-8 flex-1"
                      value={r.contains}
                      placeholder={r.field === 'from' ? 'fulano@email.com ou @empresa.com' : 'texto'}
                      onChange={(e) => onChange(categories, rules.map((x) => (x.id === r.id ? { ...x, contains: e.target.value } : x)))}
                    />
                    <button className="icon-btn" onClick={() => onChange(categories, rules.filter((x) => x.id !== r.id))} aria-label="Remover regra">
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
                <button className="btn h-8" onClick={() => onChange(categories, [...rules, { id: uid(), categoryId: cat.id, field: 'from', contains: '' }])}>
                  <Plus className="size-3.5" /> Adicionar regra
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid place-items-center text-[12px] text-zinc-600">Crie uma categoria para começar.</div>
        )}
      </div>
    </Modal>
  )
}
