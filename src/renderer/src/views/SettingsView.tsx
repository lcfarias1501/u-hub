import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Archive,
  Cloud,
  Bell,
  Keyboard,
  MessageSquare,
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ExternalLink,
  FolderOpen,
  GripVertical,
  LayoutGrid,
  Loader2,
  Palette,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  TriangleAlert,
  UserRound,
  Wand2
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { AppInfo, AppSettings, BackupSummary, ModuleId, NotificationKind, SpotifyStatus, ThemeAccent } from '@shared/types'
import { Segmented, SettingRow, Switch } from '@renderer/components/Controls'
import { Field } from '@renderer/components/Modal'
import { Panel } from '@renderer/components/Panel'
import { AccentPicker, IconPicker } from '@renderer/components/Pickers'
import { ACCENTS } from '@renderer/lib/accents'
import { iconFor } from '@renderer/lib/icons'
import { usePersistentState } from '@renderer/hooks/usePersistentState'
import { WhatsNew } from '@renderer/components/WhatsNew'
import { MODULES } from '@renderer/components/nav'
import logo from '@renderer/assets/logo.png'
import { MOD_LABEL } from '@renderer/hooks/useHotkeys'
import { CHANGELOG } from '@renderer/lib/changelog'
import { REGIONS } from '@renderer/lib/regions'
import { useSettings } from '@renderer/lib/settings'
import { THEME } from '@renderer/lib/theme'
import { PageHeader } from './PageHeader'
import { AccountSection } from './settings/AccountSection'
import { DiscordSection, ShortcutsSection } from './settings/ShortcutsDiscord'

const SECTIONS = [
  { id: 'account', label: 'Conta', icon: Cloud },
  { id: 'profile', label: 'Perfil', icon: UserRound },
  { id: 'modules', label: 'Módulos', icon: LayoutGrid },
  { id: 'general', label: 'Geral', icon: SlidersHorizontal },
  { id: 'appearance', label: 'Aparência', icon: Palette },
  { id: 'notifications', label: 'Notificações', icon: Bell },
  { id: 'shortcuts', label: 'Atalhos', icon: Keyboard },
  { id: 'discord', label: 'Discord', icon: MessageSquare },
  { id: 'data', label: 'Dados & Sobre', icon: Archive }
] as const

export function SettingsView() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [section, setSection] = useState<string>('modules')
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void window.uhub.app.info().then(setInfo)
  }, [])

  // Highlight the section currently in view in the side index.
  useEffect(() => {
    const root = scroller.current?.closest('main')
    if (!root) return
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (top) setSection(top.target.id)
      },
      { root, rootMargin: '0px 0px -60% 0px' }
    )
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id)
      if (el) io.observe(el)
    })
    return () => io.disconnect()
  }, [])

  return (
    <div ref={scroller} className="animate-rise p-6">
      <PageHeader index="⚙" title="Configurações" subtitle="Preferências do U-Hub" />
      <div className="grid grid-cols-[180px_minmax(0,1fr)] gap-6">
        <nav className="sticky top-6 h-fit space-y-0.5">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className={`flex w-full items-center gap-2.5 rounded-[3px] border-l-2 px-3 py-2 text-left text-[13px] transition-all duration-150 ${
                section === s.id ? 'border-volt bg-volt/10 text-zinc-50' : 'border-transparent text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-200'
              }`}
            >
              <s.icon className="size-3.5" /> {s.label}
            </button>
          ))}
        </nav>

        <div className="max-w-3xl space-y-5 pb-24">
          <AccountSection />
          <ProfileSection />
          <ModulesSection />
          <GeneralSection info={info} />
          <AppearanceSection />
          <NotificationsSection />
          <ShortcutsSection />
          <DiscordSection />
          <DataSection info={info} />
        </div>
      </div>
    </div>
  )
}

function Section({ id, title, icon, children }: { id: string; title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div id={id} className="scroll-mt-6">
      <Panel title={title} icon={icon} hover={false} bodyClassName="divide-y divide-white/[0.05] px-4 py-2">
        {children}
      </Panel>
    </div>
  )
}

// ── Profile ──────────────────────────────────────────────────────────────────

function ProfileSection() {
  const [profile, setProfile] = usePersistentState('profile', null)
  const p = profile ?? { name: '', avatar: { icon: 'gamepad', accent: 'violet' as const } }
  const Icon = iconFor(p.avatar.icon)
  const save = (next: typeof p): void => setProfile(next.name.trim() ? next : { ...next, name: '' })
  return (
    <Section id="profile" title="Perfil" icon={<UserRound />}>
      <div className="flex items-start gap-5 py-4">
        <span className={`grid size-16 shrink-0 place-items-center rounded-full border-2 ${ACCENTS[p.avatar.accent].tone}`}>
          <Icon className="size-7" />
        </span>
        <div className="min-w-0 flex-1 space-y-3">
          <input className="field h-10 max-w-xs text-[14px]" maxLength={24} placeholder="Seu apelido" value={p.name} onChange={(e) => save({ ...p, name: e.target.value })} />
          <IconPicker value={p.avatar.icon} onChange={(icon) => save({ ...p, avatar: { ...p.avatar, icon } })} />
          <AccentPicker value={p.avatar.accent} onChange={(accent) => save({ ...p, avatar: { ...p.avatar, accent } })} />
        </div>
      </div>
      <SettingRow title="Apresentação do U-Hub" description="Mostra de novo o passo a passo inicial (módulos, visual, conexões).">
        <button className="btn" onClick={() => void window.uhub.store.set('onboarded', false)}>
          <Wand2 className="size-3.5" /> Refazer apresentação
        </button>
      </SettingRow>
    </Section>
  )
}

// ── Modules ──────────────────────────────────────────────────────────────────

function ModulesSection() {
  const { settings, update } = useSettings()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const list = settings.modules
  const visibleCount = list.filter((m) => m.visible).length

  const onDragEnd = ({ active, over }: DragEndEvent): void => {
    if (!over || active.id === over.id) return
    update({ modules: arrayMove(list, list.findIndex((m) => m.id === active.id), list.findIndex((m) => m.id === over.id)) })
  }

  // Shortcut digit follows the position among *visible* modules, like the sidebar.
  let shortcut = 0
  return (
    <Section id="modules" title="Módulos" icon={<LayoutGrid />}>
      <p className="py-3 text-[12px] text-zinc-500">
        Escolha o que aparece na barra lateral e arraste para mudar a ordem. Os atalhos {MOD_LABEL}1, {MOD_LABEL}2… seguem essa ordem.
      </p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={list.map((m) => m.id)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-1 py-3">
            {list.map((m) => (
              <ModuleRow
                key={m.id}
                id={m.id}
                visible={m.visible}
                shortcut={m.visible ? ++shortcut : null}
                locked={m.visible && visibleCount === 1}
                onToggle={(visible) => update({ modules: list.map((x) => (x.id === m.id ? { ...x, visible } : x)) })}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </Section>
  )
}

function ModuleRow({ id, visible, shortcut, locked, onToggle }: { id: ModuleId; visible: boolean; shortcut: number | null; locked: boolean; onToggle: (v: boolean) => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id })
  const m = MODULES[id]
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`flex h-12 items-center gap-3 rounded-[3px] border px-3 transition-colors ${
        isDragging ? 'z-10 border-volt/50 bg-raised' : 'border-white/[0.05] bg-black/20'
      } ${visible ? '' : 'opacity-55'}`}
    >
      <button ref={setActivatorNodeRef} {...attributes} {...listeners} className="cursor-grab text-zinc-600 hover:text-zinc-300 active:cursor-grabbing" aria-label="Arrastar">
        <GripVertical className="size-4" />
      </button>
      <m.icon className={`size-4 ${visible ? 'text-volt-soft' : 'text-zinc-600'}`} strokeWidth={1.75} />
      <span className="flex-1 text-[13px] text-zinc-200">{m.label}</span>
      {shortcut != null && shortcut <= 9 && (
        <span className="flex gap-0.5">
          <kbd className="kbd">{MOD_LABEL}</kbd>
          <kbd className="kbd">{shortcut}</kbd>
        </span>
      )}
      <span title={locked ? 'Pelo menos um módulo precisa ficar visível' : undefined}>
        <Switch checked={visible} disabled={locked} onChange={onToggle} label={`Mostrar ${m.label}`} />
      </span>
    </li>
  )
}

// ── General ──────────────────────────────────────────────────────────────────

function GeneralSection({ info }: { info: AppInfo | null }) {
  const { settings, update, modules } = useSettings()
  const mac = info?.platform === 'darwin'
  const loginNote = !info ? undefined : !info.isPackaged ? 'Disponível só no app instalado (não no modo dev).' : !info.canOpenAtLogin ? 'Não suportado neste sistema.' : undefined

  return (
    <Section id="general" title="Geral" icon={<SlidersHorizontal />}>
      <SettingRow title="Abrir com o sistema" description={loginNote ?? 'Inicia o U-Hub quando você faz login no computador.'}>
        <Switch checked={settings.openAtLogin} disabled={!info?.canOpenAtLogin} onChange={(openAtLogin) => update({ openAtLogin })} label="Abrir com o sistema" />
      </SettingRow>
      <SettingRow
        title="Iniciar minimizado"
        description={settings.closeToTray ? `Abre direto na ${mac ? 'barra de menus' : 'bandeja'}, sem mostrar a janela.` : 'Abre com a janela minimizada.'}
      >
        <Switch checked={settings.startMinimized} onChange={(startMinimized) => update({ startMinimized })} label="Iniciar minimizado" />
      </SettingRow>
      <SettingRow
        title={mac ? 'Manter na barra de menus ao fechar' : 'Minimizar para a bandeja ao fechar'}
        description={`Fechar a janela deixa o U-Hub rodando com um ícone ${mac ? 'na barra de menus' : 'na bandeja'}. Para sair de vez, use “Sair” no menu do ícone${mac ? ' ou ⌘Q' : ''}.`}
      >
        <Switch checked={settings.closeToTray} onChange={(closeToTray) => update({ closeToTray })} label="Fechar para a bandeja" />
      </SettingRow>
      <SettingRow title="Região das lojas" description="Define a moeda e os preços em Ofertas (Steam e Epic).">
        <select className="field h-8 w-48 cursor-pointer" value={settings.storeCountry} onChange={(e) => update({ storeCountry: e.target.value })}>
          <option value="auto">Automático{info ? ` (${REGIONS[info.localeCountry] ?? info.localeCountry})` : ''}</option>
          {Object.entries(REGIONS).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
      </SettingRow>
      <SettingRow title="Aba inicial" description="Qual módulo abre quando o U-Hub inicia.">
        <select
          className="field h-8 w-48 cursor-pointer"
          value={settings.startView}
          onChange={(e) => update({ startView: e.target.value as AppSettings['startView'] })}
        >
          <option value="last">Última aberta</option>
          {modules.map((id) => (
            <option key={id} value={id}>
              {MODULES[id].label}
            </option>
          ))}
        </select>
      </SettingRow>
    </Section>
  )
}

// ── Appearance ───────────────────────────────────────────────────────────────

function AppearanceSection() {
  const { settings, update } = useSettings()
  return (
    <Section id="appearance" title="Aparência" icon={<Palette />}>
      <SettingRow title="Cor de destaque" description="Usada em botões, indicadores, gráficos e no visualizador.">
        <div className="flex gap-2">
          {(Object.keys(THEME) as ThemeAccent[]).map((a) => (
            <button
              key={a}
              onClick={() => update({ accent: a })}
              title={THEME[a].label}
              aria-label={THEME[a].label}
              className={`grid size-7 place-items-center rounded-full transition-all duration-200 hover:scale-110 ${
                settings.accent === a ? 'ring-2 ring-white/80 ring-offset-2 ring-offset-base' : 'opacity-70 hover:opacity-100'
              }`}
              style={{ background: THEME[a][500], boxShadow: settings.accent === a ? `0 0 16px ${THEME[a][500]}` : undefined }}
            >
              {settings.accent === a && <Check className="size-3.5 text-white" strokeWidth={3} />}
            </button>
          ))}
        </div>
      </SettingRow>
      <SettingRow title="Escala da interface" description="Aumenta ou reduz tudo, útil em telas grandes ou pequenas.">
        <Segmented
          value={settings.zoom}
          onChange={(zoom) => update({ zoom })}
          options={[
            { value: 0.9, label: '90%' },
            { value: 1, label: '100%' },
            { value: 1.1, label: '110%' },
            { value: 1.25, label: '125%' }
          ]}
        />
      </SettingRow>
      <SettingRow title="Barra lateral ao iniciar" description={`${MOD_LABEL}B continua alternando durante o uso.`}>
        <Segmented
          value={settings.sidebarMode}
          onChange={(sidebarMode) => update({ sidebarMode })}
          options={[
            { value: 'remember', label: 'Lembrar' },
            { value: 'expanded', label: 'Expandida' },
            { value: 'collapsed', label: 'Recolhida' }
          ]}
        />
      </SettingRow>
      <SettingRow title="Reduzir animações" description="Desliga transições e efeitos de movimento.">
        <Switch checked={settings.reduceMotion} onChange={(reduceMotion) => update({ reduceMotion })} label="Reduzir animações" />
      </SettingRow>
    </Section>
  )
}

// ── Notifications ────────────────────────────────────────────────────────────

const KINDS: { kind: NotificationKind; title: string; description: string }[] = [
  { kind: 'free', title: 'Jogos grátis', description: 'Quando a Epic libera um jogo grátis novo.' },
  { kind: 'price', title: 'Alertas de preço', description: 'Quando um jogo da lista de desejos entra em promoção ou chega no seu preço.' },
  { kind: 'patch', title: 'Patches', description: 'Notas de atualização dos jogos da Steam que você jogou nos últimos 30 dias.' },
  { kind: 'mail', title: 'E-mail', description: 'E-mails novos (por conta: todos, só das categorias que notificam, ou nenhum).' },
  { kind: 'social', title: 'Amigos', description: 'Pedidos de amizade, novas amizades e quando um amigo começa a jogar.' },
  { kind: 'game', title: 'Resumo de sessão', description: 'Quanto tempo você jogou, quando fecha um jogo (sessões de 10 min ou mais).' }
]

function NotificationsSection() {
  const { settings, update } = useSettings()
  const n = settings.notifications
  const set = (patch: Partial<typeof n>): void => update({ notifications: { ...n, ...patch } })
  return (
    <Section id="notifications" title="Notificações" icon={<Bell />}>
      <p className="py-3 text-[12px] text-zinc-500">Tudo fica registrado no sino do topo. Aqui você escolhe o que também aparece como notificação do sistema.</p>
      {KINDS.map((k) => (
        <SettingRow key={k.kind} title={k.title} description={k.description}>
          <Switch checked={n.system[k.kind]} onChange={(v) => set({ system: { ...n.system, [k.kind]: v } })} label={k.title} />
        </SettingRow>
      ))}
      <SettingRow title="Não perturbe enquanto joga" description="Segura as notificações do sistema enquanto um jogo da Biblioteca estiver aberto. Elas continuam no sino.">
        <Switch checked={n.quietWhilePlaying} onChange={(quietWhilePlaying) => set({ quietWhilePlaying })} label="Não perturbe enquanto joga" />
      </SettingRow>
      <SettingRow title="Som" description="Toca o som padrão do sistema com cada notificação.">
        <Switch checked={n.sound} onChange={(sound) => set({ sound })} label="Som das notificações" />
      </SettingRow>
      <SettingRow title="Contador no ícone do app" description="Mostra o número de não lidas no ícone do Dock / barra de tarefas.">
        <Switch checked={n.badge} onChange={(badge) => set({ badge })} label="Contador no ícone" />
      </SettingRow>
    </Section>
  )
}

// ── Data & About ─────────────────────────────────────────────────────────────

function DataSection({ info }: { info: AppInfo | null }) {
  return (
    <Section id="data" title="Dados & Sobre" icon={<Archive />}>
      <About info={info} />
      <SpotifyAccount />
      <BackupExport />
      <BackupImport />
      <SettingRow
        title="Pasta de dados"
        description={<code className="font-mono text-[10px] break-all text-zinc-600 select-text">{info?.userDataPath ?? '…'}</code>}
      >
        <button className="btn" onClick={() => void window.uhub.app.openDataFolder()}>
          <FolderOpen className="size-3.5" /> Abrir pasta
        </button>
      </SettingRow>
      <DangerZone />
    </Section>
  )
}

function About({ info }: { info: AppInfo | null }) {
  const [history, setHistory] = useState(false)
  const [check, setCheck] = useState<'idle' | 'checking' | 'dev' | 'latest' | 'available' | 'error'>('idle')
  const label = {
    idle: null,
    checking: 'Verificando…',
    dev: 'Modo dev: atualizações só no app instalado.',
    latest: 'Você está na versão mais recente.',
    available: 'Nova versão disponível — veja o aviso no topo.',
    error: 'Não foi possível verificar agora.'
  }[check]

  return (
    <div className="flex items-center gap-4 py-4">
      <img src={logo} alt="" className="size-12 drop-shadow-[0_0_12px_color-mix(in_srgb,var(--color-volt)_45%,transparent)]" />
      <div className="flex-1">
        <div className="font-mono text-[14px] font-semibold tracking-[0.2em] text-zinc-100">U-HUB</div>
        <div className="font-mono text-[11px] text-zinc-500">
          v{info?.version ?? '…'} · {info?.platform ?? ''} {info && !info.isPackaged && '· dev'}
        </div>
        {label && <div className={`mt-1 font-mono text-[10px] ${check === 'error' ? 'text-rose-300' : check === 'available' ? 'text-volt-200' : 'text-zinc-500'}`}>{label}</div>}
      </div>
      <button className="btn" onClick={() => setHistory(true)}>
        <Sparkles className="size-3.5" /> Novidades
      </button>
      <a className="btn" href="https://github.com/lcfarias1501/u-hub/releases" target="_blank" rel="noreferrer">
        <ExternalLink className="size-3.5" /> Releases
      </a>
      {history && (
        <WhatsNew entries={CHANGELOG.filter((e) => /^\d/.test(e.version))} title="Histórico de versões" onClose={() => setHistory(false)} />
      )}
      <button
        className="btn"
        disabled={check === 'checking'}
        onClick={async () => {
          setCheck('checking')
          setCheck(await window.uhub.updater.check())
        }}
      >
        {check === 'checking' ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Verificar atualizações
      </button>
    </div>
  )
}

function SpotifyAccount() {
  const [status, setStatus] = useState<SpotifyStatus | null>(null)
  useEffect(() => {
    void window.uhub.spotify.status().then(setStatus)
  }, [])
  return (
    <SettingRow
      title="Conta do Spotify"
      description={
        !status ? '…' : status.connected ? `Conectado como ${status.user?.name ?? '—'} (${status.user?.product ?? '?'}).` : 'Não conectado. Conecte pela aba Media & Audio → Spotify.'
      }
    >
      {status?.connected && (
        <button
          className="btn hover:!border-crit/50 hover:!text-rose-300"
          onClick={async () => {
            await window.uhub.spotify.logout()
            setStatus(await window.uhub.spotify.status())
          }}
        >
          Desconectar
        </button>
      )}
    </SettingRow>
  )
}

function BackupExport() {
  const [open, setOpen] = useState(false)
  const [withVault, setWithVault] = useState(false)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const pwOk = !withVault || (pw.length >= 8 && pw === pw2)

  const run = async (): Promise<void> => {
    const r = await window.uhub.backup.export(withVault ? pw : null)
    if (r.ok) {
      setResult(`Salvo em ${r.path}`)
      setOpen(false)
      setPw('')
      setPw2('')
    }
  }

  return (
    <div className="py-3.5">
      <SettingRow
        title="Exportar backup"
        description="Módulos, quests, atalhos, rádios, playlists, categorias e preferências em um arquivo .json. O Vault é opcional e vai protegido por senha."
      >
        <button className="btn" onClick={() => setOpen((o) => !o)}>
          <ArrowDownToLine className="size-3.5" /> Exportar
        </button>
      </SettingRow>
      {result && <p className="font-mono text-[10px] break-all text-acid-soft">✓ {result}</p>}
      {open && (
        <div className="animate-rise mt-1 space-y-3 rounded-[3px] border border-white/[0.06] bg-black/20 p-3">
          <label className="flex items-center gap-2 text-[12px] text-zinc-300">
            <Switch checked={withVault} onChange={setWithVault} label="Incluir Vault" />
            Incluir o Vault (senhas e keys)
          </label>
          {withVault && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Senha do backup" hint="Mínimo 8 caracteres. Sem ela não dá para restaurar o Vault.">
                <input className="field" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
              </Field>
              <Field label="Confirmar senha">
                <input className={`field ${pw2 && pw2 !== pw ? '!border-crit/50' : ''}`} type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
              </Field>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button className="btn" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button className="btn btn-volt" disabled={!pwOk} onClick={run}>
              <ArrowDownToLine className="size-3.5" /> Escolher onde salvar…
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function BackupImport() {
  const [summary, setSummary] = useState<BackupSummary | null>(null)
  const [pw, setPw] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const pick = async (): Promise<void> => {
    setError(null)
    try {
      setSummary(await window.uhub.backup.inspect())
    } catch (e) {
      setError((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    }
  }

  const restore = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await window.uhub.backup.restore(pw || null)
      window.location.reload() // every view re-reads its state from the store
    } catch (e) {
      setError((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
      setBusy(false)
    }
  }

  return (
    <div className="py-3.5">
      <SettingRow title="Importar backup" description="Substitui os dados atuais pelos do arquivo. Você vê o conteúdo antes de confirmar.">
        <button className="btn" onClick={pick}>
          <ArrowUpFromLine className="size-3.5" /> Importar…
        </button>
      </SettingRow>
      {error && !summary && <p className="font-mono text-[10px] text-rose-300">✕ {error}</p>}
      {summary && (
        <div className="animate-rise mt-1 space-y-3 rounded-[3px] border border-volt/25 bg-volt/[0.04] p-3">
          <div className="font-mono text-[11px] text-zinc-400">
            <div className="break-all text-zinc-200">{summary.path.split(/[\\/]/).pop()}</div>
            criado em {new Date(summary.createdAt).toLocaleString('pt-BR')} · U-Hub v{summary.appVersion}
            <div className="mt-1 text-zinc-500">
              {summary.counts.quests} quests · {summary.counts.launchers} atalhos · {summary.counts.categories} categorias · {summary.counts.stations} rádios ·{' '}
              {summary.hasVault ? 'inclui Vault' : 'sem Vault'}
            </div>
          </div>
          {summary.hasVault && (
            <Field label="Senha do backup" hint="Deixe em branco para restaurar tudo menos o Vault (o Vault atual fica como está).">
              <input className="field" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
            </Field>
          )}
          {error && <p className="font-mono text-[10px] text-rose-300">✕ {error}</p>}
          <div className="flex justify-end gap-2">
            <button className="btn" onClick={() => setSummary(null)}>
              Cancelar
            </button>
            <button className="btn btn-volt" disabled={busy} onClick={restore}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Substituir dados atuais
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function DangerZone() {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  return (
    <div className="py-3.5">
      <SettingRow title="Apagar todos os dados" description="Remove Vault, quests, atalhos, preferências e a sessão do Spotify, e reinicia o app. Não tem volta.">
        <button className="btn hover:!border-crit/50 hover:!text-rose-300" onClick={() => setOpen((o) => !o)}>
          <TriangleAlert className="size-3.5" /> Apagar…
        </button>
      </SettingRow>
      {open && (
        <div className="animate-rise mt-1 flex items-end gap-2 rounded-[3px] border border-crit/30 bg-crit/[0.06] p-3">
          <div className="flex-1">
            <Field label='Digite "APAGAR" para confirmar'>
              <input autoFocus className="field" value={typed} onChange={(e) => setTyped(e.target.value)} />
            </Field>
          </div>
          <button
            className="btn !border-crit/60 !bg-crit/20 !text-rose-100 hover:!bg-crit/30"
            disabled={typed !== 'APAGAR'}
            onClick={() => void window.uhub.app.reset()}
          >
            Apagar e reiniciar
          </button>
        </div>
      )}
    </div>
  )
}
