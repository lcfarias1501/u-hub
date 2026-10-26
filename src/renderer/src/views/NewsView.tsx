import {
  AlertTriangle,
  ExternalLink,
  Headphones,
  Heart,
  Loader2,
  Newspaper,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Rss,
  Search,
  Settings2,
  Wrench,
  X
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { NEWS_CATEGORIES, type ArticleContent, type FeedDiscovery, type NewsCategoryId, type NewsItem, type NewsSnapshot, type NewsSource } from '@shared/types'
import { Field, Modal } from '@renderer/components/Modal'
import { usePersistentState } from '@renderer/hooks/usePersistentState'
import { uid } from '@renderer/lib/format'
import { iconFor } from '@renderer/lib/icons'
import { speech, useSpeech, type Track } from '@renderer/lib/speech'
import { ago, Empty } from './RadarView'

type Cat = 'all' | NewsCategoryId
type GameFilter = 'all' | 'patch' | 'steam'

const DEFAULT_FOLLOW: NewsCategoryId[] = ['games', 'tech', 'world', 'sports']
const catMeta = (id: NewsCategoryId): (typeof NEWS_CATEGORIES)[number] => NEWS_CATEGORIES.find((c) => c.id === id) ?? NEWS_CATEGORIES[NEWS_CATEGORIES.length - 1]

export function NewsView() {
  const [snap, setSnap] = useState<NewsSnapshot | null>(null)
  const [follow, setFollow] = usePersistentState('newsFollow', DEFAULT_FOLLOW)
  const [cat, setCat] = useState<Cat>('all')
  const [gameFilter, setGameFilter] = useState<GameFilter>('all')
  // Coming back from the player bar: open the article being read.
  const [selected, setSelected] = useState<NewsItem | null>(() => (speech.current?.full ? speech.current.item : null))
  const [managing, setManaging] = useState(false)
  const sp = useSpeech()
  const playingId = sp.status !== 'idle' ? sp.tracks[sp.index]?.item.id : undefined

  // The reader follows the queue: when the article on screen ends, show the next one being read.
  const lastPlaying = useRef<string | undefined>(undefined)
  useEffect(() => {
    const track = sp.tracks[sp.index]
    const prev = lastPlaying.current
    if (playingId && prev && playingId !== prev && track?.full) {
      setSelected((cur) => (cur?.id === prev ? track.item : cur))
    }
    lastPlaying.current = playingId
  }, [playingId, sp.tracks, sp.index])

  useEffect(() => {
    void window.uhub.news.get().then((s) => {
      setSnap(s)
      // Never fetched on this machine yet → fetch now instead of waiting for the scheduler.
      if (!s.updatedAt && !s.refreshing) void window.uhub.news.refresh()
    })
    return window.uhub.news.onUpdate(setSnap)
  }, [])

  const followed = useMemo(() => NEWS_CATEGORIES.filter((c) => follow.includes(c.id)), [follow])
  useEffect(() => {
    if (cat !== 'all' && !follow.includes(cat)) setCat('all')
  }, [cat, follow])

  const items = useMemo(() => (snap?.items ?? []).filter((n) => follow.includes(n.category)), [snap, follow])
  const counts = useMemo(() => {
    const m = new Map<NewsCategoryId, number>()
    for (const n of items) m.set(n.category, (m.get(n.category) ?? 0) + 1)
    return m
  }, [items])
  const shown = useMemo(
    () =>
      items.filter(
        (n) =>
          (cat === 'all' || n.category === cat) &&
          (cat !== 'games' || gameFilter === 'all' || (gameFilter === 'patch' ? n.patch : n.kind === 'steam'))
      ),
    [items, cat, gameFilter]
  )

  if (!snap) return null
  const catLabel = cat === 'all' ? 'todas as categorias' : catMeta(cat).label
  const listen = (full: boolean, from?: NewsItem): void => {
    const pool = full ? shown.slice(0, 10) : shown.slice(0, 20)
    const start = from ? Math.max(0, pool.findIndex((n) => n.id === from.id)) : 0
    speech.play(pool.map((item): Track => ({ item, full })), start)
  }
  /** One article in full, then the ones after it in this list, so "next" has somewhere to go. */
  const listenFrom = (item: NewsItem, fromBlock = -1): void => {
    setSelected(item)
    const at = shown.findIndex((n) => n.id === item.id)
    const queue = at < 0 ? [item] : shown.slice(at, at + 10)
    speech.play(queue.map((n): Track => ({ item: n, full: true })), 0, fromBlock)
  }

  return (
    <div className="grid h-full grid-cols-[minmax(340px,420px)_minmax(0,1fr)]">
      {/* ── Left: categories and headlines ── */}
      <section className="flex min-h-0 flex-col border-r border-white/[0.06] bg-void/40">
        <div className="px-4 pt-5 pb-3">
          <div className="flex items-end gap-2">
            <div>
              <div className="eyebrow mb-1 flex items-center gap-2">
                <span className="text-volt-soft">08</span>
                <span className="h-px w-8 bg-gradient-to-r from-volt/60 to-transparent" />
                {snap.updatedAt ? `atualizado ${ago(snap.updatedAt)}` : 'nunca atualizado'}
              </div>
              <h1 className="text-[26px] leading-none font-semibold tracking-tight text-zinc-50">Notícias</h1>
            </div>
            <div className="ml-auto flex items-center gap-1">
              <button className="icon-btn" title="Atualizar" disabled={snap.refreshing} onClick={() => void window.uhub.news.refresh()}>
                {snap.refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              </button>
              <button className="icon-btn" title="Fontes e categorias" onClick={() => setManaging(true)}>
                <Settings2 className="size-4" />
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-1.5">
            <Chip active={cat === 'all'} onClick={() => setCat('all')} icon={<Newspaper />} label="Tudo" count={items.length} />
            {followed.map((c) => {
              const Icon = iconFor(c.icon)
              return <Chip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)} icon={<Icon />} label={c.label} count={counts.get(c.id) ?? 0} />
            })}
            <button
              onClick={() => setManaging(true)}
              className="flex h-7 items-center gap-1 rounded-full border border-dashed border-white/10 px-2.5 text-[11px] text-zinc-500 transition-colors hover:border-volt/40 hover:text-volt-100"
            >
              <Plus className="size-3" /> Seguir
            </button>
          </div>

          {cat === 'games' && (
            <div className="mt-3 flex gap-1 border-t border-white/[0.05] pt-3">
              {(
                [
                  ['all', 'Tudo', <Newspaper key="a" />],
                  ['patch', 'Patches', <Wrench key="p" />],
                  ['steam', 'Meus jogos', <Heart key="s" />]
                ] as const
              ).map(([id, label, icon]) => (
                <button
                  key={id}
                  onClick={() => setGameFilter(id)}
                  className={`flex h-7 items-center gap-1.5 rounded-[3px] px-2 text-[11px] transition-colors [&>svg]:size-3 ${
                    gameFilter === id ? 'bg-volt/15 text-volt-100' : 'text-zinc-500 hover:text-zinc-200'
                  }`}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>
          )}

          {snap.errors.length > 0 && (
            <div className="mt-3 flex items-start gap-1.5 font-mono text-[10px] leading-relaxed text-amber-200/70" title={snap.errors.join('\n')}>
              <AlertTriangle className="mt-px size-3 shrink-0" />
              <span className="line-clamp-2">
                {snap.errors.length === 1 ? '1 fonte falhou' : `${snap.errors.length} fontes falharam`}: {snap.errors.map((e) => e.split(':')[0]).join(', ')}
              </span>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {shown.length === 0 ? (
            snap.refreshing ? (
              <ListSkeleton />
            ) : (
              <p className="px-3 py-10 text-center text-[12px] leading-relaxed text-zinc-500">
                {cat === 'games' && gameFilter !== 'all'
                  ? 'Sem notícias dos seus jogos. Elas vêm dos jogos da Steam na sua Biblioteca e da sua lista de desejos.'
                  : `Nenhuma notícia em ${catLabel}. Confira as fontes ou atualize.`}
              </p>
            )
          ) : (
            shown.map((n) => (
              <NewsRow
                key={n.id}
                item={n}
                active={selected?.id === n.id}
                reading={playingId === n.id ? sp.status : null}
                onOpen={() => setSelected(n)}
                onListen={() => listenFrom(n)}
              />
            ))
          )}
        </div>
      </section>

      {/* ── Right: reader, or the spoken briefing ── */}
      <section className="min-h-0 overflow-y-auto">
        {selected ? (
          <Reader key={selected.id} item={selected} onListen={listenFrom} onClose={() => setSelected(null)} />
        ) : (
          <Briefing items={shown} label={catLabel} onListen={listen} onOpen={setSelected} />
        )}
      </section>

      {managing && <SourcesModal follow={follow} setFollow={setFollow} defaultCategory={cat === 'all' ? 'other' : cat} onClose={() => setManaging(false)} />}
    </div>
  )
}

function Chip({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: ReactNode; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={`flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] transition-colors [&>svg]:size-3 ${
        active ? 'border-volt/50 bg-volt/15 text-volt-100' : 'border-white/[0.08] text-zinc-400 hover:border-white/20 hover:text-zinc-100'
      }`}
    >
      {icon}
      {label}
      <span className={`font-mono text-[9px] ${active ? 'text-volt-200' : 'text-zinc-600'}`}>{count}</span>
    </button>
  )
}

/** Three bars bouncing while an item is read aloud (frozen while paused). */
export function SpeakingBars({ paused }: { paused?: boolean }) {
  return (
    <span className="flex h-3 items-end gap-[2px]" aria-label="Lendo em voz alta">
      {[0, 0.25, 0.5].map((d) => (
        <span key={d} className={`w-[3px] rounded-full bg-volt-soft ${paused ? 'h-1.5' : 'eq-bar h-3'}`} style={{ animationDelay: `${d}s` }} />
      ))}
    </span>
  )
}

function NewsRow({
  item,
  active,
  reading,
  onOpen,
  onListen
}: {
  item: NewsItem
  active: boolean
  reading: 'loading' | 'speaking' | 'paused' | 'idle' | null
  onOpen: () => void
  onListen: () => void
}) {
  const [imgOk, setImgOk] = useState(true)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      className={`group relative flex cursor-pointer gap-3 rounded-[3px] border p-2 transition-colors ${
        active ? 'border-volt/30 bg-volt/[0.08]' : reading ? 'border-volt/20 bg-white/[0.02]' : 'border-transparent hover:bg-white/[0.03]'
      }`}
    >
      <div className="relative h-[60px] w-[92px] shrink-0 overflow-hidden rounded-[2px] bg-white/[0.04]">
        {item.image && imgOk ? (
          <img src={item.image} alt="" loading="lazy" onError={() => setImgOk(false)} className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center text-zinc-700">
            <Newspaper className="size-5" />
          </div>
        )}
        {reading && (
          <div className="absolute inset-0 grid place-items-center bg-black/55">
            {reading === 'loading' ? <Loader2 className="size-4 animate-spin text-volt-100" /> : <SpeakingBars paused={reading === 'paused'} />}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-500">
          {item.patch && (
            <span className="flex items-center gap-1 rounded-[2px] bg-volt/20 px-1 text-volt-100">
              <Wrench className="size-2.5" /> PATCH
            </span>
          )}
          <span className="truncate text-zinc-400">{item.source}</span>
          <span>·</span>
          <span className="shrink-0">{ago(item.date)}</span>
        </div>
        <div className={`mt-0.5 line-clamp-2 text-[13px] leading-snug ${active ? 'text-white' : 'text-zinc-200 group-hover:text-white'}`}>{item.title}</div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onListen()
        }}
        title="Ouvir esta notícia"
        className="icon-btn absolute right-1.5 bottom-1.5 bg-raised/90 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
      >
        <Headphones className="size-3.5" />
      </button>
    </div>
  )
}

function ListSkeleton() {
  return (
    <div className="space-y-1 px-1">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex gap-3 p-2" style={{ opacity: 1 - i * 0.1 }}>
          <div className="h-[60px] w-[92px] rounded-[2px] bg-white/[0.04]" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-2 w-24 rounded bg-white/[0.05]" />
            <div className="h-3 w-full rounded bg-white/[0.05]" />
            <div className="h-3 w-2/3 rounded bg-white/[0.05]" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Briefing (nothing selected) ──────────────────────────────────────────────

function Briefing({ items, label, onListen, onOpen }: { items: NewsItem[]; label: string; onListen: (full: boolean) => void; onOpen: (n: NewsItem) => void }) {
  const sp = useSpeech()
  const top = items.slice(0, 3)
  const headlines = Math.min(items.length, 20)
  const full = Math.min(items.length, 10)
  const minutes = Math.max(1, Math.round((headlines * 22) / 60))

  return (
    <div className="animate-rise mx-auto max-w-3xl p-8">
      <div className="panel relative overflow-hidden p-7">
        <div className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-volt/20 blur-3xl" />
        <div className="eyebrow mb-2 flex items-center gap-2 text-volt-soft">
          <Headphones className="size-3.5" /> Jornal falado
        </div>
        <h2 className="max-w-md text-[24px] leading-tight font-semibold text-zinc-50">Ouça as notícias enquanto joga, programa ou faz outra coisa.</h2>
        <p className="mt-2 max-w-lg text-[13px] leading-relaxed text-zinc-400">
          O U-Hub lê em voz alta as notícias de <span className="text-zinc-200">{label}</span>. A rádio abaixa sozinha enquanto ele fala, e dá para pular, pausar e mudar a velocidade na barra lá embaixo.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button className="btn btn-volt h-10 px-4" disabled={!items.length} onClick={() => onListen(false)}>
            <Play className="size-4" fill="currentColor" /> Ouvir manchetes
            <span className="font-mono text-[10px] opacity-70">
              {headlines} · ~{minutes} min
            </span>
          </button>
          <button className="btn h-10 px-4" disabled={!items.length} onClick={() => onListen(true)}>
            <Newspaper className="size-4" /> Ouvir matérias completas
            <span className="font-mono text-[10px] text-zinc-500">{full}</span>
          </button>
          {sp.status !== 'idle' && (
            <button className="btn h-10 px-4" onClick={() => speech.stop()}>
              <X className="size-4" /> Parar leitura
            </button>
          )}
        </div>
      </div>

      {top.length > 0 && (
        <>
          <div className="eyebrow mt-8 mb-3">Destaques</div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
            {top.map((n) => (
              <button key={n.id} onClick={() => onOpen(n)} className="group panel panel-hover overflow-hidden text-left">
                <div className="aspect-[16/9] overflow-hidden bg-white/[0.04]">
                  {n.image ? (
                    <img src={n.image} alt="" loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  ) : (
                    <div className="grid size-full place-items-center text-zinc-700">
                      <Newspaper className="size-7" />
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <div className="font-mono text-[10px] text-zinc-500">
                    {n.source} · {ago(n.date)}
                  </div>
                  <div className="mt-1 line-clamp-3 text-[13px] leading-snug text-zinc-100">{n.title}</div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
      {!items.length && <div className="mt-8"><Empty text="Nenhuma notícia por aqui ainda." /></div>}
    </div>
  )
}

// ── Reader ───────────────────────────────────────────────────────────────────

function Reader({ item, onListen, onClose }: { item: NewsItem; onListen: (item: NewsItem, fromBlock?: number) => void; onClose: () => void }) {
  const sp = useSpeech()
  const [article, setArticle] = useState<ArticleContent | null>(null)
  const [heroOk, setHeroOk] = useState(true)
  const blockRefs = useRef<(HTMLElement | null)[]>([])
  const isThis = sp.status !== 'idle' && sp.tracks[sp.index]?.item.id === item.id
  const reading = isThis && sp.tracks[sp.index]?.full

  useEffect(() => {
    let alive = true
    void window.uhub.news.article(item.url).then((a) => alive && setArticle(a))
    return () => {
      alive = false
    }
  }, [item.url])

  // Follow the paragraph being read.
  useEffect(() => {
    if (reading && sp.block >= 0) blockRefs.current[sp.block]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [reading, sp.block])

  const hero = article?.ok ? (article.image ?? item.image) : item.image
  const listen = (fromBlock = -1): void => {
    if (isThis && fromBlock < 0) return speech.toggle()
    if (reading && fromBlock >= 0) return speech.seekBlock(fromBlock)
    onListen(item, fromBlock)
  }

  return (
    <article className="animate-rise mx-auto max-w-[760px] px-8 pt-6 pb-16">
      <div className="mb-4 flex items-center gap-2">
        <span className="eyebrow truncate">
          {item.source} · {new Date(item.date).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button className={`btn ${isThis ? '' : 'btn-volt'}`} onClick={() => listen()}>
            {isThis && sp.status === 'loading' ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : isThis && sp.status === 'speaking' ? (
              <Pause className="size-3.5" fill="currentColor" />
            ) : (
              <Headphones className="size-3.5" />
            )}
            {isThis ? (sp.status === 'paused' ? 'Continuar' : sp.status === 'loading' ? 'Preparando…' : 'Pausar') : 'Ouvir'}
          </button>
          <a className="btn" href={item.url} target="_blank" rel="noreferrer">
            <ExternalLink className="size-3.5" /> Abrir no site
          </a>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar notícia">
            <X className="size-4" />
          </button>
        </div>
      </div>

      <h1 className="text-[28px] leading-tight font-semibold tracking-tight text-zinc-50">{(article?.ok && article.title) || item.title}</h1>
      {article?.ok && article.byline && <div className="mt-2 font-mono text-[11px] text-zinc-500">{article.byline}</div>}

      {hero && heroOk && (
        <img src={hero} alt="" onError={() => setHeroOk(false)} className="mt-5 max-h-[360px] w-full rounded-[3px] border border-white/[0.06] object-cover" />
      )}

      {!article ? (
        <div className="mt-6 space-y-3">
          {[100, 96, 98, 60, 0, 100, 94, 88].map((w, i) => (
            <div key={i} className="h-3 rounded bg-white/[0.05]" style={{ width: `${w}%`, opacity: w ? 1 : 0 }} />
          ))}
        </div>
      ) : article.ok ? (
        <div className="mt-6 text-[15px] leading-[1.75] text-zinc-300">
          {article.blocks.map((b, i) => {
            if (b.kind === 'img') return <ReaderImage key={i} src={b.src} caption={b.caption} />
            const current = reading && sp.block === i
            const cls = `group/p relative -mx-3 cursor-pointer rounded-[3px] border-l-2 px-3 transition-colors ${
              current ? 'border-volt bg-volt/[0.08] text-zinc-100' : 'border-transparent hover:bg-white/[0.02]'
            }`
            const play = (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  listen(i)
                }}
                title="Ouvir a partir daqui"
                className="absolute top-1 -left-7 hidden size-5 place-items-center rounded-full text-zinc-600 group-hover/p:grid hover:text-volt-100"
              >
                <Play className="size-3" fill="currentColor" />
              </button>
            )
            const ref = (el: HTMLElement | null): void => {
              blockRefs.current[i] = el
            }
            if (b.kind === 'h')
              return (
                <h2 key={i} ref={ref} onDoubleClick={() => listen(i)} className={`${cls} mt-7 mb-2 text-[19px] leading-snug font-semibold text-zinc-100`}>
                  {play}
                  {b.text}
                </h2>
              )
            if (b.kind === 'quote')
              return (
                <blockquote key={i} ref={ref} onDoubleClick={() => listen(i)} className={`${cls} my-4 italic text-zinc-400`}>
                  {play}“{b.text}”
                </blockquote>
              )
            if (b.kind === 'li')
              return (
                <div key={i} ref={ref} onDoubleClick={() => listen(i)} className={`${cls} my-1 pl-7 before:absolute before:left-3 before:text-volt-soft before:content-['▸']`}>
                  {play}
                  {b.text}
                </div>
              )
            return (
              <p key={i} ref={ref} onDoubleClick={() => listen(i)} className={`${cls} my-3`}>
                {play}
                {b.text}
              </p>
            )
          })}
          <div className="mt-10 flex items-center gap-3 border-t border-white/[0.06] pt-5 font-mono text-[11px] text-zinc-500">
            Texto extraído de {article.siteName ?? new URL(article.url).hostname.replace(/^www\./, '')} em modo leitura.
            <a className="ml-auto text-volt-soft hover:underline" href={item.url} target="_blank" rel="noreferrer">
              Ver original
            </a>
          </div>
        </div>
      ) : (
        <div className="mt-6">
          <p className="text-[15px] leading-[1.75] text-zinc-300">{item.summary || 'Sem resumo disponível.'}</p>
          <div className="mt-6 flex items-start gap-3 rounded-[3px] border border-white/[0.08] bg-white/[0.02] p-4">
            <Newspaper className="mt-0.5 size-4 shrink-0 text-zinc-500" />
            <div className="text-[12px] leading-relaxed text-zinc-400">
              Este site não deixou o U-Hub abrir a matéria completa ({article.error?.replace(/\.$/, '').toLowerCase()}). Você pode ouvir o resumo acima ou ler no site.
              <div className="mt-3">
                <a className="btn" href={item.url} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-3.5" /> Abrir no site
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </article>
  )
}

function ReaderImage({ src, caption }: { src: string; caption: string | null }) {
  const [ok, setOk] = useState(true)
  if (!ok) return null
  return (
    <figure className="my-6">
      <img src={src} alt={caption ?? ''} loading="lazy" onError={() => setOk(false)} className="w-full rounded-[3px] border border-white/[0.06]" />
      {caption && <figcaption className="mt-1.5 font-mono text-[10px] text-zinc-500">{caption}</figcaption>}
    </figure>
  )
}

// ── Sources & categories ─────────────────────────────────────────────────────

function SourcesModal({
  follow,
  setFollow,
  defaultCategory,
  onClose
}: {
  follow: NewsCategoryId[]
  setFollow: (v: NewsCategoryId[]) => void
  defaultCategory: NewsCategoryId
  onClose: () => void
}) {
  const [sources, setSources] = usePersistentState('newsSources', [])
  const toggleFollow = (id: NewsCategoryId): void => {
    if (follow.includes(id)) {
      if (follow.length > 1) setFollow(follow.filter((f) => f !== id))
    } else setFollow(NEWS_CATEGORIES.map((c) => c.id).filter((c) => c === id || follow.includes(c)))
  }
  const groups = NEWS_CATEGORIES.map((c) => ({ ...c, list: sources.filter((s) => s.category === c.id) })).filter((g) => g.list.length)

  return (
    <Modal title="Fontes e categorias" onClose={onClose} width="max-w-2xl">
      <div className="-m-4 max-h-[72vh] overflow-y-auto p-4">
        <div className="eyebrow mb-2">Categorias que você segue</div>
        <div className="flex flex-wrap gap-1.5">
          {NEWS_CATEGORIES.map((c) => {
            const Icon = iconFor(c.icon)
            const on = follow.includes(c.id)
            return (
              <button
                key={c.id}
                onClick={() => toggleFollow(c.id)}
                className={`flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] transition-colors ${
                  on ? 'border-volt/50 bg-volt/15 text-volt-100' : 'border-white/[0.08] text-zinc-500 hover:border-white/20 hover:text-zinc-200'
                }`}
              >
                <Icon className="size-3.5" />
                {c.label}
              </button>
            )
          })}
        </div>

        <AddSource
          sources={sources}
          defaultCategory={defaultCategory}
          onAdd={(s) => {
            setSources([...sources, s])
            if (!follow.includes(s.category)) toggleFollow(s.category)
          }}
        />

        <div className="eyebrow mt-6 mb-2">Fontes</div>
        <div className="space-y-4">
          {groups.map((g) => {
            const Icon = iconFor(g.icon)
            const followed = follow.includes(g.id)
            return (
              <div key={g.id} className={followed ? '' : 'opacity-50'}>
                <div className="mb-1 flex items-center gap-1.5 text-[11px] text-zinc-400">
                  <Icon className="size-3.5 text-volt-soft" /> {g.label}
                  {!followed && <span className="font-mono text-[9px] text-zinc-600">· não seguida</span>}
                </div>
                <ul className="space-y-1">
                  {g.list.map((s: NewsSource) => (
                    <li key={s.id} className="flex items-center gap-3 rounded-[3px] border border-white/[0.05] bg-black/20 px-3 py-1.5">
                      <input
                        type="checkbox"
                        checked={s.enabled}
                        onChange={() => setSources(sources.map((x) => (x.id === s.id ? { ...x, enabled: !x.enabled } : x)))}
                        className="size-4 accent-[var(--color-volt)]"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-[13px] text-zinc-200">
                          {s.name}
                          {s.custom && <span className="rounded-[2px] bg-acid/15 px-1 font-mono text-[9px] text-acid-soft">SUA</span>}
                        </div>
                        <div className="truncate font-mono text-[10px] text-zinc-600">{s.url}</div>
                      </div>
                      {s.custom && (
                        <button className="icon-btn hover:!text-rose-300" onClick={() => setSources(sources.filter((x) => x.id !== s.id))} aria-label="Remover fonte">
                          <X className="size-3.5" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}

function AddSource({ sources, defaultCategory, onAdd }: { sources: NewsSource[]; defaultCategory: NewsCategoryId; onAdd: (s: NewsSource) => void }) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [found, setFound] = useState<FeedDiscovery | null>(null)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<NewsCategoryId>(defaultCategory)
  const [added, setAdded] = useState<string | null>(null)
  const duplicate = found?.ok && sources.find((s) => s.url.replace(/\/$/, '') === found.url!.replace(/\/$/, ''))

  const search = async (): Promise<void> => {
    if (!input.trim()) return
    setBusy(true)
    setFound(null)
    setAdded(null)
    const r = await window.uhub.news.discover(input).catch((e: Error) => ({ ok: false, error: e.message }) as FeedDiscovery)
    setBusy(false)
    setFound(r)
    if (r.ok) setName(r.title ?? '')
  }

  return (
    <div className="mt-6 rounded-[3px] border border-volt/20 bg-volt/[0.04] p-3">
      <div className="eyebrow mb-1 flex items-center gap-1.5 text-volt-soft">
        <Rss className="size-3.5" /> Adicionar fonte
      </div>
      <p className="mb-2 text-[11px] text-zinc-500">Cole o endereço de qualquer site de notícias ou blog — o U-Hub encontra o feed sozinho.</p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void search()
        }}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-zinc-600" />
          <input className="field h-9 pl-9" placeholder="ex.: tecmundo.com.br" value={input} onChange={(e) => setInput(e.target.value)} />
        </div>
        <button className="btn h-9" disabled={busy || !input.trim()}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />} Procurar
        </button>
      </form>

      {found && !found.ok && (
        <div className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-200/80">
          <AlertTriangle className="mt-px size-3.5 shrink-0" /> {found.error}
        </div>
      )}
      {added && <div className="mt-2 text-[11px] text-acid-soft">“{added}” adicionada. As notícias dela chegam em instantes.</div>}

      {found?.ok && (
        <div className="animate-rise mt-3 rounded-[3px] border border-white/[0.08] bg-black/30 p-3">
          <div className="font-mono text-[10px] text-zinc-600">{found.url}</div>
          <ul className="mt-1.5 mb-3 space-y-0.5">
            {found.sample?.map((t) => (
              <li key={t} className="truncate text-[12px] text-zinc-400">
                · {t}
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-[1fr_180px_auto] items-end gap-2">
            <Field label="Nome">
              <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Categoria">
              <select className="field cursor-pointer" value={category} onChange={(e) => setCategory(e.target.value as NewsCategoryId)}>
                {NEWS_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <button
              className="btn btn-volt h-9"
              disabled={!name.trim() || !!duplicate}
              onClick={() => {
                onAdd({ id: uid(), name: name.trim(), url: found.url!, enabled: true, category, custom: true })
                setAdded(name.trim())
                setFound(null)
                setInput('')
              }}
            >
              <Plus className="size-3.5" /> Adicionar
            </button>
          </div>
          {duplicate && <div className="mt-2 text-[11px] text-zinc-500">Essa fonte já está na lista ({duplicate.name}).</div>}
        </div>
      )}
    </div>
  )
}
