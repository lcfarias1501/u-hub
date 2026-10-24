import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Check,
  Keyboard,
  LibraryBig,
  ListMusic,
  Loader2,
  MessageSquare,
  Palette,
  PanelTop,
  Power,
  Sparkles,
  Store,
  UserRound,
  type LucideIcon
} from 'lucide-react'
import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import type { Accent, LibrarySnapshot, ModuleId, Profile, SpotifyStatus, ThemeAccent } from '@shared/types'
import logo from '@renderer/assets/logo.png'
import { AccountCard, useSocial } from '@renderer/components/AccountCard'
import { Switch } from '@renderer/components/Controls'
import { Modal } from '@renderer/components/Modal'
import { AccentPicker, IconPicker } from '@renderer/components/Pickers'
import { MODULES } from '@renderer/components/nav'
import { isMac } from '@renderer/hooks/useHotkeys'
import { ACCENTS } from '@renderer/lib/accents'
import { iconFor } from '@renderer/lib/icons'
import { REGIONS } from '@renderer/lib/regions'
import { useSettings } from '@renderer/lib/settings'
import { THEME } from '@renderer/lib/theme'
import { Keys } from './settings/ShortcutsDiscord'

type StepId = 'welcome' | 'login' | 'profile' | 'modules' | 'look' | 'connections' | 'daily' | 'done'

const MODULE_PITCH: Record<ModuleId, string> = {
  performance: 'CPU, memória, rede, bateria e temperatura em tempo real.',
  library: 'Seus jogos da Steam, Epic e outros num só lugar, com tempo de jogo.',
  radar: 'Jogos grátis, promoções, alerta de preço e patch notes dos seus jogos.',
  friends: 'Adicione amigos e veja em tempo real o que cada um está jogando.',
  vault: 'Senhas, keys e servidores de jogo criptografados no seu computador.',
  media: 'Rádios lofi e synthwave embutidas e controle do Spotify.',
  quests: 'Kanban para builds e tarefas, mais atalhos para abrir apps e pastas.'
}

const STEP_META: Record<StepId, { label: string; icon: LucideIcon }> = {
  welcome: { label: 'Início', icon: Sparkles },
  login: { label: 'Conta', icon: UserRound },
  profile: { label: 'Perfil', icon: UserRound },
  modules: { label: 'Módulos', icon: PanelTop },
  look: { label: 'Visual', icon: Palette },
  connections: { label: 'Conexões', icon: ListMusic },
  daily: { label: 'Dia a dia', icon: Power },
  done: { label: 'Pronto', icon: Check }
}

export function Onboarding({ onFinish }: { onFinish: (firstModule: ModuleId) => void }) {
  const { settings } = useSettings()
  const [step, setStep] = useState<StepId>('welcome')
  const [dir, setDir] = useState<1 | -1>(1)
  const [profile, setProfile] = useState<Profile>({ name: '', avatar: { icon: 'gamepad', accent: 'violet' } })

  useEffect(() => {
    void window.uhub.store.get('profile').then((p) => p && setProfile(p))
  }, [])

  const selected = settings.modules.filter((m) => m.visible).map((m) => m.id)
  const hasConnections = selected.some((m) => m === 'media' || m === 'library' || m === 'radar')
  const steps = useMemo<StepId[]>(
    () => ['welcome', 'profile', 'modules', 'look', ...(hasConnections ? (['connections'] as const) : []), 'daily', 'done'],
    [hasConnections]
  )
  const i = Math.max(0, steps.indexOf(step))
  const go = (to: number): void => {
    setDir(to > i ? 1 : -1)
    setStep(steps[Math.max(0, Math.min(steps.length - 1, to))])
  }

  const finish = async (): Promise<void> => {
    const name = profile.name.trim()
    // Coming from "Já tenho conta" the profile already arrived with the synced settings.
    if (name || !(await window.uhub.store.get('profile'))) await window.uhub.store.set('profile', name ? { ...profile, name } : null)
    await window.uhub.store.set('onboarded', true)
    onFinish(selected[0] ?? 'performance')
  }

  return (
    <div className="hub-backdrop fixed inset-0 z-[60] flex flex-col overflow-hidden">
      {/* Title bar area stays draggable; the traffic lights sit on the left on macOS. */}
      <header className={`drag flex h-12 shrink-0 items-center gap-4 ${isMac ? 'pl-[84px]' : 'pl-5'} pr-5`}>
        <img src={logo} alt="" className="size-5" />
        <span className="font-mono text-[12px] font-semibold tracking-[0.25em] text-zinc-100">U-HUB</span>
        {step !== 'welcome' && step !== 'login' && step !== 'done' && (
          <nav className="no-drag mx-auto flex items-center gap-1">
            {steps.slice(1, -1).map((s, n) => {
              const M = STEP_META[s]
              const idx = n + 1
              const state = idx < i ? 'done' : idx === i ? 'current' : 'todo'
              return (
                <button
                  key={s}
                  disabled={idx > i}
                  onClick={() => go(idx)}
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] tracking-wider transition-all ${
                    state === 'current' ? 'bg-volt/20 text-volt-100' : state === 'done' ? 'text-zinc-300 hover:text-white' : 'text-zinc-600'
                  }`}
                >
                  {state === 'done' ? <Check className="size-3 text-acid" /> : <M.icon className="size-3" />}
                  {M.label.toUpperCase()}
                </button>
              )
            })}
          </nav>
        )}
        {step !== 'done' && (
          <button className="no-drag ml-auto font-mono text-[11px] text-zinc-500 transition-colors hover:text-zinc-200" onClick={() => void finish()}>
            Pular apresentação
          </button>
        )}
      </header>

      <main className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-8 pb-6">
        <div key={step} className={`w-full max-w-4xl ${dir === 1 ? 'animate-[slide-in_420ms_var(--ease-snap)_both]' : 'animate-[slide-back_420ms_var(--ease-snap)_both]'}`}>
          {step === 'welcome' && <Welcome onStart={() => go(1)} onLogin={() => setStep('login')} />}
          {step === 'login' && <LoginStep onBack={() => setStep('welcome')} onDone={() => void finish()} />}
          {step === 'profile' && <ProfileStep profile={profile} setProfile={setProfile} />}
          {step === 'modules' && <ModulesStep />}
          {step === 'look' && <LookStep />}
          {step === 'connections' && <ConnectionsStep selected={selected} />}
          {step === 'daily' && <DailyStep />}
          {step === 'done' && <DoneStep profile={profile} selected={selected} onEnter={() => void finish()} />}
        </div>
      </main>

      {step !== 'welcome' && step !== 'login' && step !== 'done' && (
        <footer className="flex h-16 shrink-0 items-center justify-between border-t border-white/[0.05] px-8">
          <button className="btn" onClick={() => go(i - 1)}>
            <ArrowLeft className="size-3.5" /> Voltar
          </button>
          <span className="font-mono text-[10px] text-zinc-600">
            {i} / {steps.length - 2}
          </span>
          <button className="btn btn-volt h-9 px-4" disabled={step === 'modules' && selected.length === 0} onClick={() => go(i + 1)}>
            {steps[i + 1] === 'done' ? 'Concluir' : 'Continuar'} <ArrowRight className="size-3.5" />
          </button>
        </footer>
      )}

      <style>{`
        @keyframes slide-in { from { opacity: 0; transform: translateX(28px); } to { opacity: 1; transform: none; } }
        @keyframes slide-back { from { opacity: 0; transform: translateX(-28px); } to { opacity: 1; transform: none; } }
        @keyframes orbit { to { transform: rotate(360deg); } }
        @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
      `}</style>
    </div>
  )
}

/** Shared two-column step: copy on the left, interactive content on the right. */
function Step({ eyebrow, title, text, children, aside, footer }: { eyebrow: string; title: string; text: string; children: ReactNode; aside?: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)] items-start gap-10">
      <div className="pt-4">
        <div className="eyebrow mb-2 text-volt-soft">{eyebrow}</div>
        <h2 className="text-[30px] leading-tight font-semibold tracking-tight text-zinc-50">{title}</h2>
        <p className="mt-3 text-[14px] leading-relaxed text-zinc-400">{text}</p>
        {aside && <div className="mt-6">{aside}</div>}
        {footer}
      </div>
      <div>{children}</div>
    </div>
  )
}

// ── Steps ────────────────────────────────────────────────────────────────────

function Welcome({ onStart, onLogin }: { onStart: () => void; onLogin: () => void }) {
  const icons = (Object.keys(MODULES) as ModuleId[]).map((id) => MODULES[id].icon)
  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative mb-10 grid size-56 place-items-center">
        {/* Module icons orbiting the logo */}
        <div className="absolute inset-0 animate-[orbit_40s_linear_infinite]">
          {icons.map((I, n) => {
            const a = (n / icons.length) * Math.PI * 2
            return (
              <span
                key={n}
                className="absolute grid size-10 place-items-center rounded-full border border-white/10 bg-raised/80 text-volt-soft shadow-[0_0_20px_-6px_var(--color-volt)]"
                style={{ left: `calc(50% + ${Math.cos(a) * 104}px - 20px)`, top: `calc(50% + ${Math.sin(a) * 104}px - 20px)` }}
              >
                <I className="size-4" />
              </span>
            )
          })}
        </div>
        <div className="absolute inset-10 rounded-full bg-volt/20 blur-3xl" />
        <img src={logo} alt="" className="relative size-28 animate-[float_5s_ease-in-out_infinite] drop-shadow-[0_0_30px_color-mix(in_srgb,var(--color-volt)_60%,transparent)]" />
      </div>
      <div className="eyebrow mb-3 text-volt-soft">Nerd &amp; Gamer Command Center</div>
      <h1 className="text-[44px] leading-none font-semibold tracking-tight text-zinc-50">Bem-vindo ao U-Hub</h1>
      <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-zinc-400">
        Seu PC, seus jogos, sua música e suas senhas de jogo num só lugar. Vamos deixar tudo do seu jeito — leva menos de um minuto.
      </p>
      <button className="btn btn-volt mt-8 h-11 px-6 text-[14px]" onClick={onStart}>
        Começar <ArrowRight className="size-4" />
      </button>
      <button className="mt-4 text-[13px] text-zinc-500 transition-colors hover:text-zinc-200" onClick={onLogin}>
        Já tenho uma conta U-Hub
      </button>
    </div>
  )
}

/** "Já tenho conta": sign in, let the cloud settings arrive, then skip the rest of the tour. */
function LoginStep({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const social = useSocial()
  const [sync, setSync] = useState<string>('off')
  useEffect(() => {
    void window.uhub.sync.status().then((s) => setSync(s.state))
    return window.uhub.sync.onUpdate((s) => setSync(s.state))
  }, [])
  useEffect(() => {
    if (social?.signedIn && (sync === 'synced' || sync === 'error')) onDone()
  }, [social?.signedIn, sync, onDone])

  return (
    <div className="mx-auto max-w-md">
      <button className="mb-6 flex items-center gap-1.5 text-[12px] text-zinc-500 hover:text-zinc-200" onClick={onBack}>
        <ArrowLeft className="size-3.5" /> Voltar
      </button>
      <h2 className="text-[28px] font-semibold tracking-tight text-zinc-50">Bem-vindo de volta</h2>
      <p className="mt-2 mb-6 text-[14px] text-zinc-400">Entre na sua conta e suas configurações voltam sozinhas: módulos, cores, atalhos, quests e mais.</p>
      {social?.signedIn ? (
        <div className="flex items-center gap-2 text-[13px] text-zinc-300">
          <Loader2 className="size-4 animate-spin" /> Trazendo suas configurações…
        </div>
      ) : (
        <AccountCard compact />
      )}
    </div>
  )
}

function ProfileStep({ profile, setProfile }: { profile: Profile; setProfile: Dispatch<SetStateAction<Profile>> }) {
  const Icon = iconFor(profile.avatar.icon)
  const social = useSocial()
  const [accountOpen, setAccountOpen] = useState(false)
  useEffect(() => {
    if (social?.signedIn) setAccountOpen(false)
  }, [social?.signedIn])
  const setAvatar = (patch: Partial<Profile['avatar']>): void => setProfile((p) => ({ ...p, avatar: { ...p.avatar, ...patch } }))
  return (
    <Step
      eyebrow="Perfil · opcional"
      title="Como podemos te chamar?"
      text="Seu apelido e avatar aparecem no topo do app. Mais pra frente, é com ele que seus amigos vão te encontrar no U-Hub."
      aside={
        <div className="flex items-center gap-3">
          <span className={`grid size-14 place-items-center rounded-full border-2 ${ACCENTS[profile.avatar.accent].tone}`}>
            <Icon className="size-6" />
          </span>
          <div>
            <div className="text-[16px] font-semibold text-zinc-100">{profile.name.trim() || 'Seu apelido'}</div>
            <div className="font-mono text-[10px] text-zinc-500">prévia</div>
          </div>
        </div>
      }
      footer={
        social?.configured && (
          <div className="mt-6 rounded-[4px] border border-white/[0.06] bg-black/20 p-4">
            {social.signedIn ? (
              <div className="flex items-center gap-2 text-[13px] text-acid-soft">
                <Check className="size-4" /> Conta conectada — suas configurações vão ficar salvas na nuvem.
              </div>
            ) : (
              <>
                <div className="text-[13px] font-medium text-zinc-200">Conta U-Hub (opcional)</div>
                <p className="mt-1 text-[12px] text-zinc-500">Salve suas configurações na nuvem e adicione amigos. Senhas do Vault ficam só no seu computador.</p>
                <button className="btn mt-3" onClick={() => setAccountOpen(true)}>
                  <UserRound className="size-3.5" /> Criar conta ou entrar
                </button>
              </>
            )}
            {accountOpen && (
              <Modal title="Conta U-Hub" onClose={() => setAccountOpen(false)}>
                <AccountCard compact />
              </Modal>
            )}
          </div>
        )
      }
    >
      <div className="panel space-y-4 p-5">
        <label className="block">
          <span className="eyebrow">Apelido</span>
          <input
            autoFocus
            className="field mt-1.5 h-11 text-[15px]"
            maxLength={24}
            placeholder="Ex: Lucas, xX_Sniper_Xx…"
            value={profile.name}
            onChange={(e) => {
              const name = e.target.value
              setProfile((p) => ({ ...p, name }))
            }}
          />
        </label>
        <div>
          <span className="eyebrow">Avatar</span>
          <div className="mt-1.5">
            <IconPicker value={profile.avatar.icon} onChange={(icon) => setAvatar({ icon })} />
          </div>
        </div>
        <div>
          <span className="eyebrow">Cor</span>
          <div className="mt-1.5">
            <AccentPicker value={profile.avatar.accent} onChange={(accent: Accent) => setAvatar({ accent })} />
          </div>
        </div>
      </div>
    </Step>
  )
}

function ModulesStep() {
  const { settings, update } = useSettings()
  const toggle = (id: ModuleId): void => update({ modules: settings.modules.map((m) => (m.id === id ? { ...m, visible: !m.visible } : m)) })
  const count = settings.modules.filter((m) => m.visible).length
  return (
    <Step
      eyebrow="Módulos"
      title="O que você quer no seu U-Hub?"
      text="Escolha os módulos que fazem sentido pra você. Só eles aparecem na barra lateral — dá para mudar quando quiser em Configurações."
      aside={<div className="font-mono text-[11px] text-zinc-500">{count === 0 ? 'Escolha pelo menos um módulo.' : `${count} de ${settings.modules.length} selecionados`}</div>}
    >
      <div className="grid grid-cols-2 gap-3">
        {settings.modules.map(({ id, visible }) => {
          const M = MODULES[id]
          return (
            <button
              key={id}
              onClick={() => toggle(id)}
              className={`group relative rounded-[6px] border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 ${
                visible ? 'border-volt/50 bg-volt/[0.09] shadow-[0_10px_30px_-16px_var(--color-volt)]' : 'border-white/[0.07] bg-white/[0.02] hover:border-white/15'
              }`}
            >
              <span className={`absolute top-3 right-3 grid size-5 place-items-center rounded-full border transition-colors ${visible ? 'border-volt bg-volt text-white' : 'border-white/20'}`}>
                {visible && <Check className="size-3" strokeWidth={3} />}
              </span>
              <M.icon className={`mb-3 size-6 transition-colors ${visible ? 'text-volt-soft' : 'text-zinc-500'}`} strokeWidth={1.6} />
              <div className="text-[14px] font-semibold text-zinc-100">{M.label}</div>
              <div className="mt-1 text-[12px] leading-snug text-zinc-500">{MODULE_PITCH[id]}</div>
            </button>
          )
        })}
      </div>
    </Step>
  )
}

function LookStep() {
  const { settings, update } = useSettings()
  return (
    <Step eyebrow="Visual" title="Escolha sua cor" text="A cor de destaque aparece em botões, indicadores, gráficos e no visualizador da rádio. Muda na hora — experimente.">
      <div className="panel p-5">
        <div className="grid grid-cols-3 gap-3">
          {(Object.keys(THEME) as ThemeAccent[]).map((a) => {
            const active = settings.accent === a
            return (
              <button
                key={a}
                onClick={() => update({ accent: a })}
                className={`flex items-center gap-3 rounded-[5px] border p-3 transition-all ${active ? 'border-white/30 bg-white/[0.06]' : 'border-white/[0.06] hover:border-white/15'}`}
              >
                <span className="grid size-8 place-items-center rounded-full" style={{ background: THEME[a][500], boxShadow: active ? `0 0 18px ${THEME[a][500]}` : undefined }}>
                  {active && <Check className="size-4 text-white" strokeWidth={3} />}
                </span>
                <span className="text-[13px] text-zinc-200">{THEME[a].label}</span>
              </button>
            )
          })}
        </div>
        {/* Live sample of accent-coloured UI */}
        <div className="mt-5 rounded-[4px] border border-white/[0.06] bg-black/30 p-4">
          <div className="eyebrow mb-3">Prévia</div>
          <div className="flex items-center gap-3">
            <button className="btn btn-volt">Botão principal</button>
            <Switch checked onChange={() => undefined} label="Exemplo" />
            <div className="h-1.5 flex-1 rounded-full bg-white/10">
              <div className="h-full w-2/3 rounded-full bg-volt shadow-[0_0_10px_var(--color-volt)]" />
            </div>
          </div>
        </div>
      </div>
    </Step>
  )
}

function Row({ icon, title, text, children }: { icon: ReactNode; title: string; text: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-4 py-3.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-[4px] border border-volt/25 bg-volt/10 text-volt-soft [&_svg]:size-4">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-zinc-100">{title}</div>
        <div className="text-[11px] leading-snug text-zinc-500">{text}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function ConnectionsStep({ selected }: { selected: ModuleId[] }) {
  const { settings, update } = useSettings()
  const [spotify, setSpotify] = useState<SpotifyStatus | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [spotifyError, setSpotifyError] = useState<string | null>(null)
  const [lib, setLib] = useState<LibrarySnapshot | null>(null)
  const [country, setCountry] = useState('BR')

  useEffect(() => {
    void window.uhub.spotify.status().then(setSpotify)
    void window.uhub.library.get().then(setLib)
    void window.uhub.app.info().then((i) => setCountry(i.localeCountry))
  }, [])

  const connect = async (): Promise<void> => {
    setConnecting(true)
    setSpotifyError(null)
    const r = await window.uhub.spotify.login()
    setConnecting(false)
    if (!r.ok) setSpotifyError(r.error)
    setSpotify(await window.uhub.spotify.status())
  }

  return (
    <Step
      eyebrow="Conexões"
      title="Conecte o que você usa"
      text="Tudo aqui é opcional e pode ser feito depois. Nada sai do seu computador sem você pedir: o login do Spotify acontece no navegador e o U-Hub nunca vê sua senha."
    >
      <div className="panel divide-y divide-white/[0.05] px-5 py-1">
        {selected.includes('media') && (
          <Row icon={<ListMusic />} title="Spotify" text={spotify?.connected ? `Conectado como ${spotify.user?.name ?? '—'}.` : spotifyError ?? 'Controle o Spotify (play, faixas, playlists) direto do U-Hub. Comandos exigem Premium.'}>
            {spotify?.connected ? (
              <span className="flex items-center gap-1.5 font-mono text-[11px] text-acid-soft">
                <Check className="size-3.5" /> Conectado
              </span>
            ) : spotify?.clientId || spotify?.hasBuiltInClientId ? (
              <button className="btn !border-acid/40 !text-emerald-200 hover:!bg-acid/15" disabled={connecting} onClick={connect}>
                {connecting ? <Loader2 className="size-3.5 animate-spin" /> : null} {connecting ? 'Aguardando o navegador…' : 'Conectar Spotify'}
              </button>
            ) : (
              <span className="font-mono text-[10px] whitespace-nowrap text-zinc-500">Depois, em Media</span>
            )}
          </Row>
        )}
        <Row icon={<MessageSquare />} title="Status no Discord" text="Mostra no seu perfil do Discord o jogo aberto ou a rádio tocando.">
          <Switch checked={settings.discord.enabled} onChange={(enabled) => update({ discord: { ...settings.discord, enabled } })} label="Status no Discord" />
        </Row>
        {selected.includes('library') && (
          <Row
            icon={<LibraryBig />}
            title="Biblioteca de jogos"
            text={
              !lib
                ? 'Procurando jogos…'
                : lib.games.length
                  ? `${lib.games.length} jogos encontrados${[lib.sources.steam && 'Steam', lib.sources.epic && 'Epic'].filter(Boolean).length ? ` (${[lib.sources.steam && 'Steam', lib.sources.epic && 'Epic'].filter(Boolean).join(' + ')})` : ''}.`
                  : 'Nenhuma Steam/Epic encontrada — adicione jogos manualmente na Biblioteca.'
            }
          >
            <span className="font-mono text-[11px] text-zinc-500">{lib ? <Check className="size-4 text-acid" /> : <Loader2 className="size-4 animate-spin" />}</span>
          </Row>
        )}
        {selected.includes('radar') && (
          <Row icon={<Store />} title="Região das lojas" text="Moeda dos preços de promoções e da lista de desejos.">
            <select className="field h-8 w-56 cursor-pointer" value={settings.storeCountry} onChange={(e) => update({ storeCountry: e.target.value })}>
              <option value="auto">Automático ({REGIONS[country] ?? country})</option>
              {Object.entries(REGIONS).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </Row>
        )}
      </div>
    </Step>
  )
}

function DailyStep() {
  const { settings, update } = useSettings()
  const [canLogin, setCanLogin] = useState(false)
  useEffect(() => {
    void window.uhub.app.info().then((i) => setCanLogin(i.canOpenAtLogin))
  }, [])
  const n = settings.notifications
  const notifOn = n.system.free || n.system.price || n.system.patch
  const sc = settings.shortcuts

  return (
    <Step
      eyebrow="Dia a dia"
      title="Sempre à mão"
      text="O U-Hub pode ficar quietinho na barra de menus, com o player e atalhos para tudo, sem ocupar espaço na tela."
      aside={
        <div className="space-y-2">
          <div className="eyebrow flex items-center gap-1.5">
            <Keyboard className="size-3" /> Atalhos globais
          </div>
          {(
            [
              ['Mostrar / esconder', sc.toggleWindow],
              ['Tocar / pausar', sc.mediaPlayPause],
              ['Próxima', sc.mediaNext]
            ] as const
          ).map(([label, accel]) =>
            accel ? (
              <div key={label} className="flex items-center justify-between gap-3 text-[12px] text-zinc-400">
                {label} <Keys accel={accel} />
              </div>
            ) : null
          )}
        </div>
      }
    >
      <div className="panel divide-y divide-white/[0.05] px-5 py-1">
        <Row
          icon={<PanelTop />}
          title={isMac ? 'Manter na barra de menus' : 'Manter na bandeja'}
          text="Fechar a janela deixa o U-Hub rodando, com player e menu no ícone."
        >
          <Switch checked={settings.closeToTray} onChange={(closeToTray) => update({ closeToTray })} label="Manter na barra de menus" />
        </Row>
        <Row icon={<Power />} title="Abrir com o sistema" text={canLogin ? 'Inicia junto com o computador.' : 'Disponível no app instalado.'}>
          <Switch checked={settings.openAtLogin} disabled={!canLogin} onChange={(openAtLogin) => update({ openAtLogin })} label="Abrir com o sistema" />
        </Row>
        <Row icon={<Bell />} title="Notificações" text="Jogos grátis, alertas de preço e patches dos seus jogos.">
          <Switch
            checked={notifOn}
            onChange={(on) => update({ notifications: { ...n, system: { ...n.system, free: on, price: on, patch: on } } })}
            label="Notificações"
          />
        </Row>
      </div>
    </Step>
  )
}

function DoneStep({ profile, selected, onEnter }: { profile: Profile; selected: ModuleId[]; onEnter: () => void }) {
  const { settings } = useSettings()
  const Icon = iconFor(profile.avatar.icon)
  const name = profile.name.trim()
  return (
    <div className="flex flex-col items-center text-center">
      <span className={`mb-6 grid size-20 place-items-center rounded-full border-2 ${ACCENTS[profile.avatar.accent].tone} shadow-[0_0_40px_-8px_var(--color-volt)]`}>
        {name ? <Icon className="size-9" /> : <Sparkles className="size-9" />}
      </span>
      <h1 className="text-[38px] leading-none font-semibold tracking-tight text-zinc-50">{name ? `Tudo pronto, ${name}!` : 'Tudo pronto!'}</h1>
      <p className="mt-3 text-[14px] text-zinc-400">Seu U-Hub está configurado. Tudo isso pode ser mudado em Configurações (⚙ no topo).</p>
      <div className="mt-8 flex max-w-2xl flex-wrap justify-center gap-2">
        {selected.map((id) => {
          const M = MODULES[id]
          return (
            <span key={id} className="flex items-center gap-1.5 rounded-full border border-volt/30 bg-volt/10 px-3 py-1.5 text-[12px] text-volt-100">
              <M.icon className="size-3.5" /> {M.label}
            </span>
          )
        })}
      </div>
      <div className="mt-4 flex flex-wrap justify-center gap-4 font-mono text-[11px] text-zinc-500">
        <span>Cor: {THEME[settings.accent].label}</span>
        <span>Discord: {settings.discord.enabled ? 'ligado' : 'desligado'}</span>
        <span>{isMac ? 'Barra de menus' : 'Bandeja'}: {settings.closeToTray ? 'sim' : 'não'}</span>
      </div>
      <button className="btn btn-volt mt-10 h-11 px-6 text-[14px]" onClick={onEnter}>
        Entrar no U-Hub <ArrowRight className="size-4" />
      </button>
    </div>
  )
}
