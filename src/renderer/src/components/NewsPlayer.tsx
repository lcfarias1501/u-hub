import { ChevronsLeft, ChevronsRight, Download, Gauge, Loader2, Mic2, Pause, Play, SkipBack, SkipForward, Square } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSettings } from '@renderer/lib/settings'
import { isNovelty, isQuality, speech, useSpeech, voices as listVoices } from '@renderer/lib/speech'
import { SpeakingBars } from '@renderer/views/NewsView'

const RATES = [0.8, 1, 1.15, 1.3, 1.5, 1.75, 2]
const VOICE_LANGS = ['pt', 'en', 'es']

/**
 * "Now reading" bar under the whole app while news are read aloud, so listening
 * continues on other screens. Always mounted: it also feeds speed/voice to the engine.
 */
export function NewsPlayer({ onOpen }: { onOpen: () => void }) {
  const sp = useSpeech()
  const { settings, update } = useSettings()
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => listVoices())

  useEffect(() => speech.configure(settings.newsRate, settings.newsVoice), [settings.newsRate, settings.newsVoice])
  useEffect(() => {
    const load = (): void => setVoices(listVoices())
    speechSynthesis.addEventListener('voiceschanged', load)
    return () => speechSynthesis.removeEventListener('voiceschanged', load)
  }, [])
  // Leaving the app mid-sentence would keep talking from a closed window.
  useEffect(() => {
    const stop = (): void => speech.stop()
    window.addEventListener('beforeunload', stop)
    return () => window.removeEventListener('beforeunload', stop)
  }, [])

  const track = sp.tracks[sp.index]
  if (sp.status === 'idle' || !track) return null

  const textBlocks = sp.article?.blocks.filter((b) => b.kind !== 'img').length ?? 0
  const blocksBefore = sp.article ? sp.article.blocks.slice(0, Math.max(0, sp.block)).filter((b) => b.kind !== 'img').length : 0
  const within = track.full && textBlocks ? blocksBefore / textBlocks : sp.block >= 0 ? 0.5 : 0
  const progress = ((sp.index + within) / sp.tracks.length) * 100
  const usable = voices
    .filter((v) => VOICE_LANGS.some((l) => v.lang.toLowerCase().startsWith(l)) && !isNovelty(v))
    .sort((a, b) => a.lang.localeCompare(b.lang) || Number(isQuality(b)) - Number(isQuality(a)) || a.name.localeCompare(b.name))
  const hasQuality = usable.some((v) => isQuality(v) && v.lang.toLowerCase().startsWith('pt'))
  const nextRate = RATES[(RATES.indexOf(settings.newsRate) + 1) % RATES.length] ?? 1

  return (
    <div className="animate-rise relative flex h-14 shrink-0 items-center gap-4 border-t border-volt/20 bg-raised/95 px-4 backdrop-blur">
      <div className="absolute inset-x-0 top-0 h-px bg-white/[0.04]">
        <div className="h-full bg-volt transition-[width] duration-700" style={{ width: `${progress}%` }} />
      </div>

      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left" title="Abrir em Notícias">
        <div className="relative h-9 w-14 shrink-0 overflow-hidden rounded-[2px] bg-white/[0.05]">
          {track.item.image && <img src={track.item.image} alt="" className="size-full object-cover opacity-70" />}
          <div className="absolute inset-0 grid place-items-center bg-black/40">
            {sp.status === 'loading' ? <Loader2 className="size-3.5 animate-spin text-volt-100" /> : <SpeakingBars paused={sp.status === 'paused'} />}
          </div>
        </div>
        <div className="min-w-0">
          <div className="font-mono text-[9px] tracking-wider text-volt-soft uppercase">
            {sp.status === 'paused' ? 'Pausado' : sp.status === 'loading' ? 'Preparando' : track.full ? 'Lendo matéria' : 'Manchetes'}
            {sp.tracks.length > 1 && ` · ${sp.index + 1}/${sp.tracks.length}`} · {track.item.source}
          </div>
          <div className="truncate text-[13px] text-zinc-100">{track.item.title}</div>
          {sp.error && <div className="truncate font-mono text-[9px] text-zinc-500">{sp.error}</div>}
        </div>
      </button>

      <div className="flex items-center gap-1">
        <button className="icon-btn" onClick={() => speech.prev()} title="Notícia anterior (ou início desta)">
          <SkipBack className="size-4" fill="currentColor" />
        </button>
        <button className="icon-btn" onClick={() => speech.prevBlock()} disabled={sp.status === 'loading'} title="Parágrafo anterior">
          <ChevronsLeft className="size-4" />
        </button>
        <button
          className="mx-1 grid size-9 place-items-center rounded-full bg-volt text-white transition-transform hover:scale-105 active:scale-95 disabled:opacity-60"
          onClick={() => speech.toggle()}
          disabled={sp.status === 'loading'}
          title={sp.status === 'paused' ? 'Continuar' : 'Pausar'}
        >
          {sp.status === 'paused' ? <Play className="size-4 translate-x-px" fill="currentColor" /> : <Pause className="size-4" fill="currentColor" />}
        </button>
        <button className="icon-btn" onClick={() => speech.nextBlock()} disabled={sp.status === 'loading' || !speech.canSkipBlock} title="Próximo parágrafo">
          <ChevronsRight className="size-4" />
        </button>
        <button className="icon-btn" onClick={() => speech.next()} disabled={sp.index + 1 >= sp.tracks.length} title="Próxima notícia">
          <SkipForward className="size-4" fill="currentColor" />
        </button>
        <button className="icon-btn ml-1" onClick={() => speech.stop()} title="Parar">
          <Square className="size-3.5" fill="currentColor" />
        </button>
      </div>

      <div className="flex flex-1 items-center justify-end gap-2">
        <button className="btn h-8 font-mono" onClick={() => update({ newsRate: nextRate })} title="Velocidade da leitura">
          <Gauge className="size-3.5" /> {settings.newsRate.toLocaleString('pt-BR')}×
        </button>
        <label className="relative flex items-center" title="Voz">
          <Mic2 className="pointer-events-none absolute left-2.5 size-3.5 text-zinc-500" />
          <select
            className="field h-8 w-44 cursor-pointer pl-8 text-[12px]"
            value={settings.newsVoice ?? ''}
            onChange={(e) => update({ newsVoice: e.target.value || null })}
          >
            <option value="">Automática</option>
            {usable.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name.replace(/\s*\([^()]*\([^()]*\)\)$/, '')} · {v.lang}
                {isQuality(v) ? ' ★' : ''}
              </option>
            ))}
          </select>
        </label>
        {!hasQuality && (
          <button className="icon-btn" onClick={() => void window.uhub.news.voiceSettings()} title="Baixar vozes mais naturais no sistema">
            <Download className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
