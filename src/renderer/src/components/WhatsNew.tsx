import { Sparkles } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'
import type { ChangelogEntry } from '@renderer/lib/changelog'
import { Modal } from './Modal'

const GROUP_TONE: Record<string, string> = {
  Adicionado: 'text-acid-soft border-acid/30 bg-acid/10',
  Melhorado: 'text-volt-200 border-volt/30 bg-volt/10',
  Corrigido: 'text-amber-200 border-warn/30 bg-warn/10'
}

/** **bold** is the only inline markup the changelog uses. */
function inline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') ? (
      <strong key={i} className="font-semibold text-zinc-100">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    )
  )
}

export function WhatsNew({ entries, title, onClose }: { entries: ChangelogEntry[]; title: string; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose} width="max-w-2xl">
      <div className="max-h-[65vh] space-y-6 overflow-y-auto pr-1">
        {entries.map((e) => (
          <section key={e.version}>
            <div className="mb-3 flex items-baseline gap-3">
              <h3 className="flex items-center gap-2 font-mono text-[16px] font-semibold text-zinc-50">
                <Sparkles className="size-4 text-volt-soft" /> v{e.version}
              </h3>
              {e.date && <span className="font-mono text-[11px] text-zinc-500">{new Date(`${e.date}T12:00`).toLocaleDateString('pt-BR')}</span>}
            </div>
            <div className="space-y-3">
              {e.groups.map((g) => (
                <div key={g.title}>
                  <span className={`inline-block rounded-[3px] border px-1.5 py-px font-mono text-[10px] tracking-wider uppercase ${GROUP_TONE[g.title] ?? 'border-white/10 text-zinc-400'}`}>
                    {g.title}
                  </span>
                  <ul className="mt-2 space-y-1.5">
                    {g.items.map((it, i) => (
                      <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-zinc-400">
                        <span className="mt-[9px] size-1 shrink-0 rounded-full bg-zinc-600" />
                        <div>
                          {inline(it.text)}
                          {it.children.length > 0 && (
                            <ul className="mt-1 space-y-1 border-l border-white/[0.06] pl-3">
                              {it.children.map((c, j) => (
                                <li key={j} className="text-[12px]">
                                  {inline(c)}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <button className="btn btn-volt" onClick={onClose}>
          Entendi
        </button>
      </div>
    </Modal>
  )
}
