import { ExternalLink, Loader2, ShieldCheck, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { MAIL_PRESETS, type MailAccount, type MailPreset } from '@shared/types'
import { Field, Modal } from '@renderer/components/Modal'
import { AccentPicker } from '@renderer/components/Pickers'
import { uid } from '@renderer/lib/format'

const PRESET_ORDER: MailPreset[] = ['gmail', 'icloud', 'yahoo', 'zoho', 'outlook', 'custom']

export function AccountSetup({ initial, onClose, onSaved }: { initial: MailAccount | null; onClose: () => void; onSaved: (a: MailAccount) => void }) {
  const [a, setA] = useState<MailAccount>(
    initial ?? {
      id: uid(),
      name: '',
      email: '',
      preset: 'gmail',
      username: '',
      imap: MAIL_PRESETS.gmail.imap,
      smtp: MAIL_PRESETS.gmail.smtp,
      accent: 'sky',
      signature: '',
      notify: 'all'
    }
  )
  const [pass, setPass] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [advanced, setAdvanced] = useState(a.preset === 'custom')
  const [confirmRemove, setConfirmRemove] = useState(false)
  const preset = MAIL_PRESETS[a.preset]

  const choose = (p: MailPreset): void => {
    setA((x) => ({ ...x, preset: p, imap: MAIL_PRESETS[p].imap, smtp: MAIL_PRESETS[p].smtp }))
    setAdvanced(p === 'custom')
  }

  const save = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    const account = { ...a, username: a.username.trim() || a.email.trim(), email: a.email.trim(), name: a.name.trim() || a.email.trim() }
    const r = await window.uhub.mail.saveAccount(account, pass || null)
    setBusy(false)
    if (r.ok) onSaved(account)
    else setError(r.error ?? 'Não foi possível conectar')
  }

  const server = (which: 'imap' | 'smtp'): ReactNode => (
    <div className="grid grid-cols-[1fr_90px_130px] gap-2">
      <Field label={`${which.toUpperCase()} servidor`}>
        <input className="field" value={a[which].host} onChange={(e) => setA((x) => ({ ...x, [which]: { ...x[which], host: e.target.value.trim() } }))} placeholder={which === 'imap' ? 'imap.exemplo.com' : 'smtp.exemplo.com'} />
      </Field>
      <Field label="Porta">
        <input className="field" inputMode="numeric" value={a[which].port} onChange={(e) => setA((x) => ({ ...x, [which]: { ...x[which], port: Number(e.target.value.replace(/\D/g, '')) || 0 } }))} />
      </Field>
      <Field label="Segurança">
        <select className="field cursor-pointer" value={a[which].secure ? 'ssl' : 'starttls'} onChange={(e) => setA((x) => ({ ...x, [which]: { ...x[which], secure: e.target.value === 'ssl' } }))}>
          <option value="ssl">SSL/TLS</option>
          <option value="starttls">STARTTLS</option>
        </select>
      </Field>
    </div>
  )

  const valid = /\S+@\S+\.\S+/.test(a.email) && (pass || initial) && a.imap.host && a.smtp.host && a.imap.port && a.smtp.port

  return (
    <Modal title={initial ? 'Editar conta de e-mail' : 'Adicionar conta de e-mail'} onClose={onClose} width="max-w-2xl">
      <div className="space-y-4">
        <div className="grid grid-cols-6 gap-1.5">
          {PRESET_ORDER.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => choose(p)}
              className={`rounded-[3px] border px-2 py-2 text-[12px] transition-colors ${a.preset === p ? 'border-volt/60 bg-volt/15 text-volt-100' : 'border-white/[0.07] text-zinc-400 hover:text-zinc-100'}`}
            >
              {MAIL_PRESETS[p].label}
            </button>
          ))}
        </div>

        <div className={`flex gap-2 rounded-[3px] border p-3 text-[12px] leading-relaxed ${a.preset === 'outlook' ? 'border-warn/30 bg-warn/[0.06] text-amber-100/90' : 'border-white/[0.06] bg-black/20 text-zinc-400'}`}>
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-volt-soft" />
          <div>
            {preset.help}
            {preset.helpUrl && (
              <a href={preset.helpUrl} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-0.5 text-volt-soft hover:underline">
                Abrir <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="E-mail">
            <input className="field" type="email" value={a.email} onChange={(e) => setA((x) => ({ ...x, email: e.target.value }))} placeholder="voce@gmail.com" />
          </Field>
          <Field label={a.preset === 'gmail' || a.preset === 'icloud' || a.preset === 'yahoo' ? 'Senha de app' : 'Senha'} hint={initial ? 'Deixe em branco para manter a atual.' : 'Fica criptografada neste computador. Nunca vai para a nuvem.'}>
            <input className="field" type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder={initial ? '••••••••' : ''} />
          </Field>
          <Field label="Nome de exibição">
            <input className="field" value={a.name} onChange={(e) => setA((x) => ({ ...x, name: e.target.value }))} placeholder="Como aparece para quem recebe" />
          </Field>
          <Field label="Notificar e-mails novos">
            <select className="field cursor-pointer" value={a.notify} onChange={(e) => setA((x) => ({ ...x, notify: e.target.value as MailAccount['notify'] }))}>
              <option value="all">Todos</option>
              <option value="categories">Só das categorias que notificam</option>
              <option value="none">Nenhum</option>
            </select>
          </Field>
        </div>

        <Field label="Assinatura (opcional)">
          <textarea className="field h-16 resize-none py-2" value={a.signature} onChange={(e) => setA((x) => ({ ...x, signature: e.target.value }))} />
        </Field>
        <Field label="Cor">
          <AccentPicker value={a.accent} onChange={(accent) => setA((x) => ({ ...x, accent }))} />
        </Field>

        <button type="button" className="font-mono text-[11px] text-zinc-500 hover:text-zinc-200" onClick={() => setAdvanced((v) => !v)}>
          {advanced ? '▾' : '▸'} Servidores e usuário (avançado)
        </button>
        {advanced && (
          <div className="space-y-3 rounded-[3px] border border-white/[0.06] p-3">
            <Field label="Usuário de login" hint="Quase sempre é o próprio e-mail.">
              <input className="field" value={a.username} onChange={(e) => setA((x) => ({ ...x, username: e.target.value }))} placeholder={a.email || 'igual ao e-mail'} />
            </Field>
            {server('imap')}
            {server('smtp')}
          </div>
        )}

        {error && <p className="rounded-[3px] border border-crit/30 bg-crit/[0.08] px-3 py-2 text-[12px] text-rose-200">{error}</p>}

        <div className="flex items-center gap-2 pt-1">
          {initial &&
            (confirmRemove ? (
              <button
                className="btn !border-crit/50 !text-rose-300"
                onClick={async () => {
                  await window.uhub.mail.removeAccount(initial.id)
                  onClose()
                }}
              >
                Remover a conta do U-Hub?
              </button>
            ) : (
              <button className="btn hover:!text-rose-300" onClick={() => setConfirmRemove(true)}>
                <Trash2 className="size-3.5" /> Remover
              </button>
            ))}
          <button className="btn ml-auto" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-volt" disabled={!valid || busy} onClick={save}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : null} {busy ? 'Testando conexão…' : initial ? 'Salvar' : 'Conectar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
