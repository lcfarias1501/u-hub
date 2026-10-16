import { Pause, Play, Plus, Radio, Square, Trash2, Volume1, Volume2, VolumeX, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { RadioStation, SpotifyPlaylist } from '@shared/types'
import { Panel } from '@renderer/components/Panel'
import { usePersistentState } from '@renderer/hooks/usePersistentState'
import { audioEngine, useAudio } from '@renderer/lib/audioEngine'
import { uid } from '@renderer/lib/format'
import { withAlpha } from '@renderer/lib/theme'
import { PageHeader } from './PageHeader'
import { SpotifyPanel } from './SpotifyPanel'

export function MediaView() {
  return (
    <div className="animate-rise flex h-full flex-col p-6">
      <PageHeader index="03" title="Media & Audio" subtitle="Rádios lofi/synthwave · Spotify" />
      <div className="grid min-h-0 flex-1 grid-cols-[1.25fr_1fr] gap-4">
        <RadioDeck />
        <SpotifyPanel embed={<SpotifyEmbed />} />
      </div>
    </div>
  )
}

// ── Radio ────────────────────────────────────────────────────────────────────

function RadioDeck() {
  const audio = useAudio()
  const [stations, setStations] = usePersistentState('stations', [])
  const [volume, setVolume, volumeReady] = usePersistentState('volume', 0.6)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    if (volumeReady) audioEngine.setVolume(volume)
  }, [volume, volumeReady])

  const VolIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2

  return (
    <Panel title="Rádio Embutido" icon={<Radio />} meta={audio.playing ? <span className="text-acid-soft">● LIVE</span> : 'IDLE'} hover={false} bodyClassName="flex flex-col">
      {/* Deck */}
      <div className="relative border-b border-white/[0.05] p-4">
        <Visualizer active={audio.playing} />
        <div className="relative flex items-end gap-4">
          <div className="min-w-0 flex-1">
            <div className="eyebrow mb-1">{audio.loading ? 'Sintonizando…' : audio.error ? 'Erro' : audio.playing ? 'Tocando agora' : 'Selecione uma estação'}</div>
            <div className="truncate text-[22px] font-semibold text-zinc-50">{audio.station?.name ?? '—'}</div>
            <div className={`font-mono text-[11px] ${audio.error ? 'text-rose-300' : 'text-zinc-500'}`}>{audio.error ?? audio.station?.genre ?? 'Sem sinal'}</div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              className="grid size-11 place-items-center rounded-full border border-volt/50 bg-volt/20 text-white transition-all duration-200 hover:scale-105 hover:shadow-[0_0_28px_-4px_var(--color-volt)] active:scale-95 disabled:opacity-40"
              disabled={!audio.station}
              onClick={() => audioEngine.toggle()}
              aria-label={audio.playing ? 'Pausar' : 'Tocar'}
            >
              {audio.playing ? <Pause className="size-4" /> : <Play className="ml-0.5 size-4" />}
            </button>
            <button className="icon-btn size-9" disabled={!audio.station} onClick={() => audioEngine.stop()} aria-label="Parar">
              <Square className="size-3.5" />
            </button>
          </div>
        </div>
        <div className="relative mt-4 flex items-center gap-3">
          <button className="icon-btn" onClick={() => setVolume(volume === 0 ? 0.6 : 0)} aria-label="Mudo">
            <VolIcon className="size-4" />
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="h-1 flex-1 cursor-pointer appearance-none rounded-none bg-white/10 accent-volt"
            style={{ background: `linear-gradient(90deg, var(--color-volt) ${volume * 100}%, rgba(255,255,255,0.08) ${volume * 100}%)` }}
          />
          <span className="w-9 text-right font-mono text-[11px] text-zinc-400 tabular-nums">{Math.round(volume * 100)}</span>
        </div>
      </div>

      {/* Station list */}
      <div className="flex items-center px-4 pt-3 pb-2">
        <span className="eyebrow">Estações · {stations.length}</span>
        <button className="btn ml-auto h-7" onClick={() => setAdding((a) => !a)}>
          {adding ? <X className="size-3" /> : <Plus className="size-3" />} Stream
        </button>
      </div>
      {adding && (
        <AddStation
          onAdd={(s) => {
            setStations([...stations, s])
            setAdding(false)
          }}
        />
      )}
      <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {stations.map((s, i) => {
          const current = audio.station?.id === s.id
          return (
            <li key={s.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => void (current && audio.playing ? audioEngine.pause() : audioEngine.play(s))}
                className={`group flex h-11 cursor-pointer items-center gap-3 rounded-[3px] px-2 transition-all duration-150 ${
                  current ? 'bg-volt/10 text-white' : 'text-zinc-400 hover:translate-x-0.5 hover:bg-white/[0.03] hover:text-zinc-100'
                }`}
              >
                <span className="w-5 font-mono text-[10px] text-zinc-600">{String(i + 1).padStart(2, '0')}</span>
                <span className="grid size-6 place-items-center">
                  {current && audio.playing ? <EqBars /> : <Play className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />}
                </span>
                <span className="flex-1 truncate text-[13px]">{s.name}</span>
                <span className="font-mono text-[10px] text-zinc-600">{s.genre}</span>
                {s.custom && (
                  <button
                    className="icon-btn size-6 opacity-0 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (current) audioEngine.stop()
                      setStations(stations.filter((x) => x.id !== s.id))
                    }}
                    aria-label="Remover estação"
                  >
                    <Trash2 className="size-3" />
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

function AddStation({ onAdd }: { onAdd: (s: RadioStation) => void }) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const valid = name.trim() && /^https?:\/\//.test(url.trim())
  return (
    <form
      className="mx-4 mb-2 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) onAdd({ id: uid(), name: name.trim(), url: url.trim(), genre: 'Custom', custom: true })
      }}
    >
      <input autoFocus className="field h-8 w-36" placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} />
      <input className="field h-8 flex-1" placeholder="https://stream…/radio.mp3" value={url} onChange={(e) => setUrl(e.target.value)} />
      <button className="btn btn-volt" disabled={!valid}>
        Add
      </button>
    </form>
  )
}

function EqBars() {
  return (
    <span className="flex h-3 items-end gap-[2px]">
      {[0, 0.2, 0.4].map((d) => (
        <span key={d} className="w-[3px] bg-acid" style={{ animation: `eq 0.9s ${d}s ease-in-out infinite alternate`, height: '40%' }} />
      ))}
      <style>{'@keyframes eq{to{height:100%}}'}</style>
    </span>
  )
}

/** Mirrored frequency bars drawn from the shared AnalyserNode. Idles as a flat line when nothing plays. */
function Visualizer({ active }: { active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    let raf = 0
    let idle = 0
    let data = new Uint8Array(0)

    const paint = (w: number, h: number): void => {
      const dpr = window.devicePixelRatio
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr
        canvas.height = h * dpr
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      const analyser = audioEngine.analyser
      const bars = 64
      if (analyser && active) {
        if (data.length !== analyser.frequencyBinCount) data = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteFrequencyData(data)
      }
      const bw = w / bars
      const grad = ctx.createLinearGradient(0, 0, w, 0)
      // Read the live accent so the visualizer follows Settings → Aparência.
      const volt = getComputedStyle(document.documentElement).getPropertyValue('--color-volt').trim() || '#8b5cf6'
      grad.addColorStop(0, withAlpha(volt, 0.55))
      grad.addColorStop(1, 'rgba(16,185,129,0.45)')
      ctx.fillStyle = grad
      for (let i = 0; i < bars; i++) {
        // Skip the top of the spectrum: streams rarely carry energy there.
        const v = active && data.length ? data[Math.floor((i / bars) * data.length * 0.7)] / 255 : 0
        const bh = Math.max(1, v * h * 0.9)
        ctx.fillRect(i * bw + 1, h - bh, bw - 2, bh)
      }
    }

    // Animate only while audio plays and the tab is on screen. While the Media tab is
    // hidden the canvas measures 0, so we just check back twice a second instead of
    // spinning requestAnimationFrame for nothing.
    const tick = (): void => {
      const { clientWidth: w, clientHeight: h } = canvas
      if (!w || !h) {
        idle = window.setTimeout(tick, 500)
        return
      }
      paint(w, h)
      if (active) raf = requestAnimationFrame(tick)
    }
    tick()
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(idle)
    }
  }, [active])

  // Canvas is a replaced element and won't stretch via inset, so it fills a positioned wrapper instead.
  return (
    <div className="pointer-events-none absolute inset-x-4 bottom-14 h-20 opacity-60">
      <canvas ref={ref} className="block size-full" />
    </div>
  )
}

// ── Spotify ──────────────────────────────────────────────────────────────────

const SPOTIFY_TYPES = ['playlist', 'album', 'track', 'artist', 'show', 'episode']

/** Accepts open.spotify.com links or spotify: URIs and normalises them to a `spotify:type:id` URI. */
function parseSpotify(input: string): string | null {
  const s = input.trim()
  const uri = s.match(/^spotify:(\w+):([A-Za-z0-9]+)$/)
  if (uri && SPOTIFY_TYPES.includes(uri[1])) return s
  const url = s.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(\w+)\/([A-Za-z0-9]+)/)
  if (url && SPOTIFY_TYPES.includes(url[1])) return `spotify:${url[1]}:${url[2]}`
  return null
}

const embedUrl = (uri: string): string => {
  const [, type, id] = uri.split(':')
  return `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0`
}

function SpotifyEmbed() {
  const [playlists, setPlaylists] = usePersistentState('playlists', [])
  const [current, setCurrent] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [name, setName] = useState('')
  const parsed = parseSpotify(input)
  const active = playlists.find((p) => p.id === current) ?? playlists[0]

  const add = (): void => {
    if (!parsed) return
    const p: SpotifyPlaylist = { id: uid(), name: name.trim() || parsed.split(':')[1], uri: parsed }
    setPlaylists([...playlists, p])
    setCurrent(p.id)
    setInput('')
    setName('')
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap gap-1">
        {playlists.map((p) => (
          <span
            key={p.id}
            className={`group flex h-7 items-center gap-1 rounded-[3px] border pr-1 pl-2.5 text-[12px] transition-all ${
              active?.id === p.id ? 'border-acid/40 bg-acid/10 text-emerald-100' : 'border-white/[0.06] text-zinc-500 hover:text-zinc-200'
            }`}
          >
            <button onClick={() => setCurrent(p.id)}>{p.name}</button>
            <button
              className="grid size-5 place-items-center rounded-[2px] opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white/10"
              onClick={() => setPlaylists(playlists.filter((x) => x.id !== p.id))}
              aria-label="Remover"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
      </div>

      <div className="min-h-[352px] flex-1 overflow-hidden rounded-[3px] border border-white/[0.06] bg-black/30">
        {active ? (
          <iframe
            key={active.uri}
            title={active.name}
            src={embedUrl(active.uri)}
            className="h-full min-h-[352px] w-full"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
          />
        ) : (
          <div className="grid h-full place-items-center font-mono text-[12px] text-zinc-600">Adicione uma playlist abaixo</div>
        )}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <input className="field h-8 w-32" placeholder="Apelido" value={name} onChange={(e) => setName(e.target.value)} />
        <input
          className={`field h-8 flex-1 ${input && !parsed ? '!border-crit/50' : ''}`}
          placeholder="Link ou URI do Spotify (playlist, álbum, faixa…)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button className="btn btn-volt" disabled={!parsed}>
          <Plus className="size-3.5" />
        </button>
      </form>
    </div>
  )
}
