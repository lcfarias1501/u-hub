import { Bookmark, BookmarkCheck, Check, ExternalLink, Eye, Loader2, Play, Search, SkipForward, Star, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Episode, TitleDetails, TitleSummary, TitleVideo, WatchProvider } from '@shared/types'
import { usePersistentState } from '@renderer/hooks/usePersistentState'
import { audioEngine } from '@renderer/lib/audioEngine'
import { speech } from '@renderer/lib/speech'
import { Poster, RatingBadge, runtimeLabel, Shelf, typeLabel, type Watchlist } from './shared'

const embed = (key: string): string =>
  `https://www.youtube-nocookie.com/embed/${key}?autoplay=1&rel=0&modestbranding=1&hl=pt-BR&cc_lang_pref=pt&playsinline=1`

export function Details({ title, onOpen, onClose, wl }: { title: TitleSummary; onOpen: (t: TitleSummary) => void; onClose: () => void; wl: Watchlist }) {
  const [d, setD] = useState<TitleDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState<TitleVideo | null>(null)
  const [mine] = usePersistentState('myProviders', [])
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    setD(null)
    setError(null)
    setPlaying(null)
    scroller.current?.scrollTo({ top: 0 })
    window.uhub.movies.details(title.type, title.id).then(
      (x) => alive && setD(x),
      (e: Error) => alive && setError(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    )
    return () => {
      alive = false
    }
  }, [title.type, title.id])

  // A trailer with sound: lower the radio and pause the news reading meanwhile.
  useEffect(() => {
    if (!playing) return
    speech.pause()
    audioEngine.duck(true)
    return () => audioEngine.duck(false)
  }, [playing])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (playing) setPlaying(null)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [playing, onClose])

  const t = d ?? title
  const item = wl.get(t)

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm">
      {/* Clicking the dimmed area closes; clicks on the scrollbar (beyond clientWidth) don't. */}
      <div
        ref={scroller}
        className="h-full overflow-y-auto px-6 py-8"
        onMouseDown={(e) => e.target === e.currentTarget && e.nativeEvent.offsetX < e.currentTarget.clientWidth && onClose()}
      >
        <article className="panel animate-rise mx-auto max-w-5xl overflow-hidden !bg-raised" onMouseDown={(e) => e.stopPropagation()}>
          {/* Hero: backdrop, or the trailer playing in its place */}
          <div className="relative">
            {playing ? (
              <div className="aspect-video bg-black">
                <iframe
                  key={playing.key}
                  src={embed(playing.key)}
                  title={playing.name}
                  className="size-full"
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              </div>
            ) : (
              <div className="relative aspect-[21/9] bg-white/[0.03]">
                {t.backdrop && <img src={t.backdrop} alt="" className="size-full object-cover" />}
                <div className="absolute inset-0 bg-gradient-to-t from-raised via-raised/40 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-r from-raised/80 via-transparent to-transparent" />
                {d?.trailer && (
                  <button
                    onClick={() => setPlaying(d.trailer)}
                    className="group absolute top-1/2 left-1/2 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/30 bg-black/50 backdrop-blur transition-transform hover:scale-110"
                    aria-label="Ver trailer"
                  >
                    <Play className="size-7 translate-x-0.5 text-white" fill="currentColor" />
                  </button>
                )}
              </div>
            )}
            <button className="icon-btn absolute top-3 right-3 !bg-black/60 !text-zinc-100" onClick={playing ? () => setPlaying(null) : onClose} aria-label={playing ? 'Fechar trailer' : 'Fechar'}>
              <X className="size-4" />
            </button>
          </div>

          {playing && d && (
            // Some trailers are blocked by their uploader in certain countries; TMDB can't know that in advance.
            <div className="flex items-center gap-3 border-b border-white/[0.06] bg-black/40 px-8 py-2 text-[11px] text-zinc-500">
              <span className="truncate">{playing.name}</span>
              <span className="ml-auto shrink-0">Não carregou?</span>
              {d.videos.length > 1 && (
                <button
                  className="flex shrink-0 items-center gap-1 text-zinc-300 hover:text-volt-100"
                  onClick={() => setPlaying(d.videos[(d.videos.findIndex((v) => v.key === playing.key) + 1) % d.videos.length])}
                >
                  <SkipForward className="size-3" /> Próximo vídeo
                </button>
              )}
              <a className="flex shrink-0 items-center gap-1 text-zinc-300 hover:text-volt-100" href={`https://www.youtube.com/watch?v=${playing.key}`} target="_blank" rel="noreferrer">
                <ExternalLink className="size-3" /> Abrir no YouTube
              </a>
            </div>
          )}

          <div className={`relative flex gap-6 px-8 ${playing ? 'pt-6' : '-mt-28'}`}>
            {!playing && <Poster src={t.poster} title={t.title} className="aspect-[2/3] w-40 shrink-0 rounded-[4px] border border-white/10 shadow-2xl" />}
            <div className="min-w-0 flex-1 self-end">
              <div className="eyebrow mb-1 text-volt-soft">{typeLabel(t.type)}</div>
              <h1 className="text-[30px] leading-tight font-semibold tracking-tight text-zinc-50">{t.title}</h1>
              {t.originalTitle && t.originalTitle !== t.title && <div className="text-[13px] text-zinc-500">{t.originalTitle}</div>}
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-zinc-400">
                {t.year && <span>{t.year}</span>}
                {d?.certification && <Certification value={d.certification} />}
                {d && runtimeLabel(d.runtime, t.type) && <span>{runtimeLabel(d.runtime, t.type)}</span>}
                {d && t.type === 'tv' && d.seasons.filter((s) => s.number > 0).length > 0 && <span>{d.seasons.filter((s) => s.number > 0).length === 1 ? '1 temporada' : `${d.seasons.filter((s) => s.number > 0).length} temporadas`}</span>}
                <RatingBadge value={t.rating} />
                {d?.genres.map((g) => (
                  <span key={g.id} className="rounded-full border border-white/10 px-2 py-0.5 font-sans text-[11px] text-zinc-300">
                    {g.name}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 px-8 pt-5">
            {d?.trailer ? (
              <button className="btn btn-volt h-9" onClick={() => setPlaying(d.trailer)}>
                <Play className="size-3.5" fill="currentColor" /> Trailer
              </button>
            ) : (
              d && (
                <a className="btn h-9" href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${t.title} ${t.year ?? ''} trailer`)}`} target="_blank" rel="noreferrer">
                  <Search className="size-3.5" /> Procurar trailer no YouTube
                </a>
              )
            )}
            <button className={`btn h-9 ${item?.status === 'want' ? '!border-volt/50 !text-volt-100' : ''}`} onClick={() => wl.toggleWant(t)}>
              {item?.status === 'want' ? <BookmarkCheck className="size-3.5" /> : <Bookmark className="size-3.5" />}
              {item?.status === 'want' ? 'Na sua lista' : 'Quero ver'}
            </button>
            <button className={`btn h-9 ${item?.status === 'watched' ? '!border-acid/50 !text-emerald-200' : ''}`} onClick={() => wl.setWatched(t, item?.status !== 'watched')}>
              {item?.status === 'watched' ? <Check className="size-3.5" /> : <Eye className="size-3.5" />}
              {item?.status === 'watched' ? 'Já vi' : 'Marcar como visto'}
            </button>
            {item?.status === 'watched' && <MyStars value={item.myRating} onChange={(v) => wl.rate(item.key, v)} />}
            <div className="ml-auto flex gap-1.5">
              {d?.imdbId && (
                <a className="btn h-9" href={`https://www.imdb.com/title/${d.imdbId}/`} target="_blank" rel="noreferrer">
                  IMDb <ExternalLink className="size-3" />
                </a>
              )}
              <a className="btn h-9" href={`https://www.themoviedb.org/${t.type}/${t.id}`} target="_blank" rel="noreferrer">
                TMDB <ExternalLink className="size-3" />
              </a>
            </div>
          </div>

          {error ? (
            <p className="px-8 py-10 text-[13px] text-amber-200/80">{error}</p>
          ) : !d ? (
            <div className="flex items-center gap-2 px-8 py-10 text-[12px] text-zinc-500">
              <Loader2 className="size-4 animate-spin" /> Carregando…
            </div>
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)_240px] gap-8 px-8 pt-6 pb-8">
              <div className="min-w-0 space-y-8">
                <section>
                  {d.tagline && <p className="mb-2 text-[14px] text-zinc-300 italic">“{d.tagline}”</p>}
                  <p className="text-[14px] leading-relaxed text-zinc-300">{d.overview || 'Sem sinopse em português.'}</p>
                </section>

                <WhereToWatch d={d} mine={mine} />

                {t.type === 'tv' && d.seasons.length > 0 && <Seasons id={d.id} seasons={d.seasons} />}

                {d.videos.length > 1 && (
                  <Section title="Vídeos">
                    <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
                      {d.videos.map((v) => (
                        <button
                          key={v.key}
                          onClick={() => {
                            setPlaying(v)
                            scroller.current?.scrollTo({ top: 0, behavior: 'smooth' })
                          }}
                          className="group w-52 shrink-0 text-left"
                        >
                          <div className="relative aspect-video overflow-hidden rounded-[3px] border border-white/[0.06] bg-black">
                            <img src={`https://i.ytimg.com/vi/${v.key}/mqdefault.jpg`} alt="" loading="lazy" className="size-full object-cover opacity-80 transition-opacity group-hover:opacity-100" />
                            <Play className="absolute top-1/2 left-1/2 size-6 -translate-x-1/2 -translate-y-1/2 text-white drop-shadow" fill="currentColor" />
                            {v.lang === 'pt' && <span className="absolute top-1.5 left-1.5 rounded-[2px] bg-black/70 px-1 font-mono text-[9px] text-zinc-200">PT</span>}
                          </div>
                          <div className="mt-1 line-clamp-2 text-[11px] text-zinc-400 group-hover:text-zinc-200">{v.name}</div>
                        </button>
                      ))}
                    </div>
                  </Section>
                )}

                {d.cast.length > 0 && (
                  <Section title="Elenco">
                    <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
                      {d.cast.map((c) => (
                        <div key={c.id} className="w-24 shrink-0">
                          <Poster src={c.photo} title={c.name} className="aspect-[2/3] rounded-[3px] border border-white/[0.06]" />
                          <div className="mt-1 line-clamp-1 text-[11px] text-zinc-200">{c.name}</div>
                          <div className="line-clamp-1 text-[10px] text-zinc-500">{c.role}</div>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}
              </div>

              <aside className="space-y-4 text-[12px]">
                <Fact label={t.type === 'movie' ? 'Direção' : 'Criação'} value={d.makers.join(', ')} />
                <Fact label={t.type === 'movie' ? 'Lançamento' : 'Estreia'} value={d.releaseDate ? new Date(`${d.releaseDate}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }) : ''} />
                <Fact label="Situação" value={STATUS[d.status ?? ''] ?? d.status ?? ''} />
                <Fact label="Avaliação TMDB" value={d.votes ? `${d.rating.toFixed(1).replace('.', ',')} de 10 · ${d.votes.toLocaleString('pt-BR')} votos` : ''} />
              </aside>

              {d.recommendations.length > 0 && (
                <div className="col-span-2">
                  <Shelf title="Se você gostou, veja também" items={d.recommendations} onOpen={onOpen} wl={wl} />
                </div>
              )}
            </div>
          )}
        </article>
      </div>
    </div>
  )
}

const STATUS: Record<string, string> = {
  Released: 'Lançado',
  'Post Production': 'Em pós-produção',
  'In Production': 'Em produção',
  Planned: 'Planejado',
  Rumored: 'Rumor',
  Canceled: 'Cancelado',
  'Returning Series': 'Em exibição (renovada)',
  Ended: 'Encerrada'
}

/** Brazilian age-rating colours (ClassInd): L green, 10 blue, 12 yellow, 14 orange, 16 red, 18 black. */
function Certification({ value }: { value: string }) {
  const tone: Record<string, string> = {
    L: 'bg-emerald-600 text-white',
    '10': 'bg-sky-600 text-white',
    '12': 'bg-yellow-400 text-black',
    '14': 'bg-orange-500 text-white',
    '16': 'bg-red-600 text-white',
    '18': 'bg-black text-white border border-white/30'
  }
  return <span className={`rounded-[3px] px-1.5 py-0.5 font-sans text-[10px] font-bold ${tone[value] ?? 'border border-white/20 text-zinc-300'}`}>{value}</span>
}

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="eyebrow text-zinc-300">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div>
      <div className="eyebrow mb-0.5">{label}</div>
      <div className="text-zinc-300">{value}</div>
    </div>
  )
}

function MyStars({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const [hover, setHover] = useState<number | null>(null)
  const shown = hover ?? value ?? 0
  return (
    <div className="flex items-center gap-0.5 pl-1" onMouseLeave={() => setHover(null)} title="Sua nota">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} onMouseEnter={() => setHover(n)} onClick={() => onChange(value === n ? null : n)} aria-label={`${n} estrelas`}>
          <Star className={`size-4 ${n <= shown ? 'text-amber-300' : 'text-zinc-700'}`} fill={n <= shown ? 'currentColor' : 'none'} />
        </button>
      ))}
    </div>
  )
}

function WhereToWatch({ d, mine }: { d: TitleDetails; mine: number[] }) {
  const { flatrate, free, rent, buy, link } = d.providers
  const groups: [string, WatchProvider[]][] = [
    ['Streaming', flatrate],
    ['Grátis', free],
    ['Alugar', rent],
    ['Comprar', buy]
  ]
  const any = groups.some(([, l]) => l.length)
  const onMine = flatrate.filter((p) => mine.includes(p.id))
  return (
    <Section
      title="Onde assistir"
      action={
        link && (
          <a href={link} target="_blank" rel="noreferrer" className="ml-auto font-mono text-[10px] text-zinc-500 hover:text-volt-100">
            ver links <ExternalLink className="inline size-3" />
          </a>
        )
      }
    >
      {onMine.length > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-[3px] border border-acid/30 bg-acid/[0.07] px-3 py-2 text-[12px] text-emerald-200">
          <Check className="size-3.5" /> Está no seu {onMine.map((p) => p.name).join(' e no ')}.
        </div>
      )}
      {!any ? (
        <p className="text-[12px] text-zinc-500">Ainda não está disponível para assistir online na sua região.</p>
      ) : (
        <div className="space-y-3">
          {groups
            .filter(([, l]) => l.length)
            .map(([label, list]) => (
              <div key={label} className="flex items-start gap-3">
                <span className="w-20 shrink-0 pt-2 font-mono text-[10px] text-zinc-500 uppercase">{label}</span>
                <div className="flex flex-wrap gap-2">
                  {list.map((p) => (
                    <span
                      key={p.id}
                      title={p.name}
                      className={`flex items-center gap-2 rounded-[4px] border py-1 pr-2.5 pl-1 text-[12px] ${
                        mine.includes(p.id) ? 'border-acid/40 bg-acid/[0.08] text-zinc-100' : 'border-white/[0.08] bg-black/20 text-zinc-300'
                      }`}
                    >
                      {p.logo && <img src={p.logo} alt="" className="size-6 rounded-[3px]" />}
                      {p.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </Section>
  )
}

function Seasons({ id, seasons }: { id: number; seasons: TitleDetails['seasons'] }) {
  const [n, setN] = useState(seasons.find((s) => s.number > 0)?.number ?? seasons[0].number)
  const [eps, setEps] = useState<Episode[] | null>(null)
  useEffect(() => {
    let alive = true
    setEps(null)
    window.uhub.movies.season(id, n).then((e) => alive && setEps(e), () => alive && setEps([]))
    return () => {
      alive = false
    }
  }, [id, n])

  return (
    <Section title="Temporadas">
      <div className="mb-3 flex flex-wrap gap-1">
        {seasons.map((s) => (
          <button
            key={s.number}
            onClick={() => setN(s.number)}
            className={`h-7 rounded-[3px] border px-2.5 text-[11px] transition-colors ${
              n === s.number ? 'border-volt/50 bg-volt/15 text-volt-100' : 'border-white/[0.08] text-zinc-400 hover:text-zinc-100'
            }`}
            title={`${s.episodes} episódios${s.year ? ` · ${s.year}` : ''}`}
          >
            {s.number === 0 ? 'Especiais' : `T${s.number}`}
          </button>
        ))}
      </div>
      {!eps ? (
        <div className="flex items-center gap-2 text-[12px] text-zinc-500">
          <Loader2 className="size-3.5 animate-spin" /> Carregando episódios…
        </div>
      ) : (
        <ol className="max-h-[420px] space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin]">
          {eps.map((e) => (
            <li key={e.number} className="flex gap-3 rounded-[3px] border border-white/[0.05] bg-black/20 p-2">
              <div className="aspect-video w-36 shrink-0 overflow-hidden rounded-[2px] bg-white/[0.04]">{e.still && <img src={e.still} alt="" loading="lazy" className="size-full object-cover" />}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[10px] text-volt-soft">E{e.number}</span>
                  <span className="truncate text-[13px] text-zinc-100">{e.name}</span>
                  <span className="ml-auto shrink-0 font-mono text-[10px] text-zinc-500">
                    {[e.runtime ? `${e.runtime}min` : null, e.airDate ? new Date(`${e.airDate}T12:00:00`).toLocaleDateString('pt-BR') : null].filter(Boolean).join(' · ')}
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-zinc-500">{e.overview || 'Sem sinopse.'}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Section>
  )
}

