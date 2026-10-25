import { Loader2, Paperclip, Send, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { MailAccount, MailDraft } from '@shared/types'
import { Modal } from '@renderer/components/Modal'

export function Compose({ draft: initial, accounts, contacts, onClose }: { draft: MailDraft; accounts: MailAccount[]; contacts: string[]; onClose: (sent: boolean) => void }) {
  const [d, setD] = useState<MailDraft>(initial)
  const [showCc, setShowCc] = useState(!!(initial.cc || initial.bcc))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof MailDraft>(k: K, v: MailDraft[K]): void => setD((x) => ({ ...x, [k]: v }))

  const send = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    const r = await window.uhub.mail.send(d)
    setBusy(false)
    if (r.ok) onClose(true)
    else setError(r.error ?? 'Não foi possível enviar')
  }

  const row = (label: string, key: 'to' | 'cc' | 'bcc', extra?: ReactNode): ReactNode => (
    <label className="flex items-center gap-3 border-b border-white/[0.06] py-1.5">
      <span className="w-10 shrink-0 font-mono text-[11px] text-zinc-500">{label}</span>
      <input className="h-8 flex-1 bg-transparent text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600" list="mail-contacts" value={d[key]} onChange={(e) => set(key, e.target.value)} placeholder="nome@exemplo.com, …" />
      {extra}
    </label>
  )

  return (
    <Modal title={initial.inReplyTo ? 'Responder' : 'Novo e-mail'} onClose={() => onClose(false)} width="max-w-3xl">
      <datalist id="mail-contacts">
        {contacts.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <div className="space-y-1">
        <label className="flex items-center gap-3 border-b border-white/[0.06] py-1.5">
          <span className="w-10 shrink-0 font-mono text-[11px] text-zinc-500">De</span>
          <select className="h-8 flex-1 cursor-pointer bg-transparent text-[13px] text-zinc-100 outline-none" value={d.accountId} onChange={(e) => set('accountId', e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id} className="bg-raised">
                {a.name} &lt;{a.email}&gt;
              </option>
            ))}
          </select>
        </label>
        {row(
          'Para',
          'to',
          !showCc && (
            <button className="font-mono text-[11px] text-zinc-500 hover:text-zinc-200" onClick={() => setShowCc(true)}>
              Cc/Cco
            </button>
          )
        )}
        {showCc && row('Cc', 'cc')}
        {showCc && row('Cco', 'bcc')}
        <input
          className="h-10 w-full border-b border-white/[0.06] bg-transparent text-[14px] text-zinc-100 outline-none placeholder:text-zinc-600"
          placeholder="Assunto"
          value={d.subject}
          onChange={(e) => set('subject', e.target.value)}
        />
        <textarea
          autoFocus
          className="h-72 w-full resize-none bg-transparent py-3 text-[13px] leading-relaxed text-zinc-200 outline-none placeholder:text-zinc-600 select-text"
          placeholder="Escreva sua mensagem…"
          value={d.body}
          onChange={(e) => set('body', e.target.value)}
        />
      </div>

      {d.attachments.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {d.attachments.map((p) => (
            <span key={p} className="flex items-center gap-1.5 rounded-[3px] border border-white/[0.08] bg-black/20 py-1 pr-1 pl-2 text-[11px] text-zinc-300">
              <Paperclip className="size-3" /> {p.split(/[\\/]/).pop()}
              <button className="icon-btn size-5" onClick={() => set('attachments', d.attachments.filter((x) => x !== p))}>
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      {error && <p className="mb-3 rounded-[3px] border border-crit/30 bg-crit/[0.08] px-3 py-2 text-[12px] text-rose-200">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          className="btn"
          onClick={async () => {
            const r = await window.uhub.mail.pickAttachments()
            set('attachments', [...new Set([...d.attachments, ...r.files])])
            setError(r.skipped.length ? `Não dá para anexar pastas: ${r.skipped.join(', ')}. Compacte em .zip e anexe o .zip.` : null)
          }}
        >
          <Paperclip className="size-3.5" /> Anexar
        </button>
        <button className="btn ml-auto" onClick={() => onClose(false)}>
          Descartar
        </button>
        <button className="btn btn-volt h-9 px-4" disabled={busy || !d.to.trim()} onClick={send}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} Enviar
        </button>
      </div>
    </Modal>
  )
}
