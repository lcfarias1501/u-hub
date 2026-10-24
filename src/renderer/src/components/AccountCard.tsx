import { Check, KeyRound, Loader2, LogIn, Mail, UserPlus, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react'
import type { SocialState } from '@shared/types'
import { Modal } from './Modal'

type Mode = 'signin' | 'signup' | 'forgot'

/** Live social/auth state for components that only need to know who's signed in. */
export function useSocial(): SocialState | null {
  const [s, setS] = useState<SocialState | null>(null)
  useEffect(() => {
    void window.uhub.social.get().then(setS)
    return window.uhub.social.onUpdate(setS)
  }, [])
  return s
}

function Input({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <input {...props} className={`field mt-1 h-10 ${props.className ?? ''}`} />
    </label>
  )
}

/**
 * U-Hub account form: e-mail + password (sign in / create / forgot), with
 * Discord as an optional shortcut. Signing in also triggers settings sync.
 */
export function AccountCard({ intro, compact }: { intro?: ReactNode; compact?: boolean }) {
  const s = useSocial()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState<'form' | 'discord' | null>(null)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [available, setAvailable] = useState<boolean | null>(null)
  const seq = useRef(0)

  // Live "username available?" while signing up.
  useEffect(() => {
    if (mode !== 'signup' || !/^[a-z0-9_]{3,20}$/.test(username)) return setAvailable(null)
    const n = ++seq.current
    const t = setTimeout(async () => {
      const ok = await window.uhub.social.usernameAvailable(username)
      if (n === seq.current) setAvailable(ok)
    }, 350)
    return () => clearTimeout(t)
  }, [username, mode])

  if (!s) return null
  if (!s.configured) return <p className="text-[12px] text-zinc-500">Este build não tem o servidor de contas configurado.</p>

  if (s.pendingEmail) {
    return (
      <div className="flex items-start gap-3 rounded-[4px] border border-volt/30 bg-volt/[0.06] p-4">
        <Mail className="mt-0.5 size-5 shrink-0 text-volt-soft" />
        <div className="text-[13px] leading-relaxed text-zinc-300">
          Enviamos um link de confirmação para <strong className="text-zinc-50">{s.pendingEmail}</strong>. Abra o e-mail e clique no link —
          o U-Hub entra sozinho na sua conta.
          <div className="mt-1 text-[11px] text-zinc-500">Não chegou? Confira o spam. O link vale por 30 minutos com o app aberto.</div>
        </div>
      </div>
    )
  }

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    setBusy('form')
    setMsg(null)
    if (mode === 'signin') {
      const r = await window.uhub.social.signInEmail(email, password)
      if (!r.ok) setMsg({ text: r.error ?? 'Não foi possível entrar', ok: false })
    } else if (mode === 'signup') {
      const r = await window.uhub.social.signUpEmail({ email, password, username, displayName })
      if (!r.ok) setMsg({ text: r.error ?? 'Não foi possível criar a conta', ok: false })
    } else {
      const r = await window.uhub.social.resetPassword(email)
      setMsg(r.ok ? { text: 'Se existir uma conta com esse e-mail, enviamos um link. Clique nele com o U-Hub aberto para definir uma nova senha.', ok: true } : { text: r.error ?? 'Falhou', ok: false })
    }
    setBusy(null)
  }

  const discord = async (): Promise<void> => {
    setBusy('discord')
    setMsg(null)
    const r = await window.uhub.social.signInDiscord()
    setBusy(null)
    if (!r.ok) setMsg({ text: r.error ?? 'Não foi possível entrar com Discord', ok: false })
  }

  const canSubmit =
    mode === 'forgot' ? /\S+@\S+\.\S+/.test(email) : mode === 'signin' ? !!email && !!password : /\S+@\S+\.\S+/.test(email) && password.length >= 6 && /^[a-z0-9_]{3,20}$/.test(username) && available !== false

  return (
    <div className={compact ? '' : 'max-w-md'}>
      {intro}
      {mode !== 'forgot' && (
        <div className="mb-4 flex rounded-[4px] border border-white/[0.08] p-0.5">
          {(['signin', 'signup'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m)
                setMsg(null)
              }}
              className={`flex-1 rounded-[3px] py-2 text-[13px] transition-colors ${mode === m ? 'bg-volt/20 text-volt-100' : 'text-zinc-500 hover:text-zinc-200'}`}
            >
              {m === 'signin' ? 'Entrar' : 'Criar conta'}
            </button>
          ))}
        </div>
      )}

      <form className="space-y-3" onSubmit={submit}>
        {mode === 'forgot' && <p className="text-[12px] text-zinc-400">Digite o e-mail da sua conta. Enviaremos um link para definir uma nova senha.</p>}
        <Input label="E-mail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
        {mode === 'signup' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Input
                label="Usuário"
                value={username}
                maxLength={20}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="seu_nome"
              />
              <div className="mt-1 h-3 font-mono text-[10px]">
                {username.length > 0 && username.length < 3 ? (
                  <span className="text-zinc-500">mínimo 3 caracteres</span>
                ) : available === true ? (
                  <span className="text-acid-soft">✓ disponível</span>
                ) : available === false ? (
                  <span className="text-rose-300">já em uso</span>
                ) : null}
              </div>
            </div>
            <Input label="Nome (opcional)" value={displayName} maxLength={32} onChange={(e) => setDisplayName(e.target.value)} placeholder="Como aparece" />
          </div>
        )}
        {mode !== 'forgot' && (
          <Input
            label="Senha"
            type="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'signup' ? 'Mínimo 6 caracteres' : ''}
          />
        )}

        {msg && <p className={`text-[12px] ${msg.ok ? 'text-acid-soft' : 'text-rose-300'}`}>{msg.text}</p>}

        <button className="btn btn-volt h-10 w-full justify-center text-[13px]" disabled={!canSubmit || !!busy}>
          {busy === 'form' ? <Loader2 className="size-4 animate-spin" /> : mode === 'signup' ? <UserPlus className="size-4" /> : mode === 'forgot' ? <Mail className="size-4" /> : <LogIn className="size-4" />}
          {mode === 'signup' ? 'Criar conta' : mode === 'forgot' ? 'Enviar link' : 'Entrar'}
        </button>

        <div className="flex justify-between text-[11px]">
          {mode === 'forgot' ? (
            <button type="button" className="text-zinc-500 hover:text-zinc-200" onClick={() => setMode('signin')}>
              ← Voltar para entrar
            </button>
          ) : (
            <button type="button" className="text-zinc-500 hover:text-zinc-200" onClick={() => setMode('forgot')}>
              Esqueci a senha
            </button>
          )}
        </div>
      </form>

      {mode !== 'forgot' && (
        <>
          <div className="my-4 flex items-center gap-3 font-mono text-[10px] text-zinc-600">
            <span className="h-px flex-1 bg-white/[0.06]" /> OU <span className="h-px flex-1 bg-white/[0.06]" />
          </div>
          <button
            type="button"
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[4px] bg-[#5865F2] text-[13px] font-semibold text-white transition-all hover:bg-[#4752c4] disabled:opacity-60"
            disabled={!!busy}
            onClick={discord}
          >
            {busy === 'discord' ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
            {busy === 'discord' ? 'Aguardando o navegador…' : 'Continuar com Discord'}
          </button>
        </>
      )}
    </div>
  )
}

/** Shown app-wide after opening a password-reset link. */
export function RecoveryDialog() {
  const s = useSocial()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!s?.recovery) return null
  const ok = pw.length >= 6 && pw === pw2
  return (
    <Modal title="Definir nova senha" onClose={() => undefined}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          const r = await window.uhub.social.setPassword(pw)
          setBusy(false)
          if (!r.ok) setErr(r.error ?? 'Falhou')
        }}
      >
        <p className="flex items-center gap-2 text-[13px] text-zinc-300">
          <KeyRound className="size-4 text-volt-soft" /> Você entrou pelo link de recuperação. Escolha uma nova senha.
        </p>
        <Input label="Nova senha" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        <Input label="Confirmar senha" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        {err && <p className="text-[12px] text-rose-300">{err}</p>}
        <button className="btn btn-volt w-full justify-center" disabled={!ok || busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Salvar nova senha
        </button>
      </form>
    </Modal>
  )
}

/** First sync on a device that already has data, against an account that also has data. */
export function SyncConflictDialog() {
  const [state, setState] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    void window.uhub.sync.status().then((s) => setState(s.state))
    return window.uhub.sync.onUpdate((s) => setState(s.state))
  }, [])
  if (state !== 'conflict') return null
  const choose = async (keep: 'cloud' | 'local'): Promise<void> => {
    setBusy(true)
    await window.uhub.sync.resolve(keep)
    setBusy(false)
  }
  return (
    <Modal title="Sincronizar configurações" onClose={() => undefined} width="max-w-xl">
      <p className="text-[13px] leading-relaxed text-zinc-300">
        Este computador já tem configurações, e sua conta também tem configurações salvas de outro lugar. Qual você quer manter?
      </p>
      <p className="mt-2 text-[11px] text-zinc-500">Inclui módulos, cores, atalhos, Quest Log, Launcher, rádios, playlists, categorias e lista de desejos. Senhas do Vault não são afetadas.</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button className="panel panel-hover p-4 text-left" disabled={busy} onClick={() => void choose('cloud')}>
          <div className="text-[14px] font-semibold text-zinc-100">Usar da conta</div>
          <div className="mt-1 text-[12px] text-zinc-500">Substitui o que está neste computador pelo que está salvo na nuvem.</div>
        </button>
        <button className="panel panel-hover p-4 text-left" disabled={busy} onClick={() => void choose('local')}>
          <div className="text-[14px] font-semibold text-zinc-100">Manter deste computador</div>
          <div className="mt-1 text-[12px] text-zinc-500">Envia as configurações daqui para a conta, substituindo as da nuvem.</div>
        </button>
      </div>
      {busy && (
        <div className="mt-3 flex items-center gap-2 text-[12px] text-zinc-500">
          <Loader2 className="size-3.5 animate-spin" /> Sincronizando…
        </div>
      )}
    </Modal>
  )
}

export function ProviderBadge({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-[3px] border px-1.5 py-0.5 font-mono text-[10px] ${on ? 'border-acid/30 text-acid-soft' : 'border-white/10 text-zinc-500'}`}>
      {on ? <Check className="size-3" /> : <X className="size-3" />} {label}
    </span>
  )
}
