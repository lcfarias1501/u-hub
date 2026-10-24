import { Check, Copy, EyeOff, Gamepad2, Loader2, LogIn, LogOut, Music2, Pencil, Search, ShieldCheck, Trash2, UserPlus, Users, X } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Friend, FriendRequestResult, Presence, SocialProfile, SocialState } from '@shared/types'
import { Switch } from '@renderer/components/Controls'
import { Panel } from '@renderer/components/Panel'
import { AccentPicker, IconPicker } from '@renderer/components/Pickers'
import { ACCENTS } from '@renderer/lib/accents'
import { iconFor } from '@renderer/lib/icons'
import { useSettings } from '@renderer/lib/settings'
import { PageHeader } from './PageHeader'

const RESULT_TEXT: Record<FriendRequestResult, { text: string; ok: boolean }> = {
  sent: { text: 'Pedido enviado!', ok: true },
  accepted: { text: 'Vocês agora são amigos — essa pessoa já tinha te adicionado.', ok: true },
  already_friends: { text: 'Vocês já são amigos.', ok: false },
  already_sent: { text: 'Você já enviou um pedido para essa pessoa.', ok: false },
  not_found: { text: 'Ninguém encontrado com esse nome ou código.', ok: false },
  self: { text: 'Esse é você 🙂', ok: false }
}

function elapsed(since: number): string {
  const m = Math.floor((Date.now() - since) / 60_000)
  return m < 60 ? `${m}min` : `${Math.floor(m / 60)}h ${m % 60}min`
}

export function FriendsView() {
  const [s, setS] = useState<SocialState | null>(null)
  useEffect(() => {
    void window.uhub.social.get().then(setS)
    return window.uhub.social.onUpdate(setS)
  }, [])

  if (!s) return null
  return (
    <div className="animate-rise p-6">
      <PageHeader index="07" title="Amigos" subtitle="Perfil · amigos · status em tempo real" />
      {!s.configured ? (
        <div className="panel px-6 py-12 text-center text-[13px] text-zinc-500">Este build não tem o servidor de amigos configurado.</div>
      ) : !s.signedIn ? (
        <SignIn loading={s.loading} />
      ) : (
        <SignedIn s={s} />
      )}
    </div>
  )
}

// ── Signed out ───────────────────────────────────────────────────────────────

function SignIn({ loading }: { loading: boolean }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const go = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    const r = await window.uhub.social.signIn()
    setBusy(false)
    if (!r.ok) setError(r.error ?? 'Não foi possível entrar')
  }
  return (
    <div className="panel relative overflow-hidden px-10 py-14">
      <div className="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full bg-[#5865F2]/20 blur-3xl" />
      <div className="relative max-w-xl">
        <Users className="mb-4 size-10 text-volt-soft" strokeWidth={1.5} />
        <h2 className="text-[26px] font-semibold tracking-tight text-zinc-50">Seus amigos no U-Hub</h2>
        <ul className="mt-4 space-y-2 text-[14px] text-zinc-400">
          <li className="flex gap-2"><Gamepad2 className="mt-0.5 size-4 shrink-0 text-volt-soft" /> Veja em tempo real o que cada amigo está jogando ou ouvindo.</li>
          <li className="flex gap-2"><UserPlus className="mt-0.5 size-4 shrink-0 text-volt-soft" /> Adicione pelo nome de usuário ou por um código de amigo.</li>
          <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-volt-soft" /> Só seus amigos veem seu status — e você pode ficar invisível.</li>
        </ul>
        <button
          className="mt-8 inline-flex h-11 items-center gap-2.5 rounded-[4px] bg-[#5865F2] px-5 text-[14px] font-semibold text-white transition-all hover:bg-[#4752c4] hover:shadow-[0_0_28px_-6px_#5865F2] disabled:opacity-60"
          disabled={busy || loading}
          onClick={go}
        >
          {busy || loading ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
          {busy ? 'Aguardando o navegador…' : loading ? 'Carregando…' : 'Entrar com Discord'}
        </button>
        {error && <p className="mt-3 font-mono text-[11px] text-rose-300">✕ {error}</p>}
        <p className="mt-4 text-[11px] text-zinc-600">O login acontece no navegador; o U-Hub só recebe seu nome e avatar do Discord.</p>
      </div>
    </div>
  )
}


// ── Avatar ───────────────────────────────────────────────────────────────────

const STATUS_DOT: Record<string, string> = { playing: 'bg-acid', online: 'bg-acid', away: 'bg-warn', offline: 'bg-zinc-600' }

export function SocialAvatar({ profile, presence, size = 40, showDot = true }: { profile: SocialProfile; presence?: Presence | null; size?: number; showDot?: boolean }) {
  const Icon = iconFor(profile.avatarIcon)
  const status = presence ? presence.status : 'offline'
  return (
    <span className="relative inline-grid shrink-0" style={{ width: size, height: size }}>
      <span className={`grid size-full place-items-center rounded-full border ${ACCENTS[profile.avatarAccent]?.tone ?? ACCENTS.violet.tone}`}>
        <Icon style={{ width: size * 0.45, height: size * 0.45 }} />
      </span>
      {showDot && (
        <span
          className={`absolute -right-0.5 -bottom-0.5 rounded-full border-2 border-base ${STATUS_DOT[status]}`}
          style={{ width: Math.max(10, size * 0.3), height: Math.max(10, size * 0.3) }}
        />
      )}
    </span>
  )
}

function StatusLine({ presence }: { presence: Presence | null }) {
  if (!presence) return <span className="text-zinc-600">Offline</span>
  if (presence.status === 'playing' && presence.game)
    return (
      <span className="flex items-center gap-1.5 text-acid-soft">
        <Gamepad2 className="size-3 shrink-0" />
        <span className="truncate">{presence.game.name}</span>
        <span className="shrink-0 text-zinc-500">· {elapsed(presence.game.since)}</span>
      </span>
    )
  return (
    <span className="flex items-center gap-1.5">
      <span className={presence.status === 'away' ? 'text-amber-300' : 'text-zinc-300'}>{presence.status === 'away' ? 'Ausente' : 'Online'}</span>
      {presence.music && (
        <span className="flex min-w-0 items-center gap-1 text-zinc-500">
          · <Music2 className="size-3 shrink-0" /> <span className="truncate">{presence.music.title}</span>
        </span>
      )}
    </span>
  )
}

// ── Signed in ────────────────────────────────────────────────────────────────

function SignedIn({ s }: { s: SocialState }) {
  return (
    <div className="grid grid-cols-[320px_minmax(0,1fr)] items-start gap-5">
      <div className="space-y-4">
        {s.me && <MyCard me={s.me} presence={s.myPresence} />}
        <Privacy />
      </div>
      <div className="space-y-4">
        {s.error && <div className="rounded-[3px] border border-crit/30 bg-crit/[0.08] px-3 py-2 font-mono text-[11px] text-rose-200">{s.error}</div>}
        <AddFriend />
        {s.requests.length > 0 && <Requests s={s} />}
        <FriendList friends={s.friends} loading={s.loading} />
      </div>
    </div>
  )
}

function MyCard({ me, presence }: { me: SocialProfile; presence: Presence | null }) {
  const [editing, setEditing] = useState(false)
  const [copied, setCopied] = useState(false)
  const { settings } = useSettings()

  return (
    <Panel title="Você" icon={<Users />} hover={false} bodyClassName="p-4">
      {editing ? (
        <EditProfile me={me} onDone={() => setEditing(false)} />
      ) : (
        <>
          <div className="flex items-center gap-3">
            <SocialAvatar profile={me} presence={presence} size={52} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[16px] font-semibold text-zinc-50">{me.displayName}</div>
              <div className="truncate font-mono text-[11px] text-zinc-500">@{me.username}</div>
            </div>
            <button className="icon-btn" onClick={() => setEditing(true)} aria-label="Editar perfil">
              <Pencil className="size-3.5" />
            </button>
          </div>
          <div className="mt-3 font-mono text-[11px]">
            {settings.social.invisible ? (
              <span className="flex items-center gap-1.5 text-zinc-500">
                <EyeOff className="size-3" /> Invisível para todos
              </span>
            ) : (
              <StatusLine presence={presence} />
            )}
          </div>
          <div className="mt-4 rounded-[3px] border border-white/[0.06] bg-black/30 p-2.5">
            <div className="eyebrow mb-1">Seu código de amigo</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-[18px] tracking-[0.25em] text-volt-100 select-text">{me.friendCode}</code>
              <button
                className={`btn h-7 ${copied ? '!border-acid/40 !text-acid-soft' : ''}`}
                onClick={async () => {
                  await window.uhub.clipboard.copy(me.friendCode)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1400)
                }}
              >
                {copied ? <Check className="size-3" /> : <Copy className="size-3" />} {copied ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
            <div className="mt-1 text-[11px] text-zinc-600">Ou compartilhe seu usuário: @{me.username}</div>
          </div>
          <button className="btn mt-4 w-full justify-center hover:!border-crit/40 hover:!text-rose-300" onClick={() => void window.uhub.social.signOut()}>
            <LogOut className="size-3.5" /> Sair
          </button>
        </>
      )}
    </Panel>
  )
}

function EditProfile({ me, onDone }: { me: SocialProfile; onDone: () => void }) {
  const [draft, setDraft] = useState({ username: me.username, displayName: me.displayName, avatarIcon: me.avatarIcon, avatarAccent: me.avatarAccent })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const save = async (): Promise<void> => {
    setSaving(true)
    const r = await window.uhub.social.updateProfile(draft)
    setSaving(false)
    if (r.error) setError(r.error)
    else onDone()
  }
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="eyebrow">Nome</span>
        <input className="field mt-1" maxLength={32} value={draft.displayName} onChange={(e) => setDraft((d) => ({ ...d, displayName: e.target.value }))} />
      </label>
      <label className="block">
        <span className="eyebrow">Usuário</span>
        <div className="relative mt-1">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-mono text-[12px] text-zinc-600">@</span>
          <input className="field pl-7" maxLength={20} value={draft.username} onChange={(e) => setDraft((d) => ({ ...d, username: e.target.value.toLowerCase() }))} />
        </div>
      </label>
      <div>
        <span className="eyebrow">Avatar</span>
        <div className="mt-1 max-h-28 overflow-y-auto">
          <IconPicker value={draft.avatarIcon} onChange={(avatarIcon) => setDraft((d) => ({ ...d, avatarIcon }))} />
        </div>
      </div>
      <AccentPicker value={draft.avatarAccent} onChange={(avatarAccent) => setDraft((d) => ({ ...d, avatarAccent }))} />
      {error && <p className="font-mono text-[10px] text-rose-300">{error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <button className="btn" onClick={onDone}>
          Cancelar
        </button>
        <button className="btn btn-volt" disabled={saving} onClick={save}>
          {saving && <Loader2 className="size-3.5 animate-spin" />} Salvar
        </button>
      </div>
    </div>
  )
}

function Privacy() {
  const { settings, update } = useSettings()
  const p = settings.social
  const set = (patch: Partial<typeof p>): void => update({ social: { ...p, ...patch } })
  const row = (title: string, text: string, control: ReactNode): ReactNode => (
    <div className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-zinc-200">{title}</div>
        <div className="text-[11px] text-zinc-500">{text}</div>
      </div>
      {control}
    </div>
  )
  return (
    <Panel title="Privacidade" icon={<ShieldCheck />} hover={false} bodyClassName="divide-y divide-white/[0.05] px-4 py-1">
      {row('Mostrar o que estou jogando', 'Jogos detectados pela Biblioteca.', <Switch checked={p.shareGame} disabled={p.invisible} onChange={(shareGame) => set({ shareGame })} label="Mostrar jogo" />)}
      {row('Mostrar a rádio que estou ouvindo', 'Estação da rádio embutida.', <Switch checked={p.shareMusic} disabled={p.invisible} onChange={(shareMusic) => set({ shareMusic })} label="Mostrar música" />)}
      {row('Ficar invisível', 'Aparece offline para todos.', <Switch checked={p.invisible} onChange={(invisible) => set({ invisible })} label="Invisível" />)}
    </Panel>
  )
}

function AddFriend() {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const submit = async (): Promise<void> => {
    if (!q.trim()) return
    setBusy(true)
    const r = await window.uhub.social.addFriend(q)
    setBusy(false)
    setMsg(r.error ? { text: r.error, ok: false } : RESULT_TEXT[r.result!])
    if (r.result === 'sent' || r.result === 'accepted') setQ('')
  }
  return (
    <Panel title="Adicionar amigo" icon={<UserPlus />} hover={false} bodyClassName="p-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-zinc-600" />
          <input className="field h-10 pl-9" placeholder="@usuario ou código de amigo (ex: 7F3A9C21)" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="btn btn-volt h-10 px-4" disabled={busy || !q.trim()}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />} Adicionar
        </button>
      </form>
      {msg && <p className={`mt-2 font-mono text-[11px] ${msg.ok ? 'text-acid-soft' : 'text-amber-300'}`}>{msg.text}</p>}
    </Panel>
  )
}

function Requests({ s }: { s: SocialState }) {
  const incoming = s.requests.filter((r) => r.incoming)
  const outgoing = s.requests.filter((r) => !r.incoming)
  return (
    <Panel title="Pedidos" icon={<UserPlus />} meta={`${incoming.length} recebidos · ${outgoing.length} enviados`} hover={false} bodyClassName="divide-y divide-white/[0.05] px-3 py-1">
      {[...incoming, ...outgoing].map((r) => (
        <div key={r.id} className="flex items-center gap-3 py-2.5">
          <SocialAvatar profile={r.profile} size={34} showDot={false} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] text-zinc-100">{r.profile.displayName}</div>
            <div className="font-mono text-[10px] text-zinc-500">
              @{r.profile.username} · {r.incoming ? 'quer ser seu amigo' : 'aguardando resposta'}
            </div>
          </div>
          {r.incoming ? (
            <>
              <button className="btn h-8 !border-acid/40 !text-emerald-200 hover:!bg-acid/15" onClick={() => void window.uhub.social.respond(r.id, true)}>
                <Check className="size-3.5" /> Aceitar
              </button>
              <button className="btn h-8" onClick={() => void window.uhub.social.respond(r.id, false)}>
                Recusar
              </button>
            </>
          ) : (
            <button className="btn h-8" onClick={() => void window.uhub.social.cancel(r.id)}>
              <X className="size-3.5" /> Cancelar
            </button>
          )}
        </div>
      ))}
    </Panel>
  )
}

function FriendList({ friends, loading }: { friends: Friend[]; loading: boolean }) {
  const [, tick] = useState(0)
  useEffect(() => {
    // Re-render elapsed "playing for" times.
    const t = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  const groups = useMemo(() => {
    const g: { title: string; list: Friend[] }[] = [
      { title: 'Jogando agora', list: friends.filter((f) => f.presence?.status === 'playing') },
      { title: 'Online', list: friends.filter((f) => f.presence?.status === 'online') },
      { title: 'Ausente', list: friends.filter((f) => f.presence?.status === 'away') },
      { title: 'Offline', list: friends.filter((f) => !f.presence) }
    ]
    return g.filter((x) => x.list.length)
  }, [friends])
  const online = friends.filter((f) => f.presence).length

  return (
    <Panel title="Amigos" icon={<Users />} meta={`${online} online · ${friends.length}`} hover={false} bodyClassName="p-2">
      {loading && !friends.length ? (
        <div className="flex items-center justify-center gap-2 py-10 text-[12px] text-zinc-500">
          <Loader2 className="size-4 animate-spin" /> Carregando…
        </div>
      ) : !friends.length ? (
        <div className="py-10 text-center text-[12px] text-zinc-500">Nenhum amigo ainda. Mande seu código ou adicione alguém acima.</div>
      ) : (
        groups.map((g) => (
          <div key={g.title} className="mb-2">
            <div className="eyebrow px-2 py-1.5">
              {g.title} · {g.list.length}
            </div>
            {g.list.map((f) => (
              <FriendRow key={f.profile.id} f={f} />
            ))}
          </div>
        ))
      )}
    </Panel>
  )
}

function FriendRow({ f }: { f: Friend }) {
  const [confirm, setConfirm] = useState(false)
  const game = f.presence?.status === 'playing' ? f.presence.game : undefined
  return (
    <div className={`group flex items-center gap-3 rounded-[4px] px-2 py-2 transition-colors hover:bg-white/[0.03] ${f.presence ? '' : 'opacity-60'}`} onMouseLeave={() => setConfirm(false)}>
      <SocialAvatar profile={f.profile} presence={f.presence} size={38} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-[14px] text-zinc-100">{f.profile.displayName}</span>
          <span className="truncate font-mono text-[10px] text-zinc-600">@{f.profile.username}</span>
        </div>
        <div className="font-mono text-[11px]">
          <StatusLine presence={f.presence} />
        </div>
      </div>
      {game?.cover && <img src={game.cover} alt="" className="h-12 w-8 shrink-0 rounded-[2px] object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />}
      {confirm ? (
        <button className="btn h-7 !border-crit/50 !text-rose-300" onClick={() => void window.uhub.social.remove(f.profile.id)}>
          Remover?
        </button>
      ) : (
        <button className="icon-btn opacity-0 group-hover:opacity-100 hover:!text-rose-300" onClick={() => setConfirm(true)} aria-label="Remover amigo">
          <Trash2 className="size-3.5" />
        </button>
      )}
    </div>
  )
}
