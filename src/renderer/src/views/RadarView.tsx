import { AlertTriangle, Bell, ExternalLink, Gift, Heart, Loader2, Plus, RefreshCw, Search, Tag, Trash2, TrendingDown } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Deal, FreeGame, RadarSnapshot, SteamSearchResult, WishlistItem } from '@shared/types'
import { usePersistentState } from '@renderer/hooks/usePersistentState'
import { PageHeader } from './PageHeader'

type Tab = 'deals' | 'wishlist'

export const money = (cents: number | null, currency: string | null): string =>
  cents == null || !currency ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(cents / 100)

export function ago(t: number): string {
  const m = Math.round((Date.now() - t) / 60_000)
  if (m < 1) return 'agora'
  if (m < 60) return `há ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.round(h / 24)
  return d < 30 ? `há ${d} ${d === 1 ? 'dia' : 'dias'}` : new Date(t).toLocaleDateString('pt-BR')
}

function until(t: number): string {
  const ms = t - Date.now()
  if (ms <= 0) return 'encerrado'
  const h = Math.floor(ms / 3_600_000)
  if (h < 24) return `${h}h restantes`
  return `${Math.floor(h / 24)}d ${h % 24}h restantes`
}

export function RadarView() {
  const [radar, setRadar] = useState<RadarSnapshot | null>(null)
  const [tab, setTab] = useState<Tab>('deals')
  const [wishlist, setWishlist] = usePersistentState('wishlist', [])

  useEffect(() => {
    void window.uhub.radar.get().then((s) => {
      setRadar(s)
      // Never fetched on this machine yet (fresh install) → fetch now instead of waiting for the scheduler.
      if (!s.updatedAt && !s.refreshing) void window.uhub.radar.refresh()
    })
    return window.uhub.radar.onUpdate(setRadar)
  }, [])

  const watch = (d: Pick<WishlistItem, 'appid' | 'name' | 'image'>): void => {
    if (wishlist.some((w) => w.appid === d.appid)) return
    setWishlist([
      { appid: d.appid, name: d.name, image: d.image, addedAt: Date.now(), target: null, currency: null, final: null, initial: null, discount: 0, lowest: null, checkedAt: null },
      ...wishlist
    ])
  }
  const unwatch = (appid: number): void => setWishlist(wishlist.filter((w) => w.appid !== appid))
  const watched = new Set(wishlist.map((w) => w.appid))

  if (!radar) return null
  const onSale = wishlist.filter((w) => w.discount > 0 || (w.target != null && w.final != null && w.final <= w.target)).length

  return (
    <div className="animate-rise p-6">
      <PageHeader index="06" title="Ofertas" subtitle="Grátis · promoções · lista de desejos">
        <span className="font-mono text-[10px] text-zinc-600">{radar.updatedAt ? `ATUALIZADO ${ago(radar.updatedAt).toUpperCase()}` : 'NUNCA ATUALIZADO'}</span>
        <button className="btn" disabled={radar.refreshing} onClick={() => void window.uhub.radar.refresh()}>
          {radar.refreshing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Atualizar
        </button>
      </PageHeader>

      <div className="mb-5 flex items-center gap-1 border-b border-white/[0.06]">
        <TabButton active={tab === 'deals'} onClick={() => setTab('deals')} icon={<Tag />} label="Ofertas" badge={radar.free.filter((f) => f.status === 'now').length || undefined} />
        <TabButton active={tab === 'wishlist'} onClick={() => setTab('wishlist')} icon={<Heart />} label="Lista de desejos" badge={onSale || undefined} />
      </div>

      {radar.errors.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-[3px] border border-warn/30 bg-warn/[0.06] px-3 py-2 font-mono text-[10px] text-amber-200/80">
          <AlertTriangle className="mt-px size-3.5 shrink-0" />
          <span>Algumas fontes falharam e mostram dados anteriores: {radar.errors.join(' · ')}</span>
        </div>
      )}

      {tab === 'deals' && <DealsTab radar={radar} watched={watched} onWatch={watch} onUnwatch={unwatch} />}
      {tab === 'wishlist' && <WishlistTab items={wishlist} setItems={setWishlist} onWatch={watch} onUnwatch={unwatch} />}
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
      {badge != null && <span className="rounded-full bg-acid/20 px-1.5 font-mono text-[10px] text-acid-soft">{badge}</span>}
    </button>
  )
}

// ── Deals ────────────────────────────────────────────────────────────────────

function DealsTab({
  radar,
  watched,
  onWatch,
  onUnwatch
}: {
  radar: RadarSnapshot
  watched: Set<number>
  onWatch: (d: Deal) => void
  onUnwatch: (appid: number) => void
}) {
  const now = radar.free.filter((f) => f.status === 'now')
  const upcoming = radar.free.filter((f) => f.status === 'upcoming')

  if (!radar.updatedAt && radar.refreshing) return <Loading label="Buscando ofertas…" />

  return (
    <div className="space-y-7">
      <section>
        <SectionTitle icon={<Gift />} title="Grátis agora na Epic" />
        {now.length ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
            {now.map((f) => (
              <FreeCard key={f.id} game={f} />
            ))}
          </div>
        ) : (
          <Empty text="Nenhum jogo grátis no momento." />
        )}
        {upcoming.length > 0 && (
          <>
            <div className="eyebrow mt-5 mb-2">Em breve</div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
              {upcoming.map((f) => (
                <FreeCard key={f.id} game={f} compact />
              ))}
            </div>
          </>
        )}
      </section>

      <section>
        <SectionTitle icon={<TrendingDown />} title="Promoções na Steam" />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
          {radar.deals.map((d) => (
            <DealCard key={d.appid} deal={d} watched={watched.has(d.appid)} onToggle={() => (watched.has(d.appid) ? onUnwatch(d.appid) : onWatch(d))} />
          ))}
        </div>
      </section>
    </div>
  )
}

function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-zinc-100 [&>svg]:size-4 [&>svg]:text-volt-soft">
      {icon}
      {title}
    </h2>
  )
}

function FreeCard({ game, compact }: { game: FreeGame; compact?: boolean }) {
  const live = game.status === 'now'
  return (
    <a
      href={game.url}
      target="_blank"
      rel="noreferrer"
      className={`group panel panel-hover block overflow-hidden ${live ? '!border-acid/30' : ''}`}
    >
      <div className={`relative overflow-hidden ${compact ? 'aspect-[16/8]' : 'aspect-[16/8.5]'}`}>
        {game.image && <img src={game.image} alt="" loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-105" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
        <span className={`absolute top-2 left-2 rounded-[3px] px-1.5 py-0.5 font-mono text-[10px] font-bold ${live ? 'bg-acid text-black' : 'bg-black/70 text-zinc-300'}`}>
          {live ? 'GRÁTIS' : `A PARTIR DE ${new Date(game.startsAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`}
        </span>
      </div>
      <div className="flex items-end gap-2 p-3">
        <div className="min-w-0 flex-1">
          <div className={`truncate font-semibold text-zinc-100 ${compact ? 'text-[13px]' : 'text-[15px]'}`}>{game.title}</div>
          <div className="font-mono text-[10px] text-zinc-500">
            {game.originalPrice && <span className="mr-2 line-through">{game.originalPrice}</span>}
            {live ? until(game.endsAt) : `até ${new Date(game.endsAt).toLocaleDateString('pt-BR')}`}
          </div>
        </div>
        {live && !compact && (
          <span className="btn h-7 shrink-0 !border-acid/40 !text-emerald-200 group-hover:!bg-acid/15">
            Resgatar <ExternalLink className="size-3" />
          </span>
        )}
      </div>
    </a>
  )
}

function DealCard({ deal, watched, onToggle }: { deal: Deal; watched: boolean; onToggle: () => void }) {
  return (
    <div className="group panel panel-hover overflow-hidden">
      <a href={`https://store.steampowered.com/app/${deal.appid}`} target="_blank" rel="noreferrer" className="relative block aspect-[460/215] overflow-hidden">
        <img src={deal.image} alt="" loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-105" />
        <span className="absolute top-2 left-2 rounded-[3px] bg-acid px-1.5 py-0.5 font-mono text-[11px] font-bold text-black">-{deal.discount}%</span>
      </a>
      <div className="flex items-center gap-2 p-2.5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] text-zinc-100">{deal.name}</div>
          <div className="flex items-baseline gap-2 font-mono">
            <span className="text-[10px] text-zinc-500 line-through">{money(deal.initial, deal.currency)}</span>
            <span className="text-[13px] text-acid-soft">{money(deal.final, deal.currency)}</span>
          </div>
          {deal.endsAt && <div className="font-mono text-[9px] text-zinc-600">{until(deal.endsAt)}</div>}
        </div>
        <button
          onClick={onToggle}
          title={watched ? 'Remover da lista de desejos' : 'Vigiar preço'}
          className={`icon-btn ${watched ? '!text-rose-400' : ''}`}
          aria-label={watched ? 'Remover da lista de desejos' : 'Adicionar à lista de desejos'}
        >
          <Heart className="size-4" fill={watched ? 'currentColor' : 'none'} />
        </button>
      </div>
    </div>
  )
}

// ── Wishlist ─────────────────────────────────────────────────────────────────

function WishlistTab({
  items,
  setItems,
  onWatch,
  onUnwatch
}: {
  items: WishlistItem[]
  setItems: (v: WishlistItem[]) => void
  onWatch: (r: SteamSearchResult) => void
  onUnwatch: (appid: number) => void
}) {
  return (
    <div className="space-y-4">
      <SteamSearch watched={new Set(items.map((i) => i.appid))} onPick={onWatch} />
      <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
        <Bell className="size-3" /> Os preços são conferidos a cada 3 horas. Você recebe uma notificação quando um jogo entra em promoção ou chega no preço que você definir.
      </p>
      {items.length === 0 ? (
        <Empty text="Sua lista está vazia. Busque um jogo acima ou toque no coração de uma promoção." />
      ) : (
        <div className="space-y-2">
          {items.map((w) => (
            <WishRow key={w.appid} item={w} onRemove={() => onUnwatch(w.appid)} onTarget={(target) => setItems(items.map((x) => (x.appid === w.appid ? { ...x, target } : x)))} />
          ))}
        </div>
      )}
    </div>
  )
}

function SteamSearch({ watched, onPick }: { watched: Set<number>; onPick: (r: SteamSearchResult) => void }) {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<SteamSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    if (term.trim().length < 2) {
      setResults([])
      return
    }
    const n = ++seq.current
    setLoading(true)
    const t = setTimeout(async () => {
      const r = await window.uhub.radar.search(term).catch(() => [])
      if (n === seq.current) {
        setResults(r)
        setLoading(false)
      }
    }, 350)
    return () => clearTimeout(t)
  }, [term])

  return (
    <div className="relative max-w-xl">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-zinc-600" />
      <input className="field h-10 pl-9" placeholder="Buscar jogo na Steam para vigiar o preço…" value={term} onChange={(e) => setTerm(e.target.value)} />
      {loading && <Loader2 className="absolute top-1/2 right-3 size-3.5 -translate-y-1/2 animate-spin text-zinc-500" />}
      {results.length > 0 && (
        <div className="panel animate-rise absolute inset-x-0 top-11 z-20 max-h-80 overflow-y-auto !bg-raised/95 p-1">
          {results.map((r) => {
            const has = watched.has(r.appid)
            return (
              <button
                key={r.appid}
                disabled={has}
                onClick={() => {
                  onPick(r)
                  setTerm('')
                }}
                className="flex w-full items-center gap-3 rounded-[2px] px-2 py-1.5 text-left transition-colors hover:bg-white/[0.06] disabled:opacity-50"
              >
                <img src={r.image} alt="" className="h-9 w-[77px] shrink-0 rounded-[2px] object-cover" />
                <span className="flex-1 truncate text-[13px] text-zinc-200">{r.name}</span>
                <span className="font-mono text-[11px] text-zinc-400">{r.final === 0 ? 'Grátis' : money(r.final, r.currency)}</span>
                {has ? <Heart className="size-3.5 text-rose-400" fill="currentColor" /> : <Plus className="size-3.5 text-zinc-500" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function WishRow({ item, onRemove, onTarget }: { item: WishlistItem; onRemove: () => void; onTarget: (cents: number | null) => void }) {
  const [draft, setDraft] = useState(item.target != null ? (item.target / 100).toFixed(2).replace('.', ',') : '')
  const hit = item.target != null && item.final != null && item.final <= item.target
  const commit = (): void => {
    const v = parseFloat(draft.replace(/\./g, '').replace(',', '.'))
    onTarget(Number.isFinite(v) && v > 0 ? Math.round(v * 100) : null)
  }

  return (
    <div className={`panel flex items-center gap-4 p-2.5 ${item.discount > 0 || hit ? '!border-acid/30' : ''}`}>
      <a href={`https://store.steampowered.com/app/${item.appid}`} target="_blank" rel="noreferrer" className="shrink-0">
        <img src={item.image} alt="" className="h-[52px] w-[111px] rounded-[2px] object-cover" />
      </a>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] text-zinc-100">{item.name}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-[11px]">
          {item.checkedAt == null ? (
            <span className="flex items-center gap-1 text-zinc-500">
              <Loader2 className="size-3 animate-spin" /> conferindo preço…
            </span>
          ) : item.final == null ? (
            <span className="text-zinc-500">sem preço nesta região</span>
          ) : (
            <>
              {item.discount > 0 && <span className="text-zinc-500 line-through">{money(item.initial, item.currency)}</span>}
              <span className={item.discount > 0 || hit ? 'text-acid-soft' : 'text-zinc-200'}>{item.final === 0 ? 'Grátis' : money(item.final, item.currency)}</span>
              {item.discount > 0 && <span className="rounded-[2px] bg-acid/20 px-1 text-[10px] text-acid-soft">-{item.discount}%</span>}
              {hit && <span className="rounded-[2px] bg-volt/20 px-1 text-[10px] text-volt-100">NO SEU PREÇO</span>}
              {item.lowest != null && item.lowest < (item.final ?? Infinity) && <span className="text-zinc-600">menor visto: {money(item.lowest, item.currency)}</span>}
            </>
          )}
        </div>
      </div>
      <label className="flex items-center gap-2 font-mono text-[10px] text-zinc-500">
        Avisar abaixo de
        <input
          className="field h-8 w-24 text-right"
          inputMode="decimal"
          placeholder="qualquer"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        />
      </label>
      <button className="icon-btn hover:!text-rose-300" onClick={onRemove} aria-label="Remover da lista">
        <Trash2 className="size-3.5" />
      </button>
    </div>
  )
}

// ── Shared bits ──────────────────────────────────────────────────────────────

export function Empty({ text }: { text: string }) {
  return <div className="panel px-6 py-10 text-center text-[12px] text-zinc-500">{text}</div>
}

export function Loading({ label }: { label: string }) {
  return (
    <div className="panel flex items-center justify-center gap-2 px-6 py-10 text-[12px] text-zinc-500">
      <Loader2 className="size-4 animate-spin" /> {label}
    </div>
  )
}
