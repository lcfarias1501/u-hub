import { ExternalLink, Laptop, Loader2, Pause, Play, Radio, SkipBack, SkipForward, Volume1, Volume2, VolumeX } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { RadioState, SpotifyPlayback, SpotifyStatus } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/types'
import { applyTheme } from '@renderer/lib/theme'

type Source = 'radio' | 'spotify'

const SPOTIFY_POLL_MS = 2000
const fmt = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function TrayPopover() {
  const [radio, setRadio] = useState<RadioState | null>(null)
  const [spotify, setSpotify] = useState<SpotifyStatus | null>(null)
  const [pb, setPb] = useState<SpotifyPlayback | null>(null)
  const [source, setSource] = useState<Source>('radio')
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const picked = useRef(false)

  const loadPlayback = useCallback(async () => {
    const res = await window.uhub.spotify.playback()
    if (res.ok) setPb(res.data)
    return res.ok ? res.data : null
  }, [])

  // Pick the source that's actually playing each time the popover opens.
  const refresh = useCallback(async () => {
    const settings = { ...DEFAULT_SETTINGS, ...(await window.uhub.store.get('settings')) }
    applyTheme(settings.accent, settings.reduceMotion)
    const [r, st] = await Promise.all([window.uhub.radio.get(), window.uhub.spotify.status()])
    setRadio(r)
    setSpotify(st)
    const p = st.connected ? await loadPlayback() : null
    if (r.playing) setSource('radio')
    else if (p?.isPlaying) setSource('spotify')
    else if (!picked.current) setSource(st.connected && p ? 'spotify' : 'radio')
    setError(null)
  }, [loadPlayback])

  useEffect(() => {
    void refresh()
    const offShown = window.uhub.popover.onShown(() => void refresh())
    const offRadio = window.uhub.radio.onState(setRadio)
    const poll = setInterval(() => document.visibilityState === 'visible' && spotify?.connected && void loadPlayback(), SPOTIFY_POLL_MS)
    const tick = setInterval(() => document.visibilityState === 'visible' && setNow(Date.now()), 1000)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') window.uhub.popover.hide()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      offShown()
      offRadio()
      clearInterval(poll)
      clearInterval(tick)
      window.removeEventListener('keydown', onKey)
    }
  }, [refresh, loadPlayback, spotify?.connected])

  const choose = (s: Source): void => {
    picked.current = true
    setSource(s)
    setError(null)
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden rounded-[12px] border border-white/10 bg-base/80 text-zinc-300 select-none">
      <header className="flex h-9 shrink-0 items-center gap-1 border-b border-white/[0.06] px-2.5">
        <Tab active={source === 'radio'} onClick={() => choose('radio')} live={radio?.playing}>
          RÁDIO
        </Tab>
        {spotify?.connected && (
          <Tab active={source === 'spotify'} onClick={() => choose('spotify')} live={pb?.isPlaying}>
            SPOTIFY
          </Tab>
        )}
        <button className="icon-btn ml-auto size-6" onClick={() => window.uhub.popover.showMain()} title="Abrir U-Hub">
          <ExternalLink className="size-3.5" />
        </button>
      </header>

      {source === 'radio' ? (
        <RadioNowPlaying radio={radio} />
      ) : (
        <SpotifyNowPlaying pb={pb} now={now} error={error} setError={setError} reload={loadPlayback} setPb={setPb} />
      )}
    </div>
  )
}

function Tab({ active, live, onClick, children }: { active: boolean; live?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-[3px] px-2 py-1 font-mono text-[10px] tracking-widest transition-colors ${
        active ? 'bg-volt/20 text-volt-100' : 'text-zinc-500 hover:text-zinc-200'
      }`}
    >
      {live && <span className="size-1.5 rounded-full bg-acid animate-pulse-dot" />}
      {children}
    </button>
  )
}

function Layout({ art, title, subtitle, meta, controls, volume }: { art: ReactNode; title: string; subtitle: string; meta: ReactNode; controls: ReactNode; volume: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-between p-3">
      <div className="flex gap-3">
        <div className="size-[84px] shrink-0 overflow-hidden rounded-[6px] bg-white/[0.04] shadow-[0_10px_24px_-10px_rgba(0,0,0,0.9)]">{art}</div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="truncate text-[15px] font-semibold text-zinc-50">{title}</div>
          <div className="truncate text-[12px] text-zinc-400">{subtitle}</div>
          <div className="mt-auto">{meta}</div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">{controls}</div>
        <div className="ml-auto flex w-28 items-center gap-1.5">{volume}</div>
      </div>
    </div>
  )
}

function Transport({ playing, busy, disabled, onPrev, onToggle, onNext }: { playing: boolean; busy?: boolean; disabled?: boolean; onPrev: () => void; onToggle: () => void; onNext: () => void }) {
  return (
    <>
      <button className="icon-btn size-8" disabled={disabled} onClick={onPrev} aria-label="Anterior">
        <SkipBack className="size-4" fill="currentColor" />
      </button>
      <button
        className="grid size-9 place-items-center rounded-full bg-zinc-100 text-black transition-transform hover:scale-105 active:scale-95"
        onClick={onToggle}
        aria-label={playing ? 'Pausar' : 'Tocar'}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : playing ? <Pause className="size-4" fill="currentColor" /> : <Play className="ml-0.5 size-4" fill="currentColor" />}
      </button>
      <button className="icon-btn size-8" disabled={disabled} onClick={onNext} aria-label="Próxima">
        <SkipForward className="size-4" fill="currentColor" />
      </button>
    </>
  )
}

function VolumeSlider({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  const Icon = value === 0 ? VolumeX : value < 0.5 ? Volume1 : Volume2
  return (
    <>
      <Icon className="size-3.5 shrink-0 text-zinc-500" />
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-full cursor-pointer appearance-none disabled:opacity-30"
        style={{ background: `linear-gradient(90deg, var(--color-volt) ${value * 100}%, rgba(255,255,255,0.1) ${value * 100}%)` }}
        aria-label="Volume"
      />
    </>
  )
}

// ── Radio ────────────────────────────────────────────────────────────────────

function RadioNowPlaying({ radio }: { radio: RadioState | null }) {
  const station = radio?.station
  const cmd = window.uhub.radio.command
  return (
    <Layout
      art={
        <div className="relative grid size-full place-items-center bg-gradient-to-br from-volt/50 via-volt/15 to-acid/30">
          <Radio className="size-8 text-white/85" strokeWidth={1.5} />
          {radio?.playing && (
            <span className="absolute right-1.5 bottom-1.5 flex h-3 items-end gap-[2px]">
              {[0, 0.2, 0.4].map((d) => (
                <span key={d} className="w-[3px] bg-white/90" style={{ animation: `eq 0.9s ${d}s ease-in-out infinite alternate`, height: '40%' }} />
              ))}
              <style>{'@keyframes eq{to{height:100%}}'}</style>
            </span>
          )}
        </div>
      }
      title={station?.name ?? 'Rádio parada'}
      subtitle={radio?.error ?? station?.genre ?? 'Aperte play para tocar a primeira estação'}
      meta={
        <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-widest">
          {radio?.loading ? (
            <span className="text-zinc-500">SINTONIZANDO…</span>
          ) : radio?.playing ? (
            <>
              <span className="size-1.5 rounded-full bg-rose-500 animate-pulse-dot" />
              <span className="text-rose-300">AO VIVO</span>
            </>
          ) : (
            <span className="text-zinc-600">{station ? 'PAUSADO' : 'IDLE'}</span>
          )}
        </span>
      }
      controls={
        <Transport
          playing={!!radio?.playing}
          busy={radio?.loading}
          onPrev={() => cmd({ type: 'prev' })}
          onToggle={() => cmd({ type: 'toggle' })}
          onNext={() => cmd({ type: 'next' })}
        />
      }
      volume={<VolumeSlider value={radio?.volume ?? 0.6} onChange={(value) => cmd({ type: 'volume', value })} />}
    />
  )
}

// ── Spotify ──────────────────────────────────────────────────────────────────

const REASONS: Record<string, string> = {
  PREMIUM_REQUIRED: 'Controlar exige Spotify Premium.',
  NO_ACTIVE_DEVICE: 'Nenhum dispositivo ativo.'
}

function SpotifyNowPlaying({
  pb,
  now,
  error,
  setError,
  reload,
  setPb
}: {
  pb: SpotifyPlayback | null
  now: number
  error: string | null
  setError: (e: string | null) => void
  reload: () => Promise<SpotifyPlayback | null>
  setPb: (p: SpotifyPlayback | null) => void
}) {
  const [volume, setVolume] = useState<number | null>(null)
  const [movingHere, setMovingHere] = useState(false)
  const volumeTimer = useRef<number | undefined>(undefined)
  const progress = pb ? Math.min(pb.durationMs, pb.progressMs + (pb.isPlaying ? now - pb.fetchedAt : 0)) : 0
  const pct = pb?.durationMs ? (progress / pb.durationMs) * 100 : 0

  const send = async (cmd: Parameters<typeof window.uhub.spotify.command>[0], optimistic?: Partial<SpotifyPlayback>): Promise<void> => {
    if (optimistic && pb) setPb({ ...pb, ...optimistic })
    const res = await window.uhub.spotify.command(cmd)
    setError(res.ok ? null : (REASONS[res.reason ?? ''] ?? res.error))
    setTimeout(() => void reload(), 400)
  }

  if (!pb?.track) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
        <p className="text-[12px] text-zinc-500">Nada tocando no Spotify agora.</p>
        <button
          className="btn !border-acid/40 !text-emerald-200"
          disabled={movingHere}
          onClick={async () => {
            setMovingHere(true)
            const res = await window.uhub.spotify.playHere()
            setMovingHere(false)
            if (!res.ok) setError(res.error)
            setTimeout(() => void reload(), 800)
          }}
        >
          {movingHere ? <Loader2 className="size-3.5 animate-spin" /> : <Laptop className="size-3.5" />} Tocar neste PC
        </button>
        {error && <p className="font-mono text-[10px] text-rose-300">{error}</p>}
      </div>
    )
  }

  const vol = volume ?? (pb.device?.volume ?? 50) / 100
  return (
    <Layout
      art={pb.track.image ? <img src={pb.track.image} alt="" className="size-full object-cover" /> : null}
      title={pb.track.name}
      subtitle={error ?? pb.track.artists}
      meta={
        <div>
          <div
            className="group relative h-2.5 cursor-pointer"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              const pos = ((e.clientX - r.left) / r.width) * pb.durationMs
              void send({ type: 'seek', positionMs: pos }, { progressMs: pos, fetchedAt: Date.now() })
            }}
          >
            <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-white/10" />
            <div className="absolute top-1/2 left-0 h-[3px] -translate-y-1/2 rounded-full bg-volt" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between font-mono text-[10px] text-zinc-500 tabular-nums">
            <span>{fmt(progress)}</span>
            <span>−{fmt(pb.durationMs - progress)}</span>
          </div>
        </div>
      }
      controls={
        <Transport
          playing={pb.isPlaying}
          onPrev={() => send({ type: 'previous' })}
          onToggle={() =>
            pb.isPlaying
              ? send({ type: 'pause' }, { isPlaying: false, progressMs: progress, fetchedAt: Date.now() })
              : send({ type: 'play' }, { isPlaying: true, fetchedAt: Date.now() })
          }
          onNext={() => send({ type: 'next' })}
        />
      }
      volume={
        <VolumeSlider
          value={vol}
          disabled={pb.device?.volume == null}
          onChange={(v) => {
            setVolume(v)
            window.clearTimeout(volumeTimer.current)
            volumeTimer.current = window.setTimeout(() => {
              void send({ type: 'volume', percent: v * 100 })
              setVolume(null)
            }, 250)
          }}
        />
      }
    />
  )
}
