import {
  ExternalLink,
  ListMusic,
  Laptop,
  Loader2,
  LogOut,
  Monitor,
  Pause,
  Play,
  RefreshCw,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Smartphone,
  Speaker,
  Volume2
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  SPOTIFY_REDIRECT_URI,
  type SpotifyCommand,
  type SpotifyDevice,
  type SpotifyPlayback,
  type SpotifyPlaylistItem,
  type SpotifyResult,
  type SpotifyStatus
} from '@shared/types'
import { CopyButton } from '@renderer/components/CopyButton'
import { Panel } from '@renderer/components/Panel'

const POLL_MS = 3000
const DEVICE_POLL_MS = 15000

const REASONS: Record<string, string> = {
  PREMIUM_REQUIRED: 'Controlar o player exige Spotify Premium.',
  NO_ACTIVE_DEVICE: 'Nenhum dispositivo ativo — abra o Spotify em algum aparelho ou escolha um abaixo.',
  NOT_CONNECTED: 'Sessão expirada. Conecte de novo.'
}

const fmt = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

type Mode = 'control' | 'embed'

export function SpotifyPanel({ embed }: { embed: ReactNode }) {
  const [status, setStatus] = useState<SpotifyStatus | null>(null)
  const [mode, setMode] = useState<Mode>('control')

  const refreshStatus = useCallback(async () => setStatus(await window.uhub.spotify.status()), [])
  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  return (
    <Panel
      title="Spotify"
      icon={<ListMusic />}
      hover={false}
      actions={
        <div className="flex rounded-[3px] border border-white/[0.08] p-0.5">
          {(['control', 'embed'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-[2px] px-2.5 py-0.5 font-mono text-[10px] transition-colors ${mode === m ? 'bg-acid/20 text-emerald-200' : 'text-zinc-500 hover:text-zinc-200'}`}
            >
              {m === 'control' ? 'CONTROLE' : 'EMBED'}
            </button>
          ))}
        </div>
      }
      bodyClassName="flex flex-col p-3"
    >
      {/* Both stay mounted so switching modes doesn't stop the embed or reset the controller. */}
      <div hidden={mode !== 'embed'} className="h-full">
        {embed}
      </div>
      <div hidden={mode !== 'control'} className="h-full">
        {!status ? (
          <div className="grid h-full place-items-center">
            <Loader2 className="size-5 animate-spin text-zinc-600" />
          </div>
        ) : status.connected ? (
          <Controller status={status} onLogout={async () => {
            await window.uhub.spotify.logout()
            await refreshStatus()
          }} onExpired={refreshStatus} />
        ) : (
          <Setup status={status} onConnected={refreshStatus} />
        )}
      </div>
    </Panel>
  )
}

// ── Setup / login ────────────────────────────────────────────────────────────

function Step({ n, title, children }: { n: number; title: string; children?: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-5 shrink-0 place-items-center rounded-[3px] border border-volt/40 bg-volt/10 font-mono text-[10px] text-volt-soft">{n}</span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="text-[13px] text-zinc-200">{title}</div>
        {children}
      </div>
    </li>
  )
}

function Setup({ status, onConnected }: { status: SpotifyStatus; onConnected: () => void }) {
  const initial = status.usingCustomClientId ? (status.clientId ?? '') : ''
  const [clientId, setClientId] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Builds with a built-in Client ID only need the custom field when the user opts in.
  const [custom, setCustom] = useState(!status.hasBuiltInClientId || status.usingCustomClientId)
  const id = custom ? clientId.trim() : ''
  const valid = custom ? /^[0-9a-f]{32}$/i.test(id) : status.hasBuiltInClientId

  const connect = async (): Promise<void> => {
    setError(null)
    if (id !== saved) {
      await window.uhub.spotify.setClientId(id)
      setSaved(id)
    }
    setBusy(true)
    const res = await window.uhub.spotify.login()
    setBusy(false)
    if (res.ok) onConnected()
    else setError(res.error)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4">
        <div className="eyebrow mb-1">Conectar conta</div>
        <p className="text-[12px] leading-relaxed text-zinc-500">
          Controle o Spotify (Mac, celular, caixa de som…) direto do U-Hub. O login é feito no navegador; o U-Hub nunca vê sua senha.
        </p>
      </div>
      {!custom ? (
        <div className="space-y-3">
          <div className="rounded-[3px] border border-acid/20 bg-acid/[0.05] p-3 text-[12px] leading-relaxed text-zinc-400">
            Clique em <span className="text-emerald-200">Conectar Spotify</span> e autorize no navegador. Se aparecer um erro de acesso,
            peça para quem te passou o U-Hub liberar o e-mail da sua conta Spotify no app dele.
          </div>
          <button className="font-mono text-[10px] text-zinc-600 underline-offset-2 hover:text-zinc-300 hover:underline" onClick={() => setCustom(true)}>
            Usar meu próprio Client ID
          </button>
        </div>
      ) : (
        <ol className="space-y-4">
          <Step n={1} title="Crie um app no Spotify for Developers">
            <a className="inline-flex items-center gap-1 font-mono text-[11px] text-volt-soft hover:underline" href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">
              developer.spotify.com/dashboard <ExternalLink className="size-3" />
            </a>
            <p className="font-mono text-[10px] text-zinc-600">Em “APIs used”, marque Web API.</p>
          </Step>
          <Step n={2} title="Cadastre este Redirect URI">
            <div className="flex items-center gap-1 rounded-[3px] border border-white/[0.06] bg-black/30 py-1 pr-1 pl-2.5">
              <code className="flex-1 truncate font-mono text-[11px] text-emerald-200 select-text">{SPOTIFY_REDIRECT_URI}</code>
              <CopyButton value={SPOTIFY_REDIRECT_URI} label="Copiar" />
            </div>
          </Step>
          <Step n={3} title="Cole o Client ID">
            <input
              className={`field ${clientId && !valid ? '!border-crit/50' : ''}`}
              placeholder="32 caracteres hexadecimais"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              spellCheck={false}
            />
          </Step>
          {status.hasBuiltInClientId && (
            <button
              className="font-mono text-[10px] text-zinc-600 underline-offset-2 hover:text-zinc-300 hover:underline"
              onClick={() => {
                setCustom(false)
                setClientId('')
              }}
            >
              Voltar para o Client ID padrão do U-Hub
            </button>
          )}
        </ol>
      )}

      <div className="mt-auto pt-4">
        {error && <p className="mb-2 font-mono text-[11px] text-rose-300">✕ {error}</p>}
        <button className="btn btn-volt h-10 w-full justify-center !border-acid/50 !bg-acid/15 !text-emerald-100 hover:!bg-acid/25 hover:!shadow-[0_0_24px_-6px_var(--color-acid)]" disabled={!valid || busy} onClick={connect}>
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Aguardando autorização no navegador…
            </>
          ) : (
            'Conectar Spotify'
          )}
        </button>
      </div>
    </div>
  )
}

// ── Connected controller ─────────────────────────────────────────────────────

const DEVICE_ICON: Record<string, typeof Speaker> = { Computer: Monitor, Smartphone, Speaker }

function Controller({ status, onLogout, onExpired }: { status: SpotifyStatus; onLogout: () => void; onExpired: () => void }) {
  const [pb, setPb] = useState<SpotifyPlayback | null>(null)
  const [devices, setDevices] = useState<SpotifyDevice[]>([])
  const [playlists, setPlaylists] = useState<SpotifyPlaylistItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const [volume, setVolume] = useState<number | null>(null)
  const [showDevices, setShowDevices] = useState(false)
  const [movingHere, setMovingHere] = useState(false)
  const volumeTimer = useRef<number | undefined>(undefined)

  const handle = useCallback(
    <T,>(res: SpotifyResult<T>): T | undefined => {
      if (res.ok) return res.data
      if (res.reason === 'NOT_CONNECTED') onExpired()
      setError(REASONS[res.reason ?? ''] ?? res.error)
      return undefined
    },
    [onExpired]
  )

  const loadPlayback = useCallback(async () => {
    const res = await window.uhub.spotify.playback()
    if (res.ok) setPb(res.data)
  }, [])
  const loadDevices = useCallback(async () => {
    const res = await window.uhub.spotify.devices()
    if (res.ok) setDevices(res.data)
  }, [])

  useEffect(() => {
    void loadPlayback()
    void loadDevices()
    void window.uhub.spotify.playlists().then((r) => r.ok && setPlaylists(r.data))
    const a = setInterval(() => document.visibilityState === 'visible' && void loadPlayback(), POLL_MS)
    const b = setInterval(() => document.visibilityState === 'visible' && void loadDevices(), DEVICE_POLL_MS)
    const c = setInterval(() => setNow(Date.now()), 500)
    return () => {
      clearInterval(a)
      clearInterval(b)
      clearInterval(c)
    }
  }, [loadPlayback, loadDevices])

  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 5000)
    return () => clearTimeout(t)
  }, [error])

  const send = async (cmd: SpotifyCommand, optimistic?: Partial<SpotifyPlayback>): Promise<void> => {
    if (optimistic && pb) setPb({ ...pb, ...optimistic })
    const res = await window.uhub.spotify.command(cmd)
    if (res.ok) setError(null)
    else handle(res)
    // Spotify's player state lags a moment behind commands.
    setTimeout(() => void loadPlayback(), 400)
  }

  const playHere = async (): Promise<void> => {
    setMovingHere(true)
    const res = await window.uhub.spotify.playHere()
    setMovingHere(false)
    if (!res.ok) handle(res)
    else setError(null)
    void loadDevices()
    setTimeout(() => void loadPlayback(), 600)
  }

  const fallbackDevice = devices.find((d) => d.isActive) ?? devices[0]
  const progress = pb ? Math.min(pb.durationMs, pb.progressMs + (pb.isPlaying ? now - pb.fetchedAt : 0)) : 0
  const pctDone = pb?.durationMs ? (progress / pb.durationMs) * 100 : 0
  const vol = volume ?? pb?.device?.volume ?? 50
  const premium = status.user?.product === 'premium'
  const RepeatIcon = pb?.repeat === 'track' ? Repeat1 : Repeat
  const nextRepeat = { off: 'context', context: 'track', track: 'off' } as const

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Account */}
      <div className="flex items-center gap-2">
        {status.user?.avatar ? <img src={status.user.avatar} className="size-6 rounded-full" alt="" /> : <span className="size-6 rounded-full bg-acid/20" />}
        <span className="truncate text-[12px] text-zinc-300">{status.user?.name ?? 'Conectado'}</span>
        <span className={`rounded-[2px] border px-1 font-mono text-[9px] ${premium ? 'border-acid/30 text-acid-soft' : 'border-warn/30 text-amber-300'}`}>
          {(status.user?.product ?? '?').toUpperCase()}
        </span>
        <button className="icon-btn ml-auto" onClick={() => void Promise.all([loadPlayback(), loadDevices()])} title="Atualizar">
          <RefreshCw className="size-3.5" />
        </button>
        <button className="icon-btn hover:!text-rose-300" onClick={onLogout} title="Desconectar">
          <LogOut className="size-3.5" />
        </button>
      </div>
      {!premium && status.user && (
        <p className="rounded-[3px] border border-warn/25 bg-warn/[0.06] px-2.5 py-1.5 font-mono text-[10px] text-amber-200/80">
          Conta Free: dá para ver o que está tocando, mas o Spotify só permite controlar o player com Premium.
        </p>
      )}

      {/* Now playing */}
      <div className="relative overflow-hidden rounded-[3px] border border-white/[0.06] bg-black/30 p-3">
        {pb?.track?.image && (
          <img src={pb.track.image} alt="" className="pointer-events-none absolute inset-0 size-full scale-125 object-cover opacity-20 blur-2xl" />
        )}
        <div className="relative flex gap-3">
          <div className="size-[104px] shrink-0 overflow-hidden rounded-[3px] bg-white/[0.04] shadow-[0_12px_30px_-10px_rgba(0,0,0,0.9)]">
            {pb?.track?.image ? <img src={pb.track.image} alt="" className="size-full object-cover" /> : <ListMusic className="m-auto mt-9 size-7 text-zinc-700" />}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="eyebrow flex items-center gap-1.5">
              {pb?.isPlaying && <span className="size-1.5 rounded-full bg-acid animate-pulse-dot" />}
              {pb ? (pb.isPlaying ? 'Tocando' : 'Pausado') : 'Nada tocando'}
              {pb?.device && <span className="truncate text-zinc-600">· {pb.device.name}</span>}
            </div>
            <div className="mt-1 truncate text-[16px] font-semibold text-zinc-50">{pb?.track?.name ?? '—'}</div>
            <div className="truncate text-[12px] text-zinc-400">{pb?.track?.artists}</div>
            <div className="truncate font-mono text-[10px] text-zinc-600">{pb?.track?.album}</div>

            <div className="mt-auto flex items-center justify-between pt-2">
              <button className={`icon-btn ${pb?.shuffle ? '!text-acid' : ''}`} disabled={!pb} onClick={() => pb && send({ type: 'shuffle', state: !pb.shuffle }, { shuffle: !pb.shuffle })} title="Aleatório">
                <Shuffle className="size-3.5" />
              </button>
              <button className="icon-btn" onClick={() => send({ type: 'previous' })} title="Anterior">
                <SkipBack className="size-4" />
              </button>
              <button
                className="grid size-9 place-items-center rounded-full bg-zinc-100 text-black transition-transform hover:scale-105 active:scale-95"
                onClick={() =>
                  pb?.isPlaying
                    ? send({ type: 'pause' }, { isPlaying: false, progressMs: progress, fetchedAt: Date.now() })
                    : send({ type: 'play', deviceId: pb?.device ? undefined : fallbackDevice?.id }, { isPlaying: true, fetchedAt: Date.now() })
                }
                title={pb?.isPlaying ? 'Pausar' : 'Tocar'}
              >
                {pb?.isPlaying ? <Pause className="size-4" fill="currentColor" /> : <Play className="ml-0.5 size-4" fill="currentColor" />}
              </button>
              <button className="icon-btn" onClick={() => send({ type: 'next' })} title="Próxima">
                <SkipForward className="size-4" />
              </button>
              <button
                className={`icon-btn ${pb && pb.repeat !== 'off' ? '!text-acid' : ''}`}
                disabled={!pb}
                onClick={() => pb && send({ type: 'repeat', state: nextRepeat[pb.repeat] }, { repeat: nextRepeat[pb.repeat] })}
                title="Repetir"
              >
                <RepeatIcon className="size-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Progress (click to seek) */}
        <div className="relative mt-3 flex items-center gap-2 font-mono text-[10px] text-zinc-500 tabular-nums">
          <span className="w-8">{fmt(progress)}</span>
          <div
            className="group relative h-3 flex-1 cursor-pointer"
            onClick={(e) => {
              if (!pb?.durationMs) return
              const r = e.currentTarget.getBoundingClientRect()
              const pos = ((e.clientX - r.left) / r.width) * pb.durationMs
              void send({ type: 'seek', positionMs: pos }, { progressMs: pos, fetchedAt: Date.now() })
            }}
          >
            <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 bg-white/10" />
            <div className="absolute top-1/2 left-0 h-[3px] -translate-y-1/2 bg-acid transition-[width] duration-500 ease-linear" style={{ width: `${pctDone}%` }} />
            <div className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 transition-opacity group-hover:opacity-100" style={{ left: `${pctDone}%` }} />
          </div>
          <span className="w-8 text-right">{fmt(pb?.durationMs ?? 0)}</span>
        </div>
      </div>

      {/* Volume + device */}
      <div className="relative flex items-center gap-2">
        <Volume2 className="size-3.5 text-zinc-500" />
        <input
          type="range"
          min={0}
          max={100}
          value={vol}
          disabled={!pb?.device || pb.device.volume == null}
          onChange={(e) => {
            const v = Number(e.target.value)
            setVolume(v)
            window.clearTimeout(volumeTimer.current)
            volumeTimer.current = window.setTimeout(() => {
              void send({ type: 'volume', percent: v })
              setVolume(null)
            }, 250)
          }}
          className="h-1 flex-1 cursor-pointer appearance-none disabled:opacity-30"
          style={{ background: `linear-gradient(90deg, var(--color-acid) ${vol}%, rgba(255,255,255,0.08) ${vol}%)` }}
        />
        <span className="w-7 text-right font-mono text-[10px] text-zinc-500">{vol}</span>
        <button
          className="btn h-7 !border-acid/30 !text-emerald-200 hover:!bg-acid/15"
          onClick={playHere}
          disabled={movingHere}
          title="Abre o Spotify neste computador e passa a música para cá"
        >
          {movingHere ? <Loader2 className="size-3 animate-spin" /> : <Laptop className="size-3" />}
          Neste PC
        </button>
        <button className="btn h-7 max-w-[130px]" onClick={() => setShowDevices((s) => !s)} title="Dispositivos">
          <Speaker className="size-3 shrink-0" />
          <span className="truncate">{pb?.device?.name ?? fallbackDevice?.name ?? 'Dispositivo'}</span>
        </button>
        {showDevices && (
          <div className="panel animate-rise absolute right-0 bottom-9 z-20 w-60 !bg-raised/95 p-1">
            {devices.length === 0 && <p className="p-2 font-mono text-[10px] text-zinc-500">Nenhum dispositivo. Abra o Spotify no Mac ou no celular.</p>}
            {devices.map((d) => {
              const Icon = DEVICE_ICON[d.type] ?? Speaker
              return (
                <button
                  key={d.id}
                  onClick={() => {
                    setShowDevices(false)
                    void send({ type: 'transfer', deviceId: d.id }).then(loadDevices)
                  }}
                  className={`flex w-full items-center gap-2 rounded-[2px] px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-white/[0.06] ${d.isActive ? 'text-acid-soft' : 'text-zinc-300'}`}
                >
                  <Icon className="size-3.5" /> <span className="flex-1 truncate">{d.name}</span>
                  {d.isActive && <span className="font-mono text-[9px]">ATIVO</span>}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {error && <p className="animate-rise rounded-[3px] border border-crit/30 bg-crit/[0.08] px-2.5 py-1.5 font-mono text-[10px] text-rose-200">{error}</p>}

      {/* Playlists */}
      <div className="eyebrow flex items-center">
        Suas playlists <span className="ml-1 text-zinc-700">· {playlists.length}</span>
      </div>
      <ul className="-mx-1 min-h-0 flex-1 overflow-y-auto">
        {playlists.map((p) => {
          const current = pb?.contextUri === p.uri
          return (
            <li key={p.uri}>
              <button
                onClick={() => send({ type: 'play', contextUri: p.uri, deviceId: pb?.device ? undefined : fallbackDevice?.id })}
                className={`group flex w-full items-center gap-2.5 rounded-[3px] px-1 py-1 text-left transition-all duration-150 hover:translate-x-0.5 hover:bg-white/[0.04] ${current ? 'bg-acid/[0.08]' : ''}`}
              >
                <span className="relative size-8 shrink-0 overflow-hidden rounded-[2px] bg-white/[0.05]">
                  {p.image && <img src={p.image} alt="" className="size-full object-cover" loading="lazy" />}
                  <span className="absolute inset-0 grid place-items-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                    <Play className="size-3 text-white" fill="currentColor" />
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[12px] ${current ? 'text-emerald-200' : 'text-zinc-200'}`}>{p.name}</span>
                  <span className="block truncate font-mono text-[10px] text-zinc-600">
                    {p.owner}
                    {p.tracks ? ` · ${p.tracks} faixas` : ''}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
