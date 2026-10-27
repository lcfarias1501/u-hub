import { Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, Clapperboard, Eye, Star } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import type { MediaType, TitleSummary, WatchItem } from '@shared/types'
import { usePersistentState } from '@renderer/hooks/usePersistentState'

export const keyOf = (t: { type: MediaType; id: number }): string => `${t.type}:${t.id}`
export const typeLabel = (t: MediaType): string => (t === 'movie' ? 'Filme' : 'Série')

export function runtimeLabel(min: number | null, type: MediaType): string | null {
  if (!min) return null
  const txt = min < 60 ? `${min}min` : `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}min` : ''}`
  return type === 'tv' ? `${txt} por episódio` : txt
}

/** "Quero ver" / "Já vi", synced with the U-Hub account like the other lists. */
export function useWatchlist() {
  const [list, setList] = usePersistentState('watchlist', [])
  const byKey = new Map(list.map((w) => [w.key, w]))
  const from = (t: TitleSummary, patch: Partial<WatchItem>): WatchItem => ({
    key: keyOf(t),
    type: t.type,
    id: t.id,
    title: t.title,
    poster: t.poster,
    year: t.year,
    addedAt: Date.now(),
    status: 'want',
    watchedAt: null,
    myRating: null,
    ...patch
  })
  const upsert = (item: WatchItem): void => setList((l) => [item, ...l.filter((w) => w.key !== item.key)])
  return {
    list,
    get: (t: { type: MediaType; id: number }): WatchItem | undefined => byKey.get(keyOf(t)),
    toggleWant: (t: TitleSummary): void => {
      const cur = byKey.get(keyOf(t))
      if (cur?.status === 'want') setList((l) => l.filter((w) => w.key !== cur.key))
      else upsert(from(t, { status: 'want' }))
    },
    setWatched: (t: TitleSummary, watched: boolean): void => {
      const cur = byKey.get(keyOf(t))
      if (!watched) return setList((l) => l.filter((w) => w.key !== keyOf(t)))
      upsert(cur ? { ...cur, status: 'watched', watchedAt: Date.now() } : from(t, { status: 'watched', watchedAt: Date.now() }))
    },
    rate: (key: string, myRating: number | null): void => setList((l) => l.map((w) => (w.key === key ? { ...w, myRating } : w))),
    remove: (key: string): void => setList((l) => l.filter((w) => w.key !== key))
  }
}
export type Watchlist = ReturnType<typeof useWatchlist>

export function RatingBadge({ value, className = '' }: { value: number; className?: string }) {
  if (!value) return null
  const tone = value >= 7.5 ? 'text-acid-soft' : value >= 6 ? 'text-amber-200' : 'text-zinc-400'
  return (
    <span className={`inline-flex items-center gap-0.5 font-mono text-[11px] ${tone} ${className}`}>
      <Star className="size-3" fill="currentColor" />
      {value.toFixed(1).replace('.', ',')}
    </span>
  )
}

export function Poster({ src, title, className = '' }: { src: string | null; title: string; className?: string }) {
  const [ok, setOk] = useState(true)
  return (
    <div className={`relative overflow-hidden bg-white/[0.04] ${className}`}>
      {src && ok ? (
        <img src={src} alt="" loading="lazy" onError={() => setOk(false)} className="size-full object-cover" />
      ) : (
        <div className="grid size-full place-items-center p-3 text-center">
          <div>
            <Clapperboard className="mx-auto mb-2 size-6 text-zinc-700" />
            <div className="line-clamp-3 text-[11px] text-zinc-500">{title}</div>
          </div>
        </div>
      )}
    </div>
  )
}

export function TitleCard({ t, onOpen, wl, width }: { t: TitleSummary; onOpen: (t: TitleSummary) => void; wl: Watchlist; width?: number }) {
  const item = wl.get(t)
  return (
    <div className="group relative shrink-0" style={width ? { width } : undefined}>
      <button onClick={() => onOpen(t)} className="block w-full text-left">
        <Poster src={t.poster} title={t.title} className="aspect-[2/3] rounded-[4px] border border-white/[0.06] transition-all duration-200 group-hover:-translate-y-1 group-hover:border-volt/40 group-hover:shadow-[0_14px_30px_-16px_var(--color-volt)]" />
        <div className="mt-2 line-clamp-1 text-[13px] text-zinc-100">{t.title}</div>
        <div className="flex items-center gap-2 font-mono text-[10px] text-zinc-500">
          <span>{t.year ?? '—'}</span>
          <span>{typeLabel(t.type)}</span>
          <RatingBadge value={t.rating} className="ml-auto" />
        </div>
      </button>
      <button
        onClick={() => wl.toggleWant(t)}
        title={item?.status === 'want' ? 'Tirar de "Quero ver"' : item?.status === 'watched' ? 'Você já viu' : 'Adicionar a "Quero ver"'}
        className={`absolute top-2 right-2 grid size-7 place-items-center rounded-full border backdrop-blur transition-opacity ${
          item ? 'border-volt/50 bg-volt/30 text-white opacity-100' : 'border-white/15 bg-black/60 text-zinc-200 opacity-0 group-hover:opacity-100'
        }`}
      >
        {item?.status === 'watched' ? <Eye className="size-3.5" /> : item ? <BookmarkCheck className="size-3.5" /> : <Bookmark className="size-3.5" />}
      </button>
    </div>
  )
}

/** Horizontal shelf with arrow buttons (Netflix-style), lazy posters. */
export function Shelf({ title, action, items, onOpen, wl }: { title: ReactNode; action?: ReactNode; items: TitleSummary[]; onOpen: (t: TitleSummary) => void; wl: Watchlist }) {
  const ref = useRef<HTMLDivElement>(null)
  const scroll = (dir: 1 | -1): void => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.85, behavior: 'smooth' })
  if (!items.length) return null
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-[15px] font-semibold text-zinc-100">{title}</h2>
        {action}
        <div className="ml-auto flex gap-1">
          <button className="icon-btn" onClick={() => scroll(-1)} aria-label="Voltar">
            <ChevronLeft className="size-4" />
          </button>
          <button className="icon-btn" onClick={() => scroll(1)} aria-label="Avançar">
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
      <div ref={ref} className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-2 [scrollbar-width:none]">
        {items.map((t) => (
          <TitleCard key={keyOf(t)} t={t} onOpen={onOpen} wl={wl} width={156} />
        ))}
      </div>
    </section>
  )
}

export function Grid({ items, onOpen, wl }: { items: TitleSummary[]; onOpen: (t: TitleSummary) => void; wl: Watchlist }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-4 gap-y-6">
      {items.map((t) => (
        <TitleCard key={keyOf(t)} t={t} onOpen={onOpen} wl={wl} />
      ))}
    </div>
  )
}

export function GridSkeleton({ n = 12 }: { n?: number }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-4 gap-y-6">
      {Array.from({ length: n }, (_, i) => (
        <div key={i}>
          <div className="aspect-[2/3] rounded-[4px] bg-white/[0.04]" />
          <div className="mt-2 h-3 w-3/4 rounded bg-white/[0.05]" />
        </div>
      ))}
    </div>
  )
}

/** TMDB's terms ask for this notice; streaming availability comes from JustWatch. */
export function Attribution() {
  return (
    <footer className="mt-10 flex items-center gap-3 border-t border-white/[0.06] pt-4 font-mono text-[10px] leading-relaxed text-zinc-600">
      <span className="rounded-[3px] bg-gradient-to-r from-[#90cea1] to-[#01b4e4] px-1.5 py-0.5 font-bold tracking-wider text-[#0d253f]">TMDB</span>
      <span>
        Este produto usa a API do TMDB, mas não é endossado nem certificado pelo TMDB. Disponibilidade nos streamings: JustWatch.
      </span>
    </footer>
  )
}
