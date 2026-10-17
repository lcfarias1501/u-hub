import { ExternalLink, Keyboard, MessageSquare, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import type { DiscordStatus, ShortcutAction, ShortcutStatus } from '@shared/types'
import { SettingRow, Switch } from '@renderer/components/Controls'
import { Field } from '@renderer/components/Modal'
import { Panel } from '@renderer/components/Panel'
import { isMac } from '@renderer/hooks/useHotkeys'
import { useSettings } from '@renderer/lib/settings'

function Section({ id, title, icon, children }: { id: string; title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div id={id} className="scroll-mt-6">
      <Panel title={title} icon={icon} hover={false} bodyClassName="divide-y divide-white/[0.05] px-4 py-2">
        {children}
      </Panel>
    </div>
  )
}

// ── Shortcuts ────────────────────────────────────────────────────────────────

const ACTIONS: { action: ShortcutAction; title: string; description: string }[] = [
  { action: 'toggleWindow', title: 'Mostrar / esconder o U-Hub', description: 'Traz o app para frente de qualquer lugar, ou esconde.' },
  { action: 'mediaPlayPause', title: 'Tocar / pausar', description: 'Controla o que estiver tocando: rádio ou Spotify.' },
  { action: 'mediaNext', title: 'Próxima', description: 'Próxima faixa no Spotify ou próxima estação de rádio.' },
  { action: 'mediaPrev', title: 'Anterior', description: 'Faixa ou estação anterior.' },
  { action: 'radioVolumeUp', title: 'Volume da rádio +', description: 'Aumenta 10%.' },
  { action: 'radioVolumeDown', title: 'Volume da rádio −', description: 'Diminui 10%.' }
]

const CODE_KEYS: Record<string, string> = {
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Space: 'Space',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Backslash: '\\',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Insert: 'Insert',
  MediaPlayPause: 'MediaPlayPause',
  MediaTrackNext: 'MediaNextTrack',
  MediaTrackPrevious: 'MediaPreviousTrack'
}

/** KeyboardEvent → Electron accelerator. Null while only modifiers are held or the combo isn't allowed. */
function toAccelerator(e: KeyboardEvent): string | null {
  let key: string | undefined
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3)
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5)
  else if (/^F\d{1,2}$/.test(e.code)) key = e.code
  else key = CODE_KEYS[e.code]
  if (!key) return null
  const mods = [e.metaKey && (isMac ? 'Command' : 'Super'), e.ctrlKey && 'Control', e.altKey && 'Alt', e.shiftKey && 'Shift'].filter(Boolean) as string[]
  // A bare letter would hijack normal typing everywhere; only F-keys and media keys may stand alone.
  if (!mods.length && !/^F\d|^Media/.test(key)) return null
  return [...mods, key].join('+')
}

const SYMBOLS: Record<string, string> = isMac
  ? { Command: '⌘', Control: '⌃', Alt: '⌥', Shift: '⇧', Up: '↑', Down: '↓', Left: '←', Right: '→', Space: 'Espaço' }
  : { Command: 'Win', Super: 'Win', Control: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Up: '↑', Down: '↓', Left: '←', Right: '→', Space: 'Espaço' }

function Keys({ accel }: { accel: string }) {
  return (
    <span className="flex gap-0.5">
      {accel.split('+').map((k) => (
        <kbd key={k} className="kbd !h-6 !min-w-6 !px-1.5 !text-[11px]">
          {SYMBOLS[k] ?? k}
        </kbd>
      ))}
    </span>
  )
}

function Recorder({ value, taken, status, onChange }: { value: string; taken: Set<string>; status: 'ok' | 'conflict' | 'unset'; onChange: (v: string) => void }) {
  const [recording, setRecording] = useState(false)
  const [hint, setHint] = useState<string | null>(null)

  useEffect(() => {
    if (!recording) return
    void window.uhub.shortcuts.pause(true)
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') return setRecording(false)
      if (e.key === 'Backspace' || e.key === 'Delete') {
        onChange('')
        return setRecording(false)
      }
      const accel = toAccelerator(e)
      if (!accel) return setHint('Use ao menos uma tecla modificadora (⌘ ⌃ ⌥ ⇧) junto com outra tecla.')
      if (taken.has(accel)) return setHint('Essa combinação já está em outro atalho do U-Hub.')
      onChange(accel)
      setRecording(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      void window.uhub.shortcuts.pause(false)
      setHint(null)
    }
  }, [recording, taken, onChange])

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {recording ? (
          <span className="animate-pulse-dot rounded-[3px] border border-volt/60 bg-volt/15 px-2.5 py-1 font-mono text-[11px] text-volt-100">Pressione a combinação…</span>
        ) : value ? (
          <Keys accel={value} />
        ) : (
          <span className="font-mono text-[11px] text-zinc-600">Sem atalho</span>
        )}
        <button className="btn h-7" onClick={() => setRecording((r) => !r)}>
          {recording ? 'Cancelar' : 'Gravar'}
        </button>
        {value && !recording && (
          <button className="icon-btn" onClick={() => onChange('')} aria-label="Remover atalho" title="Remover atalho">
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {recording && <span className="font-mono text-[10px] text-zinc-500">{hint ?? 'Esc cancela · Backspace remove'}</span>}
      {!recording && status === 'conflict' && <span className="font-mono text-[10px] text-amber-300">Em uso por outro app — escolha outra combinação</span>}
    </div>
  )
}

export function ShortcutsSection() {
  const { settings, update } = useSettings()
  const [status, setStatus] = useState<ShortcutStatus | null>(null)

  useEffect(() => {
    void window.uhub.shortcuts.status().then(setStatus)
    return window.uhub.shortcuts.onStatus(setStatus)
  }, [])

  return (
    <Section id="shortcuts" title="Atalhos globais" icon={<Keyboard />}>
      <p className="py-3 text-[12px] text-zinc-500">Funcionam em qualquer app, mesmo com o U-Hub em segundo plano ou na barra de menus.</p>
      {ACTIONS.map((a) => {
        const taken = new Set(
          Object.entries(settings.shortcuts)
            .filter(([k, v]) => k !== a.action && v)
            .map(([, v]) => v)
        )
        return (
          <SettingRow key={a.action} title={a.title} description={a.description}>
            <Recorder
              value={settings.shortcuts[a.action]}
              taken={taken}
              status={status?.[a.action] ?? 'unset'}
              onChange={(v) => update({ shortcuts: { ...settings.shortcuts, [a.action]: v } })}
            />
          </SettingRow>
        )
      })}
    </Section>
  )
}

// ── Discord ──────────────────────────────────────────────────────────────────

const STATE_TEXT: Record<DiscordStatus['state'], { label: string; tone: string }> = {
  connected: { label: 'Conectado', tone: 'bg-acid' },
  connecting: { label: 'Conectando…', tone: 'bg-warn animate-pulse-dot' },
  'not-running': { label: 'Discord fechado — tentando de novo a cada 20s', tone: 'bg-zinc-500' },
  'no-client-id': { label: 'Falta o Application ID do Discord', tone: 'bg-warn' },
  off: { label: 'Desligado', tone: 'bg-zinc-600' }
}

export function DiscordSection() {
  const { settings, update } = useSettings()
  const d = settings.discord
  const set = (patch: Partial<typeof d>): void => update({ discord: { ...d, ...patch } })
  const [status, setStatus] = useState<DiscordStatus | null>(null)
  const [idDraft, setIdDraft] = useState(d.clientId ?? '')

  useEffect(() => {
    void window.uhub.discord.status().then(setStatus)
    return window.uhub.discord.onStatus(setStatus)
  }, [])

  const st = status ? STATE_TEXT[status.state] : null
  const validId = /^\d{17,20}$/.test(idDraft.trim())

  return (
    <Section id="discord" title="Status no Discord" icon={<MessageSquare />}>
      <div className="flex items-start gap-5 py-4">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-[12px] leading-relaxed text-zinc-500">
            Mostra no seu perfil do Discord o jogo aberto (com capa e tempo de sessão) ou a rádio tocando. Usa o Discord desktop do seu computador — sem login.
          </p>
          {st && (
            <div className="flex items-center gap-2 font-mono text-[11px] text-zinc-300">
              <span className={`size-2 rounded-full ${st.tone}`} />
              {st.label}
              {status?.user && <span className="text-zinc-500">· {status.user}</span>}
            </div>
          )}
        </div>
        {/* Rough preview of how it renders on a Discord profile. */}
        <div className="w-60 shrink-0 rounded-[6px] border border-white/[0.06] bg-[#1e1f22] p-3">
          <div className="mb-2 font-sans text-[10px] font-bold tracking-wide text-zinc-400 uppercase">
            {!status?.activity ? 'Prévia' : status.activity.type === 2 ? 'Ouvindo U-Hub' : 'Jogando U-Hub'}
          </div>
          {status?.activity ? (
            <div className="flex gap-2.5">
              <div className="size-12 shrink-0 rounded-[4px] bg-gradient-to-br from-volt/60 to-acid/40" />
              <div className="min-w-0 text-[12px] leading-tight">
                <div className="truncate font-semibold text-zinc-100">{status.activity.details}</div>
                {status.activity.state && <div className="truncate text-zinc-400">{status.activity.state}</div>}
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-zinc-500">Nada sendo mostrado agora. Abra um jogo da Biblioteca ou toque uma rádio.</div>
          )}
        </div>
      </div>

      <SettingRow title="Ativar status no Discord">
        <Switch checked={d.enabled} onChange={(enabled) => set({ enabled })} label="Ativar status no Discord" />
      </SettingRow>
      <SettingRow title="Mostrar o jogo aberto" description="Nome, capa, tempo total e cronômetro da sessão.">
        <Switch checked={d.showGames} disabled={!d.enabled} onChange={(showGames) => set({ showGames })} label="Mostrar jogo" />
      </SettingRow>
      <SettingRow title="Mostrar a rádio" description="Estação e gênero, como “Ouvindo”.">
        <Switch checked={d.showRadio} disabled={!d.enabled} onChange={(showRadio) => set({ showRadio })} label="Mostrar rádio" />
      </SettingRow>
      <SettingRow title="Mostrar quando ocioso" description="Exibe “No U-Hub” mesmo sem jogo nem rádio.">
        <Switch checked={d.showIdle} disabled={!d.enabled} onChange={(showIdle) => set({ showIdle })} label="Mostrar quando ocioso" />
      </SettingRow>
      <SettingRow title="Botão “Baixar U-Hub”" description="Seus amigos veem um botão para baixar o app no seu status.">
        <Switch checked={d.showButton} disabled={!d.enabled} onChange={(showButton) => set({ showButton })} label="Botão de download" />
      </SettingRow>

      <div className="py-3.5">
        <Field
          label={status?.hasBuiltInClientId ? 'Application ID próprio (opcional)' : 'Application ID do Discord'}
          hint="O nome do app no Discord é o que aparece como “Jogando ___”. Crie em discord.com/developers/applications → New Application → copie o Application ID."
        >
          <div className="flex gap-2">
            <input
              className={`field flex-1 ${idDraft && !validId ? '!border-crit/50' : ''}`}
              placeholder={status?.hasBuiltInClientId ? 'Usando o ID padrão do U-Hub' : '123456789012345678'}
              value={idDraft}
              onChange={(e) => setIdDraft(e.target.value)}
              spellCheck={false}
            />
            <button className="btn h-9" disabled={(!!idDraft && !validId) || idDraft.trim() === (d.clientId ?? '')} onClick={() => set({ clientId: idDraft.trim() || null })}>
              Salvar
            </button>
            <a className="btn h-9" href="https://discord.com/developers/applications" target="_blank" rel="noreferrer">
              Portal <ExternalLink className="size-3" />
            </a>
          </div>
        </Field>
      </div>
    </Section>
  )
}
