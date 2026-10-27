import { Bookmark, Check, Clapperboard, Compass, Dices, Home, Info, Loader2, Play, Search, Settings2, Tv, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { DiscoverQuery, Genre, MediaType, MoviesHome, MoviesStatus, TitlePage, TitleSummary, WatchItem, WatchProvider } from '@shared/types'
import { Modal } from '@renderer/components/Modal'
import { usePersistentState } from '@renderer/hooks/usePersistentState'
import { PageHeader } from '../PageHeader'
import { Details } from './Details'
import { Attribution, Grid, GridSkeleton, RatingBadge, Shelf, TitleCard, useWatchlist, type Watchlist } from './shared'

type Tab = 'home' | 'explore' | 'list'

const errText = (e: unknown): string => (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

export function MoviesView() {
  const [status, setStatus] = useState<MoviesStatus | null>(null)
  const [tab, setTab] = useState<Tab>('home')
  const [open, setOpen] = useState<TitleSummary | null>(null)
  const [query, setQuery] = useState('')
  const [managing, setManaging] = useState(false)
  const [surprising, setSurprising] = useState(false)
  const [explore, setExplore] = useState<DiscoverQuery>(DEFAULT_QUERY)
  const wl = useWatchlist()

  useEffect(() => {
    void window.uhub.movies.status().then(setStatus)
  }, [])

  /** "Me surpreenda": a random well-liked title matching the Explorar filters. */
  const surprise = async (): Promise<void> => {
    setSurprising(true)
    try {
      const q: DiscoverQuery = { ...explore, minRating: explore.minRating ?? 6.5, sort: 'popular', page: 1 }
      const first = await window.uhub.movies.discover(q)
      const pages = Math.min(first.totalPages, 15)
      const pick = pages > 1 ? await window.uhub.movies.discover({ ...q, page: 1 + Math.floor(Math.random() * pages) }) : first
      const seen = new Set(wl.list.filter((w) => w.status === 'watched').map((w) => w.key))
      const pool = pick.items.filter((t) => !seen.has(`${t.type}:${t.id}`))
      const t = (pool.length ? pool : pick.items)[Math.floor(Math.random() * (pool.length || pick.items.length))]
      if (t) setOpen(t)
    } finally {
      setSurprising(false)
    }
  }

  if (!status) return null
  if (!status.configured) {
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="panel max-w-md px-8 py-10 text-center">
          <Clapperboard className="mx-auto mb-3 size-9 text-zinc-600" strokeWidth={1.4} />
          <p className="text-[13px] text-zinc-400">Filmes & Séries precisa de um token do TMDB, que não veio nesta versão do app.</p>
        </div>
      </div>
    )
  }

  const want = wl.list.filter((w) => w.status === 'want').length

  return (
    <div className="animate-rise p-6">
      <PageHeader index="09" title="Filmes & Séries" subtitle="O que assistir · trailers · onde passa">
        <div className="relative w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-zinc-600" />
          <input className="field pr-8 pl-9" placeholder="Buscar filme ou série…" value={query} onChange={(e) => setQuery(e.target.value)} />
          {query && (
            <button className="icon-btn absolute top-1/2 right-1 size-6 -translate-y-1/2" onClick={() => setQuery('')} aria-label="Limpar busca">
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <button className="btn" onClick={() => void surprise()} disabled={surprising} title="Sorteia um título bem avaliado com os filtros de Explorar">
          {surprising ? <Loader2 className="size-3.5 animate-spin" /> : <Dices className="size-3.5" />} Me surpreenda
        </button>
      </PageHeader>

      {!query.trim() && (
        <div className="mb-6 flex items-center gap-1 border-b border-white/[0.06]">
          <TabButton active={tab === 'home'} onClick={() => setTab('home')} icon={<Home />} label="Início" />
          <TabButton active={tab === 'explore'} onClick={() => setTab('explore')} icon={<Compass />} label="Explorar" />
          <TabButton active={tab === 'list'} onClick={() => setTab('list')} icon={<Bookmark />} label="Minha lista" badge={want || undefined} />
          <button className="btn mb-2 ml-auto h-8" onClick={() => setManaging(true)}>
            <Tv className="size-3.5" /> Meus streamings
          </button>
        </div>
      )}

      {query.trim() ? (
        <SearchResults query={query} onOpen={setOpen} wl={wl} />
      ) : tab === 'home' ? (
        <HomeTab onOpen={setOpen} wl={wl} onManage={() => setManaging(true)} />
      ) : tab === 'explore' ? (
        <ExploreTab q={explore} setQ={setExplore} onOpen={setOpen} wl={wl} />
      ) : (
        <ListTab wl={wl} onOpen={setOpen} />
      )}

      <Attribution />

      {open && <Details title={open} onOpen={setOpen} onClose={() => setOpen(null)} wl={wl} />}
      {managing && <ProvidersModal onClose={() => setManaging(false)} />}
    </div>
  )
}

function TabButton({ active, onClick, icon, label, badge }: { active: boolean; onClick: () => void; icon: ReactNode; label: string; badge?: number }) {
  return (
    <button
      onClick={onClick}
      className={`relative -mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-[13px] transition-colors [&>svg]:size-3.5 ${
        active ? 'border-volt text-zinc-50' : 'border-transparent text-zinc-500 hover:text-zinc-200'
      }`}
    >
      {icon}
      {label}
      {badge != null && <span className="rounded-full bg-volt/20 px-1.5 font-mono text-[10px] text-volt-100">{badge}</span>}
    </button>
  )
}

// ── Início ───────────────────────────────────────────────────────────────────

function HomeTab({ onOpen, wl, onManage }: { onOpen: (t: TitleSummary) => void; wl: Watchlist; onManage: () => void }) {
  const [home, setHome] = useState<MoviesHome | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mine] = usePersistentState('myProviders', [])
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    setError(null)
    window.uhub.movies.home().then(
      (h) => alive && setHome(h),
      (e) => alive && setError(errText(e))
    )
    return () => {
      alive = false
    }
  }, [mine.join(','), attempt])

  if (error && !home) return <Retry error={error} onRetry={() => setAttempt((n) => n + 1)} />
  if (!home) return <GridSkeleton n={14} />
  const hero = home.trending.find((t) => t.backdrop && t.overview)
  const heroItem = hero && wl.get(hero)

  return (
    <div>
      {hero && (
        <section className="relative mb-9 overflow-hidden rounded-[6px] border border-white/[0.06]">
          <img src={hero.backdrop!} alt="" className="absolute inset-0 size-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-void via-void/80 to-transparent" />
          <div className="relative max-w-xl px-8 py-12">
            <div className="eyebrow mb-2 text-volt-soft">Em alta esta semana · {hero.type === 'movie' ? 'Filme' : 'Série'}</div>
            <h2 className="text-[34px] leading-tight font-semibold tracking-tight text-white">{hero.title}</h2>
            <div className="mt-2 flex items-center gap-3 font-mono text-[11px] text-zinc-300">
              {hero.year && <span>{hero.year}</span>}
              <RatingBadge value={hero.rating} />
            </div>
            <p className="mt-3 line-clamp-3 text-[14px] leading-relaxed text-zinc-300">{hero.overview}</p>
            <div className="mt-5 flex gap-2">
              <button className="btn btn-volt h-10 px-4" onClick={() => onOpen(hero)}>
                <Play className="size-4" fill="currentColor" /> Trailer e detalhes
              </button>
              <button className="btn h-10 px-4" onClick={() => wl.toggleWant(hero)}>
                {heroItem?.status === 'want' ? <Check className="size-4" /> : <Bookmark className="size-4" />}
                {heroItem?.status === 'want' ? 'Na sua lista' : 'Quero ver'}
              </button>
            </div>
          </div>
        </section>
      )}
      <Shelf title="Em alta esta semana" items={home.trending.filter((t) => t !== hero)} onOpen={onOpen} wl={wl} />
      <Shelf
        title={mine.length ? 'Nos seus streamings' : 'Populares no streaming'}
        action={
          !mine.length && (
            <button className="font-mono text-[10px] text-zinc-500 hover:text-volt-100" onClick={onManage}>
              escolher meus streamings →
            </button>
          )
        }
        items={home.streaming}
        onOpen={onOpen}
        wl={wl}
      />
      <Shelf title="Nos cinemas" items={home.nowPlaying} onOpen={onOpen} wl={wl} />
      <Shelf title="Séries em alta" items={home.series} onOpen={onOpen} wl={wl} />
      <Shelf title="Os mais bem avaliados" items={home.topRated} onOpen={onOpen} wl={wl} />
    </div>
  )
}

function Retry({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="panel flex flex-col items-center gap-3 px-6 py-12 text-center">
      <p className="text-[13px] text-amber-200/80">{error}</p>
      <button className="btn" onClick={onRetry}>
        Tentar de novo
      </button>
    </div>
  )
}

// ── Busca ────────────────────────────────────────────────────────────────────

function SearchResults({ query, onOpen, wl }: { query: string; onOpen: (t: TitleSummary) => void; wl: Watchlist }) {
  const [res, setRes] = useState<TitlePage | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setLoading(true)
    setError(null)
    let alive = true
    const t = setTimeout(() => {
      window.uhub.movies.search(query).then(
        (r) => {
          if (!alive) return
          setRes(r)
          setLoading(false)
        },
        (e) => {
          if (!alive) return
          setError(errText(e))
          setLoading(false)
        }
      )
    }, 350)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [query])

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 text-[12px] text-zinc-500">
        {loading && <Loader2 className="size-3.5 animate-spin" />}
        {res && !loading && `${res.totalResults.toLocaleString('pt-BR')} resultado(s) para “${query.trim()}”`}
      </div>
      {error ? (
        <p className="text-[13px] text-amber-200/80">{error}</p>
      ) : res && !res.items.length && !loading ? <p className="text-[13px] text-zinc-500">Nada encontrado. Tente o título original, em inglês.</p> : res ? <Grid items={res.items} onOpen={onOpen} wl={wl} /> : <GridSkeleton />}
    </div>
  )
}

// ── Explorar ─────────────────────────────────────────────────────────────────

const DEFAULT_QUERY: DiscoverQuery = { type: 'movie', genres: [], runtimeMin: null, runtimeMax: null, providers: [], yearFrom: null, yearTo: null, minRating: null, sort: 'popular', page: 1 }

const RUNTIMES: Record<MediaType, { label: string; min: number | null; max: number | null }[]> = {
  movie: [
    { label: 'Até 1h30', min: null, max: 90 },
    { label: '1h30 – 2h', min: 90, max: 120 },
    { label: '2h – 2h30', min: 120, max: 150 },
    { label: 'Mais de 2h30', min: 150, max: null }
  ],
  tv: [
    { label: 'Até 30min por ep.', min: null, max: 30 },
    { label: '30 – 60min por ep.', min: 30, max: 60 },
    { label: 'Mais de 1h por ep.', min: 60, max: null }
  ]
}

const THIS_YEAR = new Date().getFullYear()
const PERIODS: { label: string; from: number | null; to: number | null }[] = [
  { label: 'Lançamentos', from: THIS_YEAR - 1, to: null },
  { label: 'Anos 2020', from: 2020, to: 2029 },
  { label: 'Anos 2010', from: 2010, to: 2019 },
  { label: 'Anos 2000', from: 2000, to: 2009 },
  { label: 'Anos 90', from: 1990, to: 1999 },
  { label: 'Clássicos', from: null, to: 1989 }
]

function ExploreTab({ q, setQ, onOpen, wl }: { q: DiscoverQuery; setQ: (q: DiscoverQuery) => void; onOpen: (t: TitleSummary) => void; wl: Watchlist }) {
  const [genres, setGenres] = useState<Genre[]>([])
  const [providers, setProviders] = useState<WatchProvider[]>([])
  const [mine] = usePersistentState('myProviders', [])
  const [items, setItems] = useState<TitleSummary[]>([])
  const [meta, setMeta] = useState<{ page: number; totalPages: number; total: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.uhub.movies.genres(q.type).then(setGenres)
  }, [q.type])
  useEffect(() => {
    void window.uhub.movies.providers().then(setProviders)
  }, [])

  const load = useCallback(
    async (page: number) => {
      setLoading(true)
      setError(null)
      try {
        const r = await window.uhub.movies.discover({ ...q, page })
        setItems((prev) => (page === 1 ? r.items : [...prev, ...r.items.filter((t) => !prev.some((p) => p.id === t.id))]))
        setMeta({ page: r.page, totalPages: r.totalPages, total: r.totalResults })
      } catch (e) {
        setError(errText(e))
      } finally {
        setLoading(false)
      }
    },
    [q]
  )
  useEffect(() => {
    void load(1)
  }, [load])

  const patch = (p: Partial<DiscoverQuery>): void => setQ({ ...q, ...p, page: 1 })
  const toggle = (list: number[], id: number): number[] => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  // Their services first, then the most popular ones in the region.
  const shownProviders = useMemo(() => {
    const top = providers.slice(0, 14)
    const extra = providers.filter((p) => mine.includes(p.id) && !top.includes(p))
    return [...extra, ...top].sort((a, b) => Number(mine.includes(b.id)) - Number(mine.includes(a.id)))
  }, [providers, mine])
  const onlyMine = mine.length > 0 && q.providers.length === mine.length && mine.every((id) => q.providers.includes(id))
  const runtime = RUNTIMES[q.type].find((r) => r.min === q.runtimeMin && r.max === q.runtimeMax)
  const period = PERIODS.find((p) => p.from === q.yearFrom && p.to === q.yearTo)
  const active = q.genres.length || runtime || q.providers.length || period || q.minRating

  return (
    <div className="grid grid-cols-[250px_minmax(0,1fr)] gap-7">
      <aside className="space-y-5">
        <div className="flex rounded-[4px] border border-white/[0.08] p-0.5">
          {(['movie', 'tv'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setQ({ ...DEFAULT_QUERY, type: t, providers: q.providers, sort: q.sort })}
              className={`flex-1 rounded-[3px] py-1.5 text-[12px] transition-colors ${q.type === t ? 'bg-volt/25 text-volt-100' : 'text-zinc-500 hover:text-zinc-200'}`}
            >
              {t === 'movie' ? 'Filmes' : 'Séries'}
            </button>
          ))}
        </div>

        <Filter label="Ordenar">
          {(
            [
              ['popular', 'Populares'],
              ['rating', 'Mais bem avaliados'],
              ['recent', 'Mais recentes']
            ] as const
          ).map(([v, l]) => (
            <Chip key={v} on={q.sort === v} onClick={() => patch({ sort: v })}>
              {l}
            </Chip>
          ))}
        </Filter>

        <Filter label="Onde assistir" action={mine.length > 0 && <Chip on={onlyMine} onClick={() => patch({ providers: onlyMine ? [] : mine })}>Só nos meus</Chip>}>
          {shownProviders.map((p) => (
            <button
              key={p.id}
              title={p.name}
              onClick={() => patch({ providers: toggle(q.providers, p.id) })}
              className={`relative size-9 overflow-hidden rounded-[6px] border transition-all ${
                q.providers.includes(p.id) ? 'border-volt ring-2 ring-volt/40' : 'border-white/10 opacity-60 grayscale hover:opacity-100 hover:grayscale-0'
              }`}
            >
              {p.logo ? <img src={p.logo} alt={p.name} className="size-full" /> : <span className="text-[9px]">{p.name}</span>}
              {mine.includes(p.id) && <span className="absolute right-0.5 bottom-0.5 size-2 rounded-full border border-black bg-acid" />}
            </button>
          ))}
        </Filter>

        <Filter label={q.type === 'movie' ? 'Duração' : 'Duração do episódio'}>
          {RUNTIMES[q.type].map((r) => (
            <Chip key={r.label} on={runtime === r} onClick={() => patch(runtime === r ? { runtimeMin: null, runtimeMax: null } : { runtimeMin: r.min, runtimeMax: r.max })}>
              {r.label}
            </Chip>
          ))}
        </Filter>

        <Filter label="Gêneros">
          {genres.map((g) => (
            <Chip key={g.id} on={q.genres.includes(g.id)} onClick={() => patch({ genres: toggle(q.genres, g.id) })}>
              {g.name}
            </Chip>
          ))}
        </Filter>

        <Filter label="Época">
          {PERIODS.map((p) => (
            <Chip key={p.label} on={period === p} onClick={() => patch(period === p ? { yearFrom: null, yearTo: null } : { yearFrom: p.from, yearTo: p.to })}>
              {p.label}
            </Chip>
          ))}
        </Filter>

        <Filter label="Nota mínima">
          {[6, 7, 8].map((n) => (
            <Chip key={n} on={q.minRating === n} onClick={() => patch({ minRating: q.minRating === n ? null : n })}>
              ★ {n}+
            </Chip>
          ))}
        </Filter>

        {active ? (
          <button className="btn w-full justify-center" onClick={() => setQ({ ...DEFAULT_QUERY, type: q.type })}>
            <X className="size-3.5" /> Limpar filtros
          </button>
        ) : null}
      </aside>

      <div className="min-w-0">
        <div className="mb-4 flex items-center gap-2 font-mono text-[11px] text-zinc-500">
          {meta && `${meta.total.toLocaleString('pt-BR')} ${q.type === 'movie' ? 'filmes' : 'séries'}`}
          {loading && <Loader2 className="size-3.5 animate-spin" />}
        </div>
        {error && !items.length ? (
          <Retry error={error} onRetry={() => void load(1)} />
        ) : !meta && loading ? (
          <GridSkeleton />
        ) : items.length === 0 ? (
          <div className="panel px-6 py-12 text-center text-[13px] text-zinc-500">Nenhum título com esses filtros. Tente tirar algum.</div>
        ) : (
          <>
            <Grid items={items} onOpen={onOpen} wl={wl} />
            {meta && meta.page < meta.totalPages && (
              <div className="mt-6 flex justify-center">
                <button className="btn h-9 px-5" disabled={loading} onClick={() => void load(meta.page + 1)}>
                  {loading ? <Loader2 className="size-3.5 animate-spin" /> : null} Carregar mais
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Filter({ label, children, action }: { label: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="eyebrow">{label}</span>
        <span className="ml-auto">{action}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`h-7 rounded-full border px-2.5 text-[11px] transition-colors ${
        on ? 'border-volt/50 bg-volt/15 text-volt-100' : 'border-white/[0.08] text-zinc-400 hover:border-white/20 hover:text-zinc-100'
      }`}
    >
      {children}
    </button>
  )
}

// ── Minha lista ──────────────────────────────────────────────────────────────

const asSummary = (w: WatchItem): TitleSummary => ({
  id: w.id,
  type: w.type,
  title: w.title,
  originalTitle: '',
  year: w.year,
  poster: w.poster,
  backdrop: null,
  rating: 0,
  votes: 0,
  overview: '',
  genreIds: []
})

function ListTab({ wl, onOpen }: { wl: Watchlist; onOpen: (t: TitleSummary) => void }) {
  const [view, setView] = useState<'want' | 'watched'>('want')
  const want = wl.list.filter((w) => w.status === 'want')
  const watched = wl.list.filter((w) => w.status === 'watched').sort((a, b) => (b.watchedAt ?? 0) - (a.watchedAt ?? 0))
  const items = view === 'want' ? want : watched

  return (
    <div>
      <div className="mb-5 flex items-center gap-1">
        <Chip on={view === 'want'} onClick={() => setView('want')}>
          Quero ver · {want.length}
        </Chip>
        <Chip on={view === 'watched'} onClick={() => setView('watched')}>
          Já vi · {watched.length}
        </Chip>
        {view === 'want' && want.length > 0 && (
          <span className="ml-3 flex items-center gap-1.5 text-[11px] text-zinc-500">
            <Info className="size-3.5" /> Você recebe uma notificação quando um deles chegar no streaming.
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <div className="panel px-6 py-12 text-center text-[13px] text-zinc-500">
          {view === 'want' ? 'Nada aqui ainda. Toque no marcador de um pôster para guardar o que quer ver.' : 'Marque como visto o que você já assistiu, e dê sua nota.'}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-4 gap-y-6">
          {items.map((w) => (
            <div key={w.key}>
              <TitleCard t={asSummary(w)} onOpen={onOpen} wl={wl} />
              {view === 'watched' && w.myRating && (
                <div className="mt-0.5 font-mono text-[10px] text-amber-300">{'★'.repeat(w.myRating)}<span className="text-zinc-700">{'★'.repeat(5 - w.myRating)}</span></div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Meus streamings ──────────────────────────────────────────────────────────

function ProvidersModal({ onClose }: { onClose: () => void }) {
  const [providers, setProviders] = useState<WatchProvider[] | null>(null)
  const [mine, setMine] = usePersistentState('myProviders', [])
  const [all, setAll] = useState(false)
  useEffect(() => {
    void window.uhub.movies.providers().then(setProviders)
  }, [])
  const shown = providers ? (all ? providers : providers.filter((p, i) => i < 24 || mine.includes(p.id))) : []

  return (
    <Modal title="Meus streamings" onClose={onClose} width="max-w-2xl">
      <p className="mb-4 text-[12px] text-zinc-500">
        Marque os serviços que você assina. O Início mostra o que tem neles, Explorar filtra por eles e os títulos avisam “Está no seu Netflix”.
      </p>
      {!providers ? (
        <Loader2 className="size-4 animate-spin text-zinc-500" />
      ) : (
        <div className="grid max-h-[55vh] grid-cols-4 gap-2 overflow-y-auto pr-1">
          {shown.map((p) => {
            const on = mine.includes(p.id)
            return (
              <button
                key={p.id}
                onClick={() => setMine(on ? mine.filter((x) => x !== p.id) : [...mine, p.id])}
                className={`flex items-center gap-2 rounded-[4px] border p-2 text-left text-[12px] transition-colors ${
                  on ? 'border-volt/50 bg-volt/[0.12] text-zinc-100' : 'border-white/[0.06] text-zinc-400 hover:border-white/15'
                }`}
              >
                {p.logo && <img src={p.logo} alt="" className="size-8 shrink-0 rounded-[4px]" />}
                <span className="line-clamp-2 flex-1">{p.name}</span>
                {on && <Check className="size-3.5 shrink-0 text-volt-soft" />}
              </button>
            )
          })}
        </div>
      )}
      <div className="mt-4 flex items-center">
        {providers && !all && providers.length > 24 && (
          <button className="font-mono text-[11px] text-zinc-500 hover:text-zinc-200" onClick={() => setAll(true)}>
            mostrar todos ({providers.length})
          </button>
        )}
        <button className="btn btn-volt ml-auto" onClick={onClose}>
          <Settings2 className="size-3.5" /> Pronto
        </button>
      </div>
    </Modal>
  )
}
